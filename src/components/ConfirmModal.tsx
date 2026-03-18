import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = true
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="confirm-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/80"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            className="relative w-full max-w-[320px] bg-zinc-900 border-2 border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <motion.div 
                initial={{ rotate: -10, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center ${
                  isDestructive ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                } shadow-lg`}
              >
                <AlertTriangle size={32} strokeWidth={1.5} />
              </motion.div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed px-2">
                  {message}
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 pt-4">
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`w-full py-4 rounded-[1.25rem] font-bold transition-all active:scale-[0.96] text-lg ${
                    isDestructive 
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-900/20' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-900/20'
                  }`}
                >
                  {confirmText}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-[1.25rem] transition-all active:scale-[0.96] text-lg"
                >
                  {cancelText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
