import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { dbPrimary } from '../firebase';
import { decryptData } from '../utils/crypto';
import { saveImageToCache, getImageFromCache, removeImageFromCache, getAllImagesFromCache, saveToTrash } from '../utils/db';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import ImageUploader from './ImageUploader';
import ConfirmModal from './ConfirmModal';
import TrashModal from './TrashModal';
import SettingsModal from './SettingsModal';
import Toast, { ToastType } from './Toast';
import { Lock, LogOut, Trash2, X, Download, Maximize2, Minimize2, Maximize, Minimize, Loader2, Settings, DownloadCloud, Shield, Plus, ChevronLeft, ChevronRight, Check, CheckSquare, Wand2, Image as ImageIcon } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { motion, AnimatePresence } from 'motion/react';

import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface EncryptedImage {
  id: string;
  ciphertext?: string;
  iv?: string;
  createdAt: any;
}

interface DecryptedImage {
  id: string;
  url: string;
  failed?: boolean;
  createdAt: number;
}

export default function Gallery() {
  const { user, cryptoKey, logOut, lockVault, isAuthReady, securityImageId, extraPassword, setSecurityImage } = useAuth();
  const { isInstallable, promptToInstall, isInIframe } = useInstallPrompt();
  const [images, setImages] = useState<DecryptedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imageFit, setImageFit] = useState<'contain' | 'cover'>('contain');
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [duplicatesToDelete, setDuplicatesToDelete] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [extraPasswordInput, setExtraPasswordInput] = useState('');
  const [isPromptingExtra, setIsPromptingExtra] = useState<string | null>(null);
  const [isExtraUnlocked, setIsExtraUnlocked] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const decryptedCache = useRef<Map<string, string>>(new Map());

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!cryptoKey) {
      setIsExtraUnlocked(false);
    }
  }, [cryptoKey]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    // Clear cache when cryptoKey changes to avoid using wrong key for old data
    decryptedCache.current.clear();
    if (!cryptoKey) {
      setIsExtraUnlocked(false);
    }
  }, [cryptoKey]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (selectedImage && showControls) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [selectedImage, showControls]);

  useEffect(() => {
    if (!isAuthReady || !user || !cryptoKey) return;
    
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const loadImages = async () => {
      setLoading(true);
      
      try {
        // 1. Load all images from local IndexedDB cache first (0 Firestore reads!)
        const cachedImages = await getAllImagesFromCache();
        
        const getTimestamp = (ca: any) => ca instanceof Date ? ca.getTime() : (ca?.toMillis ? ca.toMillis() : (ca?.seconds ? ca.seconds * 1000 : Date.now()));

        // Sort cached images by createdAt descending
        cachedImages.sort((a, b) => {
          const timeA = getTimestamp(a.createdAt);
          const timeB = getTimestamp(b.createdAt);
          return timeB - timeA;
        });

        const newDecryptedImages: DecryptedImage[] = [];
        
        for (const img of cachedImages) {
          const createdAt = getTimestamp(img.createdAt);
          if (decryptedCache.current.has(img.id)) {
            newDecryptedImages.push({
              id: img.id,
              url: decryptedCache.current.get(img.id)!,
              createdAt
            });
            continue;
          }

          try {
            if (img.ciphertext && img.iv) {
              const decryptedBase64 = await decryptData(img.ciphertext, img.iv, cryptoKey);
              decryptedCache.current.set(img.id, decryptedBase64);
              newDecryptedImages.push({
                id: img.id,
                url: decryptedBase64,
                createdAt
              });
            }
          } catch (e) {
            console.error('Failed to decrypt cached image', img.id, e);
            newDecryptedImages.push({
              id: img.id,
              url: '',
              failed: true,
              createdAt
            });
          }
        }
        
        if (isMounted) {
          setImages(newDecryptedImages);
          setLoading(false);
        }

        // 1.5. Try to re-fetch failed images from Firestore to repair them
        const failedImages = newDecryptedImages.filter(img => img.failed);
        if (failedImages.length > 0) {
          for (const failedImg of failedImages) {
            if (!isMounted) break;
            try {
              const docRef = doc(dbPrimary, 'images', failedImg.id);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                const imgData = docSnap.data();
                let ciphertext = imgData.ciphertext;
                let iv = imgData.iv;
                
                if (!ciphertext && !iv && imgData.data) {
                  try {
                    const parsed = JSON.parse(imgData.data);
                    ciphertext = parsed.ciphertext;
                    iv = parsed.iv;
                  } catch (e) {
                    console.warn('Failed to parse imgData.data during repair', e);
                  }
                }

                if (ciphertext && iv) {
                  const decryptedBase64 = await decryptData(ciphertext, iv, cryptoKey);
                  // Success! Update cache and state
                  await saveImageToCache({
                    id: failedImg.id,
                    ciphertext,
                    iv,
                    createdAt: imgData.createdAt
                  });
                  decryptedCache.current.set(failedImg.id, decryptedBase64);
                  if (isMounted) {
                    setImages(prev => prev.map(img => 
                      img.id === failedImg.id ? { ...img, url: decryptedBase64, failed: false } : img
                    ));
                  }
                }
              } else {
                // Image doesn't exist in Firestore anymore, remove from cache
                await removeImageFromCache(failedImg.id);
                if (isMounted) {
                  setImages(prev => prev.filter(img => img.id !== failedImg.id));
                }
              }
            } catch (e) {
              console.error('Failed to repair image', failedImg.id, e);
            }
          }
        }

        // 2. Listen ONLY for new images in Firestore to save reads
        let latestDate = null;
        if (cachedImages.length > 0) {
          latestDate = cachedImages[0].createdAt;
        }

        let q;
        if (latestDate) {
          q = query(
            collection(dbPrimary, 'images'),
            where('userId', '==', user.uid),
            where('createdAt', '>', latestDate),
            orderBy('createdAt', 'desc')
          );
        } else {
          q = query(
            collection(dbPrimary, 'images'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          );
        }

        const unsub = onSnapshot(q, async (snapshot) => {
          if (snapshot.empty) return; // No new images, no extra processing

          const fetchedImages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as any[];

          const newFetchedDecrypted: DecryptedImage[] = [];
          
          for (const img of fetchedImages) {
            const createdAt = getTimestamp(img.createdAt);
            if (decryptedCache.current.has(img.id)) {
              newFetchedDecrypted.push({
                id: img.id,
                url: decryptedCache.current.get(img.id)!,
                createdAt
              });
              continue;
            }

            try {
              let ciphertext = img.ciphertext;
              let iv = img.iv;

              if (!ciphertext && !iv && img.data) {
                try {
                  const parsed = JSON.parse(img.data);
                  ciphertext = parsed.ciphertext;
                  iv = parsed.iv;
                } catch (e) {
                  console.warn('Failed to parse img.data', e);
                }
              }

              // Save new image to local cache
              await saveImageToCache({
                id: img.id,
                ciphertext,
                iv,
                createdAt: img.createdAt
              });

              if (ciphertext && iv) {
                const decryptedBase64 = await decryptData(ciphertext, iv, cryptoKey);
                decryptedCache.current.set(img.id, decryptedBase64);
                newFetchedDecrypted.push({
                  id: img.id,
                  url: decryptedBase64,
                  createdAt
                });
              }
            } catch (e) {
              console.error('Failed to decrypt new image', img.id, e);
              newFetchedDecrypted.push({
                id: img.id,
                url: '',
                failed: true,
                createdAt
              });
            }
          }
          
          if (isMounted && newFetchedDecrypted.length > 0) {
            setImages(prev => {
              const combined = [...newFetchedDecrypted, ...prev];
              // Remove duplicates
              const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
              // Sort again just to be sure
              unique.sort((a, b) => b.createdAt - a.createdAt);
              return unique;
            });
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'images');
        });

        if (!isMounted) {
          unsub();
        } else {
          unsubscribe = unsub;
        }

      } catch (err) {
        console.error("Error loading images from cache:", err);
        if (isMounted) setLoading(false);
      }
    };

    loadImages();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user, cryptoKey, isAuthReady]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const imageId = url.searchParams.get('image');
    if (imageId && images.length > 0 && !selectedImage) {
      const img = images.find(i => i.id === imageId);
      if (img) {
        setSelectedImage(img.url);
        setSelectedImageId(img.id);
        setShowControls(true);
      }
    }
  }, [images, selectedImage]);

  const handleNextImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedImageId) return;
    const currentIndex = images.findIndex(img => img.id === selectedImageId);
    if (currentIndex < images.length - 1) {
      const nextImg = images[currentIndex + 1];
      setSelectedImage(nextImg.url);
      setSelectedImageId(nextImg.id);
      const url = new URL(window.location.href);
      url.searchParams.set('image', nextImg.id);
      window.history.replaceState({}, '', url);
    }
  };

  const handlePrevImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedImageId) return;
    const currentIndex = images.findIndex(img => img.id === selectedImageId);
    if (currentIndex > 0) {
      const prevImg = images[currentIndex - 1];
      setSelectedImage(prevImg.url);
      setSelectedImageId(prevImg.id);
      const url = new URL(window.location.href);
      url.searchParams.set('image', prevImg.id);
      window.history.replaceState({}, '', url);
    }
  };

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isUploaderOpen) setIsDraggingGlobal(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only set to false if we're leaving the window, not just an element
      if (e.relatedTarget === null) {
        setIsDraggingGlobal(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingGlobal(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        setDroppedFiles(files);
        setIsUploaderOpen(true);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [isUploaderOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Global shortcuts
      if (e.ctrlKey && e.key === 'a' && !selectedImage && !isUploaderOpen && !isSettingsOpen) {
        e.preventDefault();
        setIsSelectionMode(true);
        setSelectedForDeletion(images.map(img => img.id));
      }

      if (e.key === 'Delete' && isSelectionMode && selectedForDeletion.length > 0) {
        setIsDeletingMultiple(true);
      }

      if (!selectedImage) {
        if (e.key.toLowerCase() === 'f' && images.length > 0 && !isUploaderOpen && !isSettingsOpen) {
          e.preventDefault();
          const firstImg = images[0];
          setSelectedImage(firstImg.url);
          setSelectedImageId(firstImg.id);
          setShowControls(true);
          const url = new URL(window.location.href);
          url.searchParams.set('image', firstImg.id);
          window.history.replaceState({}, '', url);
        }
        return;
      }
      
      if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(console.error);
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(console.error);
          }
        }
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(console.error);
        }
        setSelectedImage(null);
        setSelectedImageId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('image');
        window.history.replaceState({}, '', url);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, selectedImageId, images, isSelectionMode, selectedForDeletion, isUploaderOpen, isSettingsOpen]);

  const handleDelete = async () => {
    if (!imageToDelete) return;
    const id = imageToDelete;
    
    // Optimistic UI update
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedImageId === id) {
      setSelectedImage(null);
      setSelectedImageId(null);
    }
    setImageToDelete(null);

    try {
      const cachedImage = await getImageFromCache(id);
      if (cachedImage) {
        await saveToTrash({
          ...cachedImage,
          deletedAt: Date.now()
        });
      }

      await removeImageFromCache(id);
      try {
        await deleteDoc(doc(dbPrimary, 'images', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `images/${id}`);
      }
      showToast('Imagem movida para a lixeira!');
    } catch (error) {
      console.error('Erro ao excluir imagem:', error);
      showToast('Erro ao excluir imagem.', 'error');
    }
  };

  const handleDeleteMultiple = async () => {
    setIsDeletingMultiple(false);
    setLoading(true);
    const ids = [...selectedForDeletion];
    
    // Optimistic UI update
    setImages(prev => prev.filter(img => !ids.includes(img.id)));
    setSelectedForDeletion([]);
    setIsSelectionMode(false);

    try {
      for (const id of ids) {
        const cachedImage = await getImageFromCache(id);
        if (cachedImage) {
          await saveToTrash({
            ...cachedImage,
            deletedAt: Date.now()
          });
        }

        await removeImageFromCache(id);
        try {
          await deleteDoc(doc(dbPrimary, 'images', id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `images/${id}`);
        }
      }
      showToast(`${ids.length} imagens movidas para a lixeira!`);
    } catch (error) {
      console.error('Erro ao excluir imagens:', error);
      showToast('Erro ao excluir imagens.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    setIsCleaningDuplicates(false);
    setLoading(true);
    const ids = [...duplicatesToDelete];
    
    // Optimistic UI update
    setImages(prev => prev.filter(img => !ids.includes(img.id)));
    setDuplicatesToDelete([]);
    setIsSelectionMode(false);

    try {
      for (const id of ids) {
        const cachedImage = await getImageFromCache(id);
        if (cachedImage) {
          await saveToTrash({
            ...cachedImage,
            deletedAt: Date.now()
          });
        }

        await removeImageFromCache(id);
        try {
          await deleteDoc(doc(dbPrimary, 'images', id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `images/${id}`);
        }
      }
      showToast(`${ids.length} duplicatas movidas para a lixeira!`);
    } catch (error) {
      console.error('Erro ao limpar duplicatas:', error);
      showToast('Erro ao limpar duplicatas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (img: DecryptedImage, index: number, e: React.MouseEvent) => {
    if (isSelectionMode) {
      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = images.slice(start, end + 1).map(i => i.id);
        setSelectedForDeletion(prev => {
          const newSet = new Set(prev);
          rangeIds.forEach(id => newSet.add(id));
          return Array.from(newSet);
        });
      } else {
        setSelectedForDeletion(prev => 
          prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id]
        );
      }
      setLastSelectedIndex(index);
      return;
    }
    if (img.failed) return;

    // Check if it's the security image and if it's locked
    if (img.id === securityImageId && !isExtraUnlocked && extraPassword) {
      setIsPromptingExtra(img.id);
      return;
    }

    setSelectedImage(img.url);
    setSelectedImageId(img.id);
    setShowControls(true);
    const url = new URL(window.location.href);
    url.searchParams.set('image', img.id);
    window.history.replaceState({}, '', url);
  };

  const handleExtraPasswordSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (extraPasswordInput === extraPassword) {
      setIsExtraUnlocked(true);
      const img = images.find(i => i.id === isPromptingExtra);
      if (img) {
        setSelectedImage(img.url);
        setSelectedImageId(img.id);
        setShowControls(true);
        const url = new URL(window.location.href);
        url.searchParams.set('image', img.id);
        window.history.replaceState({}, '', url);
      }
      setIsPromptingExtra(null);
      setExtraPasswordInput('');
    } else {
      showToast('Senha extra incorreta', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-white/20 flex">
      {/* Global Drag Overlay */}
      <AnimatePresence>
        {isDraggingGlobal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/10 backdrop-blur-md flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white text-black px-8 py-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 border border-white/20">
              <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center">
                <Plus size={32} strokeWidth={2.5} />
              </div>
              <p className="text-xl font-bold tracking-tight">Solte para Adicionar Fotos</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col sticky top-0 h-screen border-r border-white/5 bg-[#050505] p-6 shrink-0">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-lg">
            <Shield size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Cloud Gallery</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => {
              setIsSelectionMode(false);
              setSelectedForDeletion([]);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 text-white font-medium transition-all hover:bg-white/10"
          >
            <ImageIcon size={20} />
            Your Gallery
          </button>
          <button 
            onClick={() => setIsTrashOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-400 font-medium transition-all hover:bg-white/5 hover:text-white"
          >
            <Trash2 size={20} />
            Lixeira
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-400 font-medium transition-all hover:bg-white/5 hover:text-white"
          >
            <Settings size={20} />
            Configurações
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5 space-y-2">
          <button 
            onClick={lockVault}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-400 font-medium transition-all hover:bg-white/5 hover:text-white"
          >
            <Lock size={20} />
            Bloquear Cofre
          </button>
          <button 
            onClick={logOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-400 font-medium transition-all hover:bg-white/5 hover:text-red-400"
          >
            <LogOut size={20} />
            Sair da Conta
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <ConfirmModal
          isOpen={!!imageToDelete}
          onClose={() => setImageToDelete(null)}
          onConfirm={handleDelete}
          title="Excluir Imagem"
          message="Tem certeza que deseja excluir esta imagem permanentemente?"
          confirmText="Excluir"
          cancelText="Cancelar"
        />
        <ConfirmModal
          isOpen={isDeletingMultiple}
          onClose={() => setIsDeletingMultiple(false)}
          onConfirm={handleDeleteMultiple}
          title="Excluir Imagens"
          message={`Tem certeza que deseja excluir ${selectedForDeletion.length} imagens permanentemente?`}
          confirmText="Excluir"
          cancelText="Cancelar"
        />
        <ConfirmModal
          isOpen={isCleaningDuplicates}
          onClose={() => setIsCleaningDuplicates(false)}
          onConfirm={handleCleanDuplicates}
          title="Limpar Duplicatas"
          message={`Encontramos ${duplicatesToDelete.length} imagens duplicadas. Deseja excluí-las permanentemente para liberar espaço?`}
          confirmText="Limpar"
          cancelText="Cancelar"
        />
        
        <TrashModal 
          isOpen={isTrashOpen} 
          onClose={() => setIsTrashOpen(false)} 
        />

        <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-2xl border-b border-white/5 px-3 sm:px-6 h-14 sm:h-20 flex items-center justify-between safe-top">
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="md:hidden flex items-center gap-1.5 sm:gap-3 px-1.5 sm:px-3 py-1.5 -ml-1 sm:-ml-3 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white group"
            >
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-8 h-8 sm:w-10 sm:h-10 bg-white/5 group-hover:bg-white/10 rounded-xl flex items-center justify-center shadow-lg transition-colors border border-white/5"
              >
                <Settings size={16} className="sm:w-5 sm:h-5" strokeWidth={2} />
              </motion.div>
              <span className="hidden min-[400px]:block text-sm sm:text-lg font-semibold tracking-tight">Config</span>
            </button>
            <div className="hidden md:block">
              <h2 className="text-2xl font-bold tracking-tight text-white">Your Gallery</h2>
              <p className="text-sm text-zinc-500 font-medium">{images.length} fotos protegidas</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                setSelectedForDeletion([]);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium mr-1 sm:mr-2 ${isSelectionMode ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
              title={isSelectionMode ? 'Concluir seleção' : 'Selecionar múltiplas fotos'}
            >
              <CheckSquare size={16} />
              <span className="hidden sm:inline">{isSelectionMode ? 'Concluir' : 'Selecionar'}</span>
            </button>
            <button
              onClick={() => {
                if (isInstallable) {
                  promptToInstall();
                } else if (isInIframe) {
                  showToast('Abra em uma nova aba para instalar o app.', 'info');
                } else {
                  showToast('Use o menu do navegador "Adicionar à Tela de Início".', 'info');
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors text-xs sm:text-sm font-medium"
              title="Instalar aplicativo"
            >
              <DownloadCloud size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden min-[450px]:inline">Instalar</span>
            </button>
            <button
              onClick={lockVault}
              className="p-1.5 sm:p-3 text-zinc-400 hover:bg-white/10 hover:text-white rounded-full transition-all active:scale-90"
              title="Bloquear Cofre"
            >
              <Lock size={18} className="sm:w-[22px] sm:h-[22px]" />
            </button>
            <button
              onClick={logOut}
              className="p-1.5 sm:p-3 text-zinc-400 hover:bg-white/10 hover:text-red-400 rounded-full transition-all active:scale-90"
              title="Sair da Conta"
            >
              <LogOut size={18} className="sm:w-[22px] sm:h-[22px]" />
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-1.5 sm:p-4 pb-24 sm:pb-32 w-full">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-4">
              {[...Array(18)].map((_, i) => (
                <div key={i} className="aspect-square bg-white/5 rounded-xl sm:rounded-2xl animate-pulse border border-white/5" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-32 sm:py-48 text-zinc-500 space-y-6 px-4 flex flex-col items-center"
            >
              <div className="relative">
                {/* <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full" /> */}
                <div className="relative w-24 h-24 bg-gradient-to-b from-white/10 to-white/5 rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl">
                  <Shield size={40} className="text-white/50" strokeWidth={1.5} />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-medium text-zinc-200 tracking-tight">Cofre Vazio</h3>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  Suas fotos criptografadas aparecerão aqui. Ninguém mais tem acesso a elas.
                </p>
                <button 
                  onClick={() => setIsUploaderOpen(true)}
                  className="mt-4 px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
                >
                  Adicionar Primeira Foto
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-4">
              {images.map((img, index) => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`aspect-square bg-zinc-900 cursor-pointer group relative overflow-hidden rounded-xl sm:rounded-2xl shadow-lg ring-1 transition-all ${isSelectionMode && selectedForDeletion.includes(img.id) ? 'ring-white ring-2 scale-[0.98]' : 'ring-white/10 hover:ring-white/30'}`}
                  onClick={(e) => handleImageClick(img, index, e)}
                >
                  {img.failed ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-2 text-center">
                      <Lock size={24} className="mb-1 opacity-20" />
                      <span className="text-[10px] font-bold uppercase tracking-tighter">Erro</span>
                    </div>
                  ) : img.id === securityImageId && !isExtraUnlocked && extraPassword ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 group-hover:text-white transition-colors">
                      <div className="relative">
                        {/* <div className="absolute inset-0 bg-white/5 blur-xl rounded-full" /> */}
                        <Lock size={32} className="relative z-10" strokeWidth={1.5} />
                      </div>
                      <span className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-50">Protegida</span>
                    </div>
                  ) : (
                    <img 
                      src={img.url} 
                      alt="" 
                      className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-90 select-none"
                      referrerPolicy="no-referrer"
                      onContextMenu={(e) => e.preventDefault()}
                      draggable={false}
                    />
                  )}
                  
                  {isSelectionMode && (
                    <div className="absolute inset-0 bg-black/10 z-10 flex items-start justify-start p-2 sm:p-3 transition-colors">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedForDeletion.includes(img.id) ? 'bg-white border-white' : 'border-white/70 bg-black/40'}`}>
                        {selectedForDeletion.includes(img.id) && <Check size={14} className="text-black" />}
                      </div>
                    </div>
                  )}

                  {!isSelectionMode && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageToDelete(img.id);
                        }}
                        className="p-2 sm:p-2.5 bg-black/40 hover:bg-red-500/90 text-white rounded-xl backdrop-blur-md transition-all active:scale-90 border border-white/10 hover:border-red-500"
                        title="Excluir"
                      >
                        <Trash2 size={16} className="sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Floating Action Button */}
      <AnimatePresence>
        {!isSelectionMode && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsUploaderOpen(true)}
            className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 h-14 sm:h-16 px-4 sm:px-6 bg-white text-black rounded-full shadow-xl flex items-center justify-center z-40 gap-2 sm:gap-3 font-medium transition-all border border-white/20"
          >
            <Plus size={24} className="sm:w-6 sm:h-6" strokeWidth={2.5} />
            <span className="hidden sm:block text-base font-bold tracking-tight pr-2">Adicionar Fotos</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Selection Mode Bottom Bar */}
      <AnimatePresence>
        {isSelectionMode && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/10 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between z-40 gap-4"
          >
            <div className="flex items-center justify-between w-full sm:w-auto gap-4">
              <span className="text-white font-medium text-lg">{selectedForDeletion.length} selecionadas</span>
              <button
                onClick={() => {
                  if (selectedForDeletion.length === images.length) {
                    setSelectedForDeletion([]);
                  } else {
                    setSelectedForDeletion(images.map(img => img.id));
                  }
                }}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {selectedForDeletion.length === images.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </button>
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              <button 
                onClick={() => {
                  const urlMap = new Map<string, string[]>();
                  images.forEach(img => {
                    if (!img.failed && img.url) {
                      const existing = urlMap.get(img.url) || [];
                      urlMap.set(img.url, [...existing, img.id]);
                    }
                  });
                  const idsToDelete: string[] = [];
                  urlMap.forEach(ids => {
                    if (ids.length > 1) {
                      idsToDelete.push(...ids.slice(1));
                    }
                  });
                  if (idsToDelete.length === 0) {
                    showToast('Nenhuma imagem duplicada encontrada.', 'info');
                  } else {
                    setDuplicatesToDelete(idsToDelete);
                    setIsCleaningDuplicates(true);
                  }
                }}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2.5 text-zinc-900 bg-emerald-400 hover:bg-emerald-500 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Wand2 size={18} />
                <span className="text-sm sm:text-base">Limpar Duplicatas</span>
              </button>
              <button 
                onClick={() => setIsDeletingMultiple(true)} 
                disabled={selectedForDeletion.length === 0}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={18} />
                <span className="text-sm sm:text-base">Excluir</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extra Password Prompt */}
      <AnimatePresence>
        {isPromptingExtra && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 rounded-[2rem] p-8 border border-white/10 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10">
                <Lock size={32} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Imagem Protegida</h2>
                <p className="text-sm text-zinc-500">Esta imagem requer uma senha extra para ser visualizada.</p>
              </div>
              <div 
                className="space-y-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExtraPasswordSubmit();
                  }
                }}
              >
                <input
                  autoFocus
                  type="text"
                  name="extra-secure-input"
                  id="extra-secure-input"
                  style={{ WebkitTextSecurity: 'disc' }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={extraPasswordInput}
                  onChange={(e) => setExtraPasswordInput(e.target.value)}
                  placeholder="Digite aqui"
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-center placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPromptingExtra(null);
                      setExtraPasswordInput('');
                    }}
                    className="flex-1 py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtraPasswordSubmit()}
                    className="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all"
                  >
                    Desbloquear
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploader Modal */}
      <AnimatePresence>
        {isUploaderOpen && (
          <motion.div 
            key="uploader-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
          >
            <div
              onClick={() => !isUploading && setIsUploaderOpen(false)}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ 
                type: "spring", 
                damping: 30, 
                stiffness: 300,
                mass: 0.8
              }}
              style={{ willChange: "transform" }}
              className="relative w-full max-w-lg bg-[#0a0a0a] rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden border-t md:border border-white/10 flex flex-col h-[85dvh] md:h-auto md:max-h-[90vh] ring-1 ring-white/5"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-semibold text-white">Adicionar Fotos</h2>
                <button 
                  onClick={() => !isUploading && setIsUploaderOpen(false)}
                  disabled={isUploading}
                  className={`p-2 rounded-full transition-colors ${isUploading ? 'text-zinc-600 cursor-not-allowed' : 'hover:bg-white/5 text-zinc-400'}`}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col">
                <ImageUploader 
                  onComplete={() => {
                    setIsUploaderOpen(false);
                    setDroppedFiles([]);
                  }} 
                  onUploadingStateChange={setIsUploading}
                  initialFiles={droppedFiles}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedImage && (
          <motion.div
            key="fullscreen-image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center p-0"
            onClick={async () => {
              if (document.fullscreenElement && document.exitFullscreen) {
                try {
                  await document.exitFullscreen();
                } catch (err) {
                  console.error(err);
                }
              }
              setSelectedImage(null);
              setSelectedImageId(null);
              const url = new URL(window.location.href);
              url.searchParams.delete('image');
              window.history.replaceState({}, '', url);
            }}
          >
            <AnimatePresence>
              {showControls && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 sm:gap-4 z-10"
                >
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        if (!document.fullscreenElement) {
                          await document.documentElement.requestFullscreen();
                        } else {
                          if (document.exitFullscreen) {
                            await document.exitFullscreen();
                          }
                        }
                      } catch (err) {
                        console.error("Erro ao tentar tela cheia:", err);
                      }
                    }}
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                  >
                    {isFullscreen ? <Minimize2 size={20} className="sm:w-6 sm:h-6" /> : <Maximize2 size={20} className="sm:w-6 sm:h-6" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageFit(prev => prev === 'contain' ? 'cover' : 'contain');
                    }}
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    title={imageFit === 'contain' ? "Preencher Tela" : "Ajustar à Tela"}
                  >
                    {imageFit === 'contain' ? <Maximize size={20} className="sm:w-6 sm:h-6" /> : <Minimize size={20} className="sm:w-6 sm:h-6" />}
                  </button>
                  <a 
                    href={selectedImage} 
                    download={`secure-image-${Date.now()}.png`}
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    onClick={(e) => e.stopPropagation()}
                    title="Baixar Imagem"
                  >
                    <Download size={20} className="sm:w-6 sm:h-6" />
                  </a>
                  <button 
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (document.fullscreenElement && document.exitFullscreen) {
                        try {
                          await document.exitFullscreen();
                        } catch (err) {
                          console.error(err);
                        }
                      }
                      setSelectedImage(null);
                      setSelectedImageId(null);
                      // Remove query param
                      const url = new URL(window.location.href);
                      url.searchParams.delete('image');
                      window.history.replaceState({}, '', url);
                    }}
                  >
                    <X size={20} className="sm:w-6 sm:h-6" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div 
              className="w-full h-full flex items-center justify-center relative touch-none"
              onClick={(e) => {
                e.stopPropagation();
                setShowControls(prev => !prev);
              }}
              onTouchStart={(e) => {
                if (isZoomed) return;
                touchStartX.current = e.touches[0].clientX;
                touchStartY.current = e.touches[0].clientY;
              }}
              onTouchEnd={(e) => {
                if (!touchStartX.current || !touchStartY.current || isZoomed) return;
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                const distanceX = touchStartX.current - touchEndX;
                const distanceY = touchStartY.current - touchEndY;
                
                if (Math.abs(distanceX) > Math.abs(distanceY)) {
                  // Horizontal swipe
                  if (distanceX > 70) {
                    handleNextImage();
                  } else if (distanceX < -70) {
                    handlePrevImage();
                  }
                } else {
                  // Vertical swipe
                  if (distanceY < -100 || distanceY > 100) {
                    if (document.fullscreenElement && document.exitFullscreen) {
                      document.exitFullscreen().catch(console.error);
                    }
                    setSelectedImage(null);
                    setSelectedImageId(null);
                    const url = new URL(window.location.href);
                    url.searchParams.delete('image');
                    window.history.replaceState({}, '', url);
                  }
                }
                touchStartX.current = null;
                touchStartY.current = null;
              }}
            >
              <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={5}
                centerOnInit
                wheel={{ step: 0.1 }}
                doubleClick={{ disabled: false, step: 0.5 }}
                panning={{ disabled: !isZoomed }}
                onTransformed={(ref) => {
                  const zoomed = ref.state.scale > 1.01;
                  if (zoomed !== isZoomed) {
                    setIsZoomed(zoomed);
                  }
                }}
              >
                <TransformComponent 
                  wrapperClass="!w-full !h-full" 
                  contentClass="!w-full !h-full flex items-center justify-center"
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: "100%", height: "100%" }}
                >
                  <motion.img
                    key={selectedImageId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    src={selectedImage}
                    alt="Full screen"
                    className={`w-full h-full select-none cursor-grab active:cursor-grabbing transition-all duration-300 ${imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </TransformComponent>
              </TransformWrapper>
              
              <AnimatePresence>
                {showControls && (
                  <>
                    <motion.button
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevImage(e as any);
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90 hidden sm:block"
                    >
                      <ChevronLeft size={32} />
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextImage(e as any);
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90 hidden sm:block"
                    >
                      <ChevronRight size={32} />
                    </motion.button>
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <Toast 
            key="toast-message"
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        images={images}
        onOpenTrash={() => setIsTrashOpen(true)}
      />
    </div>
  );
}
