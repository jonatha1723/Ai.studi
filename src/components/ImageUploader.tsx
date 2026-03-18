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
        className={`border-2 border-dashed rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-10 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col justify-center min-h-[300px] ${
          isDragActive 
            ? 'border-blue-500 bg-blue-500/10 scale-[0.98]' 
            : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            {uploading ? (
              <div className="w-20 h-20 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" strokeWidth={1.5} />
              </div>
            ) : (
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 bg-blue-600/20 text-blue-400 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-blue-900/10"
              >
                <UploadCloud size={36} strokeWidth={1.5} />
              </motion.div>
            )}
          </div>
          
          <div className="space-y-2">
            <p className="text-lg sm:text-xl font-bold text-white">
              {uploading ? 'Protegendo Arquivos...' : 'Adicionar Fotos'}
            </p>
            <p className="text-zinc-400 text-xs sm:text-sm max-w-[200px] mx-auto leading-relaxed">
              {uploading 
                ? 'Criptografando suas fotos localmente antes do envio.' 
                : 'Arraste fotos aqui ou toque para selecionar do dispositivo.'}
            </p>
          </div>
          
          {!uploading && (
            <div className="pt-2">
              <span className="px-5 py-2.5 bg-zinc-800 text-zinc-300 text-xs sm:text-sm font-bold rounded-full uppercase tracking-wider whitespace-nowrap inline-block">
                Selecionar Arquivos
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center shrink-0">
          <ImageIcon size={18} />
        </div>
        <p className="text-[11px] text-blue-400/80 leading-tight font-medium">
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
