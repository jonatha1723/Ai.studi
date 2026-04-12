import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, RefreshCw, X, AlertTriangle, Loader2 } from 'lucide-react';
import { getTrashItems, removeFromTrash, clearTrash, saveImageToCache } from '../utils/db';
import { decryptData } from '../utils/crypto';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { dbPrimary } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import ConfirmModal from './ConfirmModal';
import Toast, { ToastType } from './Toast';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TrashImage {
  id: string;
  url: string;
  createdAt: any;
  deletedAt: number;
}

export default function TrashModal({ isOpen, onClose }: TrashModalProps) {
  const { user, cryptoKey } = useAuth();
  const [images, setImages] = useState<TrashImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<TrashImage | null>(null);
  const [isConfirmEmptyOpen, setIsConfirmEmptyOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (isOpen) {
      loadTrashItems();
    }
  }, [isOpen]);

  const loadTrashItems = async () => {
    setLoading(true);
    try {
      const items = await getTrashItems();
      const decryptedItems: TrashImage[] = [];

      for (const item of items) {
        try {
          if (!cryptoKey) throw new Error('No crypto key');
          if (!item.ciphertext || !item.iv) {
            console.warn(`Trash image ${item.id} is corrupted (missing ciphertext or iv). Removing from trash.`);
            await removeFromTrash(item.id);
            continue;
          }
          const decryptedUrl = await decryptData(item.ciphertext, item.iv, cryptoKey);
          decryptedItems.push({
            id: item.id,
            url: decryptedUrl,
            createdAt: item.createdAt,
            deletedAt: item.deletedAt
          });
        } catch (error) {
          console.warn(`Trash image ${item.id} could not be decrypted (corrupted or wrong key). Removing from trash.`);
          await removeFromTrash(item.id);
        }
      }

      // Sort by deletedAt descending (newest first)
      decryptedItems.sort((a, b) => b.deletedAt - a.deletedAt);
      setImages(decryptedItems);
    } catch (error) {
      console.error('Error loading trash items:', error);
      showToast('Erro ao carregar lixeira.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (image: TrashImage) => {
    if (!user) return;
    setIsRestoring(true);
    try {
      // Get the encrypted item from the trash store
      const items = await getTrashItems();
      const trashItem = items.find(i => i.id === image.id);
      
      if (!trashItem) throw new Error('Item not found in trash');

      // Upload back to Firestore
      const firestoreData = {
        ciphertext: trashItem.ciphertext,
        iv: trashItem.iv,
        createdAt: trashItem.createdAt,
        userId: user.uid
      };

      try {
        await setDoc(doc(dbPrimary, 'images', image.id), firestoreData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `images/${image.id}`);
      }
      
      // Remove from trash
      await removeFromTrash(image.id);
      
      // Put back in local cache
      await saveImageToCache({
        id: trashItem.id,
        ciphertext: trashItem.ciphertext,
        iv: trashItem.iv,
        createdAt: trashItem.createdAt
      });

      setImages(prev => prev.filter(img => img.id !== image.id));
      setSelectedImage(null);
      showToast('Imagem restaurada com sucesso!');
    } catch (error) {
      console.error('Error restoring image:', error);
      showToast('Erro ao restaurar imagem.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeletePermanently = async (image: TrashImage) => {
    setIsDeleting(true);
    try {
      await removeFromTrash(image.id);
      setImages(prev => prev.filter(img => img.id !== image.id));
      setSelectedImage(null);
      setIsConfirmDeleteOpen(false);
      showToast('Imagem excluída permanentemente.');
    } catch (error) {
      console.error('Error deleting image:', error);
      showToast('Erro ao excluir imagem.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEmptyTrash = async () => {
    setIsDeleting(true);
    try {
      await clearTrash();
      setImages([]);
      setIsConfirmEmptyOpen(false);
      showToast('Lixeira esvaziada com sucesso!');
    } catch (error) {
      console.error('Error emptying trash:', error);
      showToast('Erro ao esvaziar lixeira.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col bg-[#050505]"
        >
          {toast && (
            <Toast 
              message={toast.message} 
              type={toast.type} 
              onClose={() => setToast(null)} 
            />
          )}

          <ConfirmModal
            isOpen={isConfirmEmptyOpen}
            onClose={() => setIsConfirmEmptyOpen(false)}
            onConfirm={handleEmptyTrash}
            title="Esvaziar Lixeira"
            message="Tem certeza que deseja excluir permanentemente TODAS as imagens da lixeira? Esta ação não pode ser desfeita."
            confirmText="Esvaziar Lixeira"
            cancelText="Cancelar"
          />

          <ConfirmModal
            isOpen={isConfirmDeleteOpen}
            onClose={() => setIsConfirmDeleteOpen(false)}
            onConfirm={() => selectedImage && handleDeletePermanently(selectedImage)}
            title="Excluir Permanentemente"
            message="Tem certeza que deseja excluir esta imagem permanentemente? Esta ação não pode ser desfeita."
            confirmText="Excluir"
            cancelText="Cancelar"
          />

          {/* Header */}
          <header className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-2xl border-b border-white/5 px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={onClose}
                className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
              >
                <X size={24} />
              </button>
              <h1 className="text-xl font-semibold text-white">Lixeira Local</h1>
            </div>
            
            {images.length > 0 && (
              <button
                onClick={() => setIsConfirmEmptyOpen(true)}
                className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Esvaziar
              </button>
            )}
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
                <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-white/5">
                  <Trash2 size={32} className="text-zinc-600" />
                </div>
                <p className="text-lg font-medium">A lixeira está vazia</p>
                <p className="text-sm text-center max-w-xs">
                  Imagens excluídas da Cloud Gallery aparecerão aqui e poderão ser restauradas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 min-[375px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-4">
                {images.map((img) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-[4/5] sm:aspect-square bg-zinc-900 cursor-pointer group relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10 hover:ring-white/30 transition-all"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img 
                      src={img.url} 
                      alt="" 
                      className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-50 select-none"
                      draggable={false}
                    />
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded-md backdrop-blur-md">
                        Ver Opções
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </main>

          {/* Image Action Modal */}
          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
                onClick={() => setSelectedImage(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  className="bg-zinc-900 border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col items-center gap-6"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="w-full aspect-square rounded-2xl overflow-hidden bg-black border border-white/5">
                    <img src={selectedImage.url} className="w-full h-full object-contain" alt="Selected" />
                  </div>
                  
                  <div className="w-full space-y-3">
                    <button
                      onClick={() => handleRestore(selectedImage)}
                      disabled={isRestoring || isDeleting}
                      className="w-full py-4 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {isRestoring ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                      Restaurar Imagem
                    </button>
                    
                    <button
                      onClick={() => setIsConfirmDeleteOpen(true)}
                      disabled={isRestoring || isDeleting}
                      className="w-full py-4 bg-red-500/10 text-red-500 font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors border border-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 size={20} />
                      Excluir Permanentemente
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
