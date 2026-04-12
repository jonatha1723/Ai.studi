import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../constants';
import { doc, onSnapshot } from 'firebase/firestore';
import { dbPrimary } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [minVersion, setMinVersion] = useState(APP_VERSION);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Listen for version updates in Firestore
    const unsub = onSnapshot(doc(dbPrimary, 'config', 'app'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.minVersion) {
          setMinVersion(data.minVersion);
          // If current version is less than required, show banner
          if (isVersionOlder(APP_VERSION, data.minVersion)) {
            setShow(true);
          }
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app');
    });

    return () => unsub();
  }, []);

  const isVersionOlder = (current: string, required: string) => {
    const curr = current.split('.').map(Number);
    const req = required.split('.').map(Number);
    
    for (let i = 0; i < Math.max(curr.length, req.length); i++) {
      const c = curr[i] || 0;
      const r = req[i] || 0;
      if (c < r) return true;
      if (c > r) return false;
    }
    return false;
  };

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  if (!show || isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-4 left-4 right-4 z-[100] flex justify-center pointer-events-none"
      >
        <div className="bg-white text-black px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-4 pointer-events-auto border border-white/20 max-w-md w-full">
          <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold">Nova Versão Disponível!</h4>
            <p className="text-xs text-zinc-600">Atualize para a versão {minVersion} para continuar usando todos os recursos.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpdate}
              className="bg-black text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
