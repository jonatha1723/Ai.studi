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
import SupportModal from './SupportModal';
import { Lock, LogOut, Trash2, X, Download, Link as LinkIcon, Maximize2, Minimize2, Loader2, Settings, DownloadCloud, Shield, Plus, MessageSquare } from 'lucide-react';
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
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const decryptedCache = useRef<Map<string, string>>(new Map());

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

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
          
          <button 
            onClick={() => setIsSupportOpen(true)}
            className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white group"
          >
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-white/5 group-hover:bg-white/10 rounded-xl flex items-center justify-center shadow-lg transition-colors border border-white/5"
            >
              <MessageSquare size={18} className="sm:w-5 sm:h-5" strokeWidth={2} />
            </motion.div>
            <span className="hidden sm:block text-base sm:text-lg font-semibold tracking-tight">Suporte</span>
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
                className="aspect-[4/5] sm:aspect-square bg-zinc-900 cursor-pointer group relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10 transition-all hover:ring-white/30"
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
                    className="p-2 sm:p-2.5 bg-black/40 hover:bg-red-500/90 text-white rounded-xl backdrop-blur-md transition-all active:scale-90 border border-white/10 hover:border-red-500"
                  >
                    <Trash2 size={16} className="sm:w-4 sm:h-4" />
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
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsUploaderOpen(true)}
        className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 h-14 sm:h-16 px-4 sm:px-6 bg-white text-black rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center z-40 gap-2 sm:gap-3 font-medium transition-all border border-white/20"
      >
        <Plus size={24} className="sm:w-6 sm:h-6" strokeWidth={2.5} />
        <span className="hidden sm:block text-base font-bold tracking-tight pr-2">Adicionar Fotos</span>
      </motion.button>

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
              onClick={() => setIsUploaderOpen(false)}
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
                  onClick={() => setIsUploaderOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400"
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
                    className="w-full h-full select-none cursor-grab active:cursor-grabbing transition-all duration-300 object-contain"
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
      
      {isSupportOpen && (
        <SupportModal 
          isOpen={isSupportOpen} 
          onClose={() => setIsSupportOpen(false)} 
        />
      )}
    </div>
  );
}
