import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react';
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
        className={`border border-dashed rounded-[1.5rem] p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col justify-center min-h-[250px] ${
          isDragActive 
            ? 'border-white bg-white/5 scale-[0.98]' 
            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            {uploading ? (
              <div className="w-16 h-16 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" strokeWidth={1.5} />
              </div>
            ) : (
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 bg-white/5 text-white rounded-2xl flex items-center justify-center shadow-lg border border-white/10"
              >
                <UploadCloud size={32} strokeWidth={1} />
              </motion.div>
            )}
          </div>
          
          <div className="space-y-1.5">
            <p className="text-lg font-bold text-white tracking-tight">
              {uploading ? 'Protegendo Arquivos...' : 'Adicionar Fotos'}
            </p>
            <p className="text-zinc-500 text-sm max-w-[220px] mx-auto leading-relaxed font-medium">
              {uploading 
                ? 'Criptografando suas fotos localmente antes do envio.' 
                : 'Arraste fotos aqui ou toque para selecionar do dispositivo.'}
            </p>
          </div>
          
          {!uploading && (
            <div className="pt-2">
              <span className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-black text-sm font-semibold rounded-full transition-colors inline-block">
                Selecionar Arquivos
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-8 h-8 bg-white/5 text-zinc-400 rounded-lg flex items-center justify-center shrink-0 border border-white/5">
          <ImageIcon size={18} />
        </div>
        <p className="text-[11px] text-zinc-400 leading-tight font-medium">
          Privacidade Total: Suas fotos são criptografadas no seu dispositivo. Ninguém, nem mesmo nós, pode vê-las.
        </p>
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
