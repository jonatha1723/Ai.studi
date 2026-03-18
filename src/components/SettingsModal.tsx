import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, HardDrive, User, Clock, Trash2, Check, AlertTriangle, EyeOff, DownloadCloud } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clearImageCache } from '../utils/db';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import Toast, { ToastType } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, logOut } = useAuth();
  const { isInstallable, promptToInstall } = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<'security' | 'storage' | 'account'>('security');
  const [autoLockTimer, setAutoLockTimer] = useState<string>('15');
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const savedTimer = localStorage.getItem('autoLockTimer') || '15';
    setAutoLockTimer(savedTimer);
    
    const savedPrivacy = localStorage.getItem('privacyMode') === 'true';
    setPrivacyMode(savedPrivacy);
  }, []);

  const handleSaveTimer = (val: string) => {
    setAutoLockTimer(val);
    localStorage.setItem('autoLockTimer', val);
    showToast('Tempo de bloqueio atualizado');
  };

  const handleTogglePrivacy = () => {
    const newVal = !privacyMode;
    setPrivacyMode(newVal);
    localStorage.setItem('privacyMode', String(newVal));
    showToast(newVal ? 'Modo Privacidade ativado' : 'Modo Privacidade desativado');
  };

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearImageCache();
      showToast('Cache limpo com sucesso');
    } catch (error) {
      showToast('Erro ao limpar cache', 'error');
    } finally {
      setClearing(false);
    }
  };

  const tabs = [
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'storage', label: 'Armazenamento', icon: HardDrive },
    { id: 'account', label: 'Conta', icon: User },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="settings-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
        >
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-3xl bg-black md:rounded-3xl shadow-2xl overflow-hidden border-0 md:border border-white/10 flex flex-col md:flex-row h-[100dvh] md:h-[600px] md:max-h-[85vh]"
          >
            {/* Sidebar */}
            <div className="w-full md:w-64 bg-zinc-900/50 border-b md:border-b-0 md:border-r border-white/5 p-4 sm:p-6 flex flex-col shrink-0">
              <div className="flex items-center justify-between mb-4 md:mb-8">
                <h2 className="text-xl font-bold text-white tracking-tight">Configurações</h2>
                <button 
                  onClick={onClose}
                  className="md:hidden p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400"
                >
                  <X size={20} />
                </button>
              </div>
              
              <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap ${
                        isActive 
                          ? 'bg-white/10 text-white font-semibold' 
                          : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 font-medium'
                      }`}
                    >
                      <Icon size={18} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto relative pb-24 md:pb-8">
              <button 
                onClick={onClose}
                className="hidden md:flex absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400"
              >
                <X size={20} />
              </button>

              <div className="max-w-md mt-2 md:mt-8">
                {activeTab === 'security' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Proteção de Tela</h3>
                      <p className="text-sm text-zinc-400 mb-6">
                        Oculta o conteúdo do cofre quando você muda de aba ou minimiza o aplicativo.
                      </p>
                      
                      <label className="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all border-white/10 hover:border-white/20 bg-zinc-900/30 mb-8">
                        <div className="flex items-center gap-3">
                          <EyeOff size={18} className={privacyMode ? 'text-white' : 'text-zinc-500'} />
                          <span className={privacyMode ? 'text-white font-medium' : 'text-zinc-400'}>
                            Modo Privacidade
                          </span>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${privacyMode ? 'bg-white' : 'bg-zinc-800'}`}>
                          <div className={`absolute top-1 left-1 bg-black w-4 h-4 rounded-full transition-transform ${privacyMode ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                        <input 
                          type="checkbox" 
                          checked={privacyMode}
                          onChange={handleTogglePrivacy}
                          className="hidden"
                        />
                      </label>

                      <h3 className="text-lg font-semibold text-white mb-2">Bloqueio Automático</h3>
                      <p className="text-sm text-zinc-400 mb-6">
                        Tempo de inatividade antes de exigir a senha novamente.
                      </p>
                      
                      <div className="space-y-3">
                        {[
                          { value: '5', label: '5 minutos' },
                          { value: '15', label: '15 minutos' },
                          { value: '30', label: '30 minutos' },
                          { value: '60', label: '1 hora' },
                          { value: 'never', label: 'Nunca (Não recomendado)' }
                        ].map((option) => (
                          <label 
                            key={option.value}
                            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                              autoLockTimer === option.value 
                                ? 'border-white bg-white/5' 
                                : 'border-white/10 hover:border-white/20 bg-zinc-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Clock size={18} className={autoLockTimer === option.value ? 'text-white' : 'text-zinc-500'} />
                              <span className={autoLockTimer === option.value ? 'text-white font-medium' : 'text-zinc-400'}>
                                {option.label}
                              </span>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              autoLockTimer === option.value ? 'border-white bg-white' : 'border-zinc-700'
                            }`}>
                              {autoLockTimer === option.value && <Check size={12} className="text-black" />}
                            </div>
                            <input 
                              type="radio" 
                              name="autolock" 
                              value={option.value}
                              checked={autoLockTimer === option.value}
                              onChange={(e) => handleSaveTimer(e.target.value)}
                              className="hidden"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'storage' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Gerenciamento de Cache</h3>
                      <p className="text-sm text-zinc-400 mb-6">
                        As imagens são armazenadas em cache no seu dispositivo para carregar mais rápido. Limpar o cache não exclui suas fotos da nuvem.
                      </p>

                      <div className="p-5 bg-zinc-900/50 border border-white/10 rounded-2xl space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-white/10 text-white rounded-xl border border-white/5">
                            <HardDrive size={24} />
                          </div>
                          <div>
                            <h4 className="text-white font-medium">Cache Local</h4>
                            <p className="text-sm text-zinc-500 mt-1">
                              Libere espaço no seu dispositivo apagando imagens temporárias.
                            </p>
                          </div>
                        </div>
                        
                        <button
                          onClick={handleClearCache}
                          disabled={clearing}
                          className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {clearing ? 'Limpando...' : (
                            <>
                              <Trash2 size={18} />
                              Limpar Cache Agora
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'account' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Sua Conta</h3>
                      <p className="text-sm text-zinc-400 mb-6">
                        Gerencie sua sessão e informações de acesso.
                      </p>

                      <div className="p-5 bg-zinc-900/50 border border-white/10 rounded-2xl space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-zinc-400 border border-white/5">
                            {user?.photoURL ? (
                              <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <User size={24} />
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-white font-medium truncate">{user?.displayName || 'Usuário'}</h4>
                            <p className="text-sm text-zinc-500 truncate">{user?.email}</p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-white/10 space-y-3">
                          <button
                            onClick={() => {
                              if (isInstallable) {
                                promptToInstall();
                              } else {
                                showToast('Para instalar: use o menu do navegador "Adicionar à Tela de Início" ou o ícone na barra de endereços.', 'info');
                              }
                            }}
                            className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            <DownloadCloud size={18} />
                            Instalar Aplicativo
                          </button>
                          <button
                            onClick={logOut}
                            className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                          >
                            <AlertTriangle size={18} />
                            Encerrar Sessão
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      {toast && (
        <Toast
          key="settings-toast"
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </AnimatePresence>
  );
}
