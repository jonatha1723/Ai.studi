import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData } from '../utils/crypto';
import { saveImageToCache, getImageFromCache, removeImageFromCache, getAllImagesFromCache } from '../utils/db';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import ImageUploader from './ImageUploader';
import ConfirmModal from './ConfirmModal';
import SettingsModal from './SettingsModal';
import Toast, { ToastType } from './Toast';
import { Lock, LogOut, Trash2, X, Download, Link as LinkIcon, Maximize2, Minimize2, Loader2, Settings, DownloadCloud, Shield, Plus, ChevronLeft, ChevronRight, Check, CheckSquare, Wand2 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { motion, AnimatePresence } from 'motion/react';

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
  const { isInstallable, promptToInstall } = useInstallPrompt();
  const [images, setImages] = useState<DecryptedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [duplicatesToDelete, setDuplicatesToDelete] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [extraPasswordInput, setExtraPasswordInput] = useState('');
  const [isPromptingExtra, setIsPromptingExtra] = useState<string | null>(null);
  const [isExtraUnlocked, setIsExtraUnlocked] = useState(false);
  const touchStartX = useRef<number | null>(null);
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

        // 2. Listen ONLY for new images in Firestore to save reads
        let latestDate = null;
        if (cachedImages.length > 0) {
          latestDate = cachedImages[0].createdAt;
        }

        let q;
        if (latestDate) {
          q = query(
            collection(db, 'images'),
            where('userId', '==', user.uid),
            where('createdAt', '>', latestDate),
            orderBy('createdAt', 'desc')
          );
        } else {
          q = query(
            collection(db, 'images'),
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
          console.error('Erro ao buscar novas imagens:', error);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'ArrowLeft') {
        handlePrevImage();
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
  }, [selectedImage, selectedImageId, images]);

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
      await removeImageFromCache(id);
      try {
        await deleteDoc(doc(db, 'images', id));
      } catch (e) {
        console.warn('Firestore delete failed, might already be deleted:', e);
      }
      showToast('Imagem excluída com sucesso!');
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
        await removeImageFromCache(id);
        try {
          await deleteDoc(doc(db, 'images', id));
        } catch (e) {
          console.warn(`Firestore delete failed for ${id}:`, e);
        }
      }
      showToast(`${ids.length} imagens excluídas com sucesso!`);
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
        await removeImageFromCache(id);
        try {
          await deleteDoc(doc(db, 'images', id));
        } catch (e) {
          console.warn(`Firestore delete failed for ${id}:`, e);
        }
      }
      showToast(`${ids.length} duplicatas removidas com sucesso!`);
    } catch (error) {
      console.error('Erro ao limpar duplicatas:', error);
      showToast('Erro ao limpar duplicatas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (img: DecryptedImage) => {
    if (isSelectionMode) {
      setSelectedForDeletion(prev => 
        prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id]
      );
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

  const handleExtraPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-white/20">
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
      
      <header className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-2xl border-b border-white/5 px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 -ml-2 sm:-ml-3 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white group"
          >
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-white/5 group-hover:bg-white/10 rounded-xl flex items-center justify-center shadow-lg transition-colors border border-white/5"
            >
              <Settings size={18} className="sm:w-5 sm:h-5" strokeWidth={2} />
            </motion.div>
            <span className="hidden sm:block text-base sm:text-lg font-semibold tracking-tight">Configurações</span>
          </button>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedForDeletion([]);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium mr-1 sm:mr-2 ${isSelectionMode ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            <CheckSquare size={16} />
            <span className="hidden sm:inline">{isSelectionMode ? 'Concluir' : 'Selecionar'}</span>
          </button>
          <button
            onClick={() => {
              if (isInstallable) {
                promptToInstall();
              } else {
                showToast('Para instalar: use o menu do navegador "Adicionar à Tela de Início" ou o ícone na barra de endereços.', 'info');
              }
            }}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 rounded-full transition-colors text-sm font-medium mr-2"
          >
            <DownloadCloud size={16} />
            Instalar App
          </button>
          <button
            onClick={lockVault}
            className="p-2 sm:p-3 text-zinc-400 hover:bg-white/10 hover:text-white rounded-full transition-all active:scale-90"
            title="Bloquear"
          >
            <Lock size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
          <button
            onClick={logOut}
            className="p-2 sm:p-3 text-zinc-400 hover:bg-white/10 hover:text-red-400 rounded-full transition-all active:scale-90"
            title="Sair"
          >
            <LogOut size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-2 sm:p-4 pb-24 sm:pb-32">
        {loading ? (
          <div className="grid grid-cols-2 min-[375px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-4">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="aspect-[4/5] sm:aspect-square bg-white/5 rounded-2xl animate-pulse border border-white/5" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-32 sm:py-48 text-zinc-500 space-y-6 px-4 flex flex-col items-center"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full" />
              <div className="relative w-24 h-24 bg-gradient-to-b from-white/10 to-white/5 rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl">
                <Shield size={40} className="text-white/50" strokeWidth={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-medium text-zinc-200 tracking-tight">Cofre Vazio</h3>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                Suas fotos criptografadas aparecerão aqui. Ninguém mais tem acesso a elas.
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 min-[375px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-4">
            {images.map((img) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`aspect-[4/5] sm:aspect-square bg-zinc-900 cursor-pointer group relative overflow-hidden rounded-2xl shadow-lg ring-1 transition-all ${isSelectionMode && selectedForDeletion.includes(img.id) ? 'ring-blue-500 ring-2 scale-[0.98]' : 'ring-white/10 hover:ring-white/30'}`}
                onClick={() => handleImageClick(img)}
              >
                {img.failed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-2 text-center">
                    <Lock size={24} className="mb-1 opacity-20" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">Erro</span>
                  </div>
                ) : img.id === securityImageId && !isExtraUnlocked && extraPassword ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 group-hover:text-white transition-colors">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/5 blur-xl rounded-full" />
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
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedForDeletion.includes(img.id) ? 'bg-blue-500 border-blue-500' : 'border-white/70 bg-black/40'}`}>
                      {selectedForDeletion.includes(img.id) && <Check size={14} className="text-white" />}
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
            className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 h-14 sm:h-16 px-4 sm:px-6 bg-white text-black rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center z-40 gap-2 sm:gap-3 font-medium transition-all border border-white/20"
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
              <form onSubmit={handleExtraPasswordSubmit} className="space-y-4">
                <input
                  autoFocus
                  type="password"
                  value={extraPasswordInput}
                  onChange={(e) => setExtraPasswordInput(e.target.value)}
                  placeholder="Digite a Senha Extra"
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
                    type="submit"
                    className="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all"
                  >
                    Desbloquear
                  </button>
                </div>
              </form>
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
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
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
                  onComplete={() => setIsUploaderOpen(false)} 
                  onUploadingStateChange={setIsUploading}
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
                      const url = new URL(window.location.href);
                      url.searchParams.set('image', selectedImageId || '');
                      navigator.clipboard.writeText(url.toString());
                      showToast('Link copiado para a área de transferência!');
                    }}
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    title="Copiar Link"
                  >
                    <LinkIcon size={20} className="sm:w-6 sm:h-6" />
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
              className="w-full h-full flex items-center justify-center relative"
              onClick={(e) => {
                e.stopPropagation();
                setShowControls(prev => !prev);
              }}
              onTouchStart={(e) => {
                touchStartX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (!touchStartX.current || isZoomed) return;
                const touchEndX = e.changedTouches[0].clientX;
                const distance = touchStartX.current - touchEndX;
                if (distance > 50) {
                  handleNextImage();
                } else if (distance < -50) {
                  handlePrevImage();
                }
                touchStartX.current = null;
              }}
            >
              <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={5}
                centerOnInit
                wheel={{ step: 0.1 }}
                doubleClick={{ disabled: false, step: 1 }}
                onZoom={(ref) => setIsZoomed(ref.state.scale > 1)}
                onZoomStop={(ref) => setIsZoomed(ref.state.scale > 1)}
                onInit={(ref) => setIsZoomed(ref.state.scale > 1)}
              >
                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                  <motion.img
                    key={selectedImageId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    src={selectedImage}
                    alt="Full screen"
                    className="w-full h-full select-none cursor-grab active:cursor-grabbing transition-all duration-300 object-cover"
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
      />
    </div>
  );
}
