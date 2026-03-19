import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, Loader2, ShieldCheck } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { encryptData } from '../utils/crypto';
import { saveImageToCache } from '../utils/db';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import Toast, { ToastType } from './Toast';
import { motion, AnimatePresence } from 'motion/react';

export default function ImageUploader({ onComplete }: { onComplete?: () => void }) {
  const { user, cryptoKey } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user || !cryptoKey || acceptedFiles.length === 0) return;
    
    setUploading(true);
    
    try {
      for (const file of acceptedFiles) {
        // 1. Compress image to ensure it fits in Firestore (max 1MB, let's aim for < 700KB)
        const options = {
          maxSizeMB: 0.6,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        };
        
        const compressedFile = await imageCompression(file, options);
        
        // 2. Convert to Base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(compressedFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        // 3. Encrypt Base64 string
        const { ciphertext, iv } = await encryptData(base64, cryptoKey);

        // 4. Save to Firestore
        const docRef = await addDoc(collection(db, 'images'), {
          userId: user.uid,
          ciphertext,
          iv,
          createdAt: serverTimestamp()
        });

        // 5. Save to local cache
        await saveImageToCache({
          id: docRef.id,
          ciphertext,
          iv,
          createdAt: new Date()
        });
      }
      showToast('Imagens enviadas com sucesso!');
      if (onComplete) {
        setTimeout(onComplete, 1000);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast('Falha ao enviar a imagem de forma segura.', 'error');
    } finally {
      setUploading(false);
    }
  }, [user, cryptoKey, onComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': []
    }
  } as any);

  return (
    <>
    <div className="space-y-6 flex flex-col h-full">
      <div 
        {...getRootProps()} 
        className={`border border-dashed rounded-[2rem] p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col justify-center min-h-[280px] relative overflow-hidden ${
          isDragActive 
            ? 'border-white/40 bg-white/10 scale-[0.98]' 
            : 'border-white/10 hover:border-white/30 hover:bg-white/5'
        }`}
      >
        {isDragActive && (
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        )}
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-5 relative z-10">
          <div className="relative">
            {uploading ? (
              <div className="w-20 h-20 flex items-center justify-center relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-2 border-white/5 border-t-white/40 rounded-full" 
                />
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1 h-1 bg-white rounded-full"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 bg-gradient-to-b from-white/10 to-white/5 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl border border-white/10"
              >
                <UploadCloud size={36} strokeWidth={1.5} className="opacity-80" />
              </motion.div>
            )}
          </div>
          
          <div className="space-y-2">
            <p className="text-xl font-semibold text-white tracking-tight">
              {uploading ? 'Protegendo Arquivos...' : 'Adicionar Fotos'}
            </p>
            <p className="text-zinc-400 text-sm max-w-[240px] mx-auto leading-relaxed font-medium">
              {uploading 
                ? 'Criptografando suas fotos localmente antes do envio.' 
                : 'Arraste fotos aqui ou toque para selecionar do dispositivo.'}
            </p>
          </div>
          
          {!uploading && (
            <div className="pt-4">
              <span className="px-6 py-3 bg-white hover:bg-zinc-200 text-black text-sm font-bold tracking-wide rounded-full transition-colors inline-block shadow-lg">
                Selecionar Arquivos
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-5 flex items-start gap-4 shadow-inner">
        <div className="w-10 h-10 bg-white/5 text-zinc-400 rounded-xl flex items-center justify-center shrink-0 border border-white/5">
          <ShieldCheck size={20} className="text-emerald-400/80" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-zinc-200">Privacidade Total</p>
          <p className="text-xs text-zinc-400 leading-relaxed font-medium">
            Suas fotos são criptografadas no seu dispositivo. Ninguém, nem mesmo nós, pode vê-las.
          </p>
        </div>
      </div>
    </div>
      
      <AnimatePresence>
        {toast && (
          <Toast 
            key="uploader-toast"
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}
