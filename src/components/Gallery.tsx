import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData } from '../utils/crypto';
import { saveImageToCache, getImageFromCache, removeImageFromCache } from '../utils/db';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import ImageUploader from './ImageUploader';
import ConfirmModal from './ConfirmModal';
import SettingsModal from './SettingsModal';
import Toast, { ToastType } from './Toast';
import { Lock, LogOut, Trash2, X, Download, Link as LinkIcon, Maximize2, Loader2, Settings, DownloadCloud } from 'lucide-react';
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
}

export default function Gallery() {
  const { user, cryptoKey, logOut, lockVault, isAuthReady } = useAuth();
  const { isInstallable, promptToInstall } = useInstallPrompt();
  const [images, setImages] = useState<DecryptedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const decryptedCache = useRef<Map<string, string>>(new Map());
  const modalRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    // Clear cache when cryptoKey changes to avoid using wrong key for old data
    decryptedCache.current.clear();
  }, [cryptoKey]);

  const toggleNativeFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      try {
        await modalRef.current?.requestFullscreen();
        setIsNativeFullscreen(true);
      } catch (err: any) {
        console.error(`Erro ao entrar em tela cheia: ${err.message}`);
      }
    } else {
      document.exitFullscreen();
      setIsNativeFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
    
    setLoading(true);
    const q = query(
      collection(db, 'images'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedImages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      const newDecryptedImages: DecryptedImage[] = [];
      
      for (const img of fetchedImages) {
        // 1. Check memory cache (fastest)
        if (decryptedCache.current.has(img.id)) {
          newDecryptedImages.push({
            id: img.id,
            url: decryptedCache.current.get(img.id)!
          });
          continue;
        }

        try {
          let ciphertext = img.ciphertext;
          let iv = img.iv;

          // 2. Check local database cache (IndexedDB)
          const cached = await getImageFromCache(img.id);
          
          if (cached && cached.ciphertext) {
            ciphertext = cached.ciphertext;
            iv = cached.iv;
          } else if (ciphertext) {
            // 3. If not in cache but in Firestore, save to cache for next time
            await saveImageToCache({
              id: img.id,
              ciphertext,
              iv,
              createdAt: img.createdAt
            });
          }

          if (ciphertext && iv) {
            const decryptedBase64 = await decryptData(ciphertext, iv, cryptoKey);
            decryptedCache.current.set(img.id, decryptedBase64);
            newDecryptedImages.push({
              id: img.id,
              url: decryptedBase64
            });
          } else {
            throw new Error('No data found');
          }
        } catch (e) {
          console.error('Failed to decrypt image', img.id, e);
          newDecryptedImages.push({
            id: img.id,
            url: '',
            failed: true
          });
        }
      }
      
      setImages(newDecryptedImages);
      setLoading(false);
     }, (error) => {
      console.error('Erro ao buscar imagens:', error);
      setLoading(false);
    });

    return () => unsubscribe();
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

  const handleDelete = async () => {
    if (!imageToDelete) return;
    try {
      await deleteDoc(doc(db, 'images', imageToDelete));
      await removeImageFromCache(imageToDelete);
      setImages(prev => prev.filter(img => img.id !== imageToDelete));
      if (selectedImageId === imageToDelete) {
        setSelectedImage(null);
        setSelectedImageId(null);
      }
      setImageToDelete(null);
      showToast('Imagem excluída com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir imagem:', error);
      showToast('Erro ao excluir imagem.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ConfirmModal
        isOpen={!!imageToDelete}
        onClose={() => setImageToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Imagem"
        message="Tem certeza que deseja excluir esta imagem permanentemente?"
        confirmText="Excluir"
        cancelText="Cancelar"
      />
      
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-900 px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <div className="flex items-center">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 -ml-2 sm:-ml-3 rounded-xl hover:bg-zinc-900 transition-colors text-zinc-300 hover:text-white group"
          >
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-800 group-hover:bg-zinc-700 rounded-xl flex items-center justify-center shadow-lg transition-colors"
            >
              <Settings size={18} className="sm:w-5 sm:h-5" strokeWidth={2} />
            </motion.div>
            <span className="text-base sm:text-lg font-bold tracking-tight">Configurações</span>
          </button>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => {
              if (isInstallable) {
                promptToInstall();
              } else {
                showToast('Para instalar: use o menu do navegador "Adicionar à Tela de Início" ou o ícone na barra de endereços.', 'info');
              }
            }}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-full transition-colors text-sm font-medium mr-2"
          >
            <DownloadCloud size={16} />
            Instalar App
          </button>
          <button
            onClick={lockVault}
            className="p-2 sm:p-3 text-zinc-400 hover:bg-zinc-900 hover:text-white rounded-full transition-all active:scale-90"
            title="Bloquear"
          >
            <Lock size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
          <button
            onClick={logOut}
            className="p-2 sm:p-3 text-zinc-400 hover:bg-zinc-900 hover:text-red-400 rounded-full transition-all active:scale-90"
            title="Sair"
          >
            <LogOut size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-2 sm:p-4 pb-24 sm:pb-32">
        {loading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-32 sm:py-48 text-zinc-500 space-y-6 px-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-zinc-900 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center shadow-inner">
                <LinkIcon size={32} className="sm:w-10 sm:h-10 opacity-10" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-base sm:text-lg font-semibold text-zinc-400">Seu cofre está vazio</p>
              <p className="text-xs sm:text-sm text-zinc-600">Toque no botão abaixo para adicionar fotos.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 min-[375px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-3">
            {images.map((img) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="aspect-square bg-zinc-900 cursor-pointer group relative overflow-hidden rounded-xl shadow-md"
                onClick={() => {
                  if (img.failed) return;
                  setSelectedImage(img.url);
                  setSelectedImageId(img.id);
                  setShowControls(true);
                  const url = new URL(window.location.href);
                  url.searchParams.set('image', img.id);
                  window.history.replaceState({}, '', url);
                }}
              >
                {img.failed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-2 text-center">
                    <Lock size={24} className="mb-1 opacity-20" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">Erro</span>
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
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageToDelete(img.id);
                    }}
                    className="p-2 bg-black/40 hover:bg-red-500 text-white rounded-xl backdrop-blur-md transition-all active:scale-90"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsUploaderOpen(true)}
        className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 text-white rounded-[1.25rem] sm:rounded-[1.5rem] shadow-2xl shadow-blue-900/40 flex items-center justify-center z-40"
      >
        <div className="relative w-6 h-6 sm:w-8 sm:h-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 sm:w-8 h-1 bg-white rounded-full" />
            <div className="w-1 h-6 sm:h-8 bg-white rounded-full" />
          </div>
        </div>
      </motion.button>

      {/* Uploader Modal */}
      <AnimatePresence>
        {isUploaderOpen && (
          <motion.div 
            key="uploader-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
          >
            <div
              onClick={() => setIsUploaderOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-zinc-900 md:rounded-3xl shadow-2xl overflow-hidden border-0 md:border border-zinc-800 flex flex-col h-[100dvh] md:h-auto md:max-h-[90vh]"
            >
              <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-semibold text-zinc-100">Adicionar Fotos</h2>
                <button 
                  onClick={() => setIsUploaderOpen(false)}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col">
                <ImageUploader onComplete={() => setIsUploaderOpen(false)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedImage && (
          <motion.div
            key="fullscreen-image"
            ref={modalRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center p-0"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen();
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
                    onClick={toggleNativeFullscreen}
                    className="text-white/70 hover:text-white transition-colors p-2 sm:p-3 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 active:scale-90"
                    title={isNativeFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                  >
                    <Maximize2 size={20} className="sm:w-6 sm:h-6" />
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
                    onClick={(e) => {
                      e.stopPropagation();
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
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
              className="w-full h-full flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setShowControls(prev => !prev);
              }}
            >
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={5}
                centerOnInit
                wheel={{ step: 0.1 }}
                doubleClick={{ disabled: false, step: 1 }}
              >
                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                  <motion.img
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    src={selectedImage}
                    alt="Full screen"
                    className={`w-full h-full select-none cursor-grab active:cursor-grabbing transition-all duration-300 ${isNativeFullscreen ? 'object-cover' : 'object-contain'}`}
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </TransformComponent>
              </TransformWrapper>
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
      />
    </div>
  );
}
