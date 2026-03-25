import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, HardDrive, User, Clock, Trash2, Check, AlertTriangle, EyeOff, DownloadCloud, Lock, Image as ImageIcon, Key, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clearImageCache, saveImageToCache, getAllImagesFromCache } from '../utils/db';
import { decryptData } from '../utils/crypto';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import Toast, { ToastType } from './Toast';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

interface DecryptedImage {
  id: string;
  url: string;
  failed?: boolean;
  createdAt: number;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  images?: DecryptedImage[];
}

export default function SettingsModal({ isOpen, onClose, images = [] }: SettingsModalProps) {
  const { user, logOut, extraPassword, securityImageId, updateExtraPassword, setSecurityImage, cryptoKey } = useAuth();
  const { isInstallable, promptToInstall } = useInstallPrompt();
  const [autoLockTimer, setAutoLockTimer] = useState<string>('15');
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [newExtraPassword, setNewExtraPassword] = useState(extraPassword || '');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');

  useEffect(() => {
    setNewExtraPassword(extraPassword || '');
  }, [extraPassword]);

  useEffect(() => {
    const savedTimer = localStorage.getItem('autoLockTimer') || '15';
    setAutoLockTimer(savedTimer);
    const savedPrivacy = localStorage.getItem('privacyMode') === 'true';
    setPrivacyMode(savedPrivacy);
  }, []);

  const handleClose = () => {
    setIsSettingsUnlocked(false);
    setUnlockPasswordInput('');
    onClose();
  };

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

  const handleRemoveFailedImages = async () => {
    setClearing(true);
    try {
      const failedImages = images.filter(img => img.failed);
      for (const img of failedImages) {
        await removeImageFromCache(img.id);
      }
      showToast(`${failedImages.length} imagens corrompidas removidas`);
    } catch (error) {
      showToast('Erro ao remover imagens corrompidas', 'error');
    } finally {
      setClearing(false);
    }
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

  const handleDownloadAll = async () => {
    if (!cryptoKey) {
      showToast('Chave de criptografia não disponível', 'error');
      return;
    }
    setDownloading(true);
    try {
      const cachedImages = await getAllImagesFromCache();
      if (cachedImages.length === 0) {
        showToast('Nenhuma imagem no cache', 'info');
        return;
      }
      
      for (const img of cachedImages) {
        if (img.ciphertext && img.iv) {
          const decryptedBase64 = await decryptData(img.ciphertext, img.iv, cryptoKey);
          const link = document.createElement('a');
          link.href = decryptedBase64;
          link.download = `image-${img.id}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
      showToast('Download iniciado...');
    } catch (error) {
      console.error('Erro ao baixar imagens:', error);
      showToast('Erro ao baixar imagens', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleUpdateExtraPassword = async () => {
    if (!newExtraPassword.trim()) {
      showToast('A senha não pode estar vazia', 'error');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await updateExtraPassword(newExtraPassword);
      showToast('Senha extra atualizada com sucesso');
    } catch (error) {
      showToast('Erro ao atualizar senha extra', 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const tabs = [
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'fakeVault', label: 'Imagem Protegida', icon: Lock },
    { id: 'storage', label: 'Armazenamento', icon: HardDrive },
    { id: 'account', label: 'Conta', icon: User },
  ] as const;

  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id']>('security');

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
            onClick={handleClose}
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
                  onClick={handleClose}
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
                onClick={handleClose}
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

                {activeTab === 'fakeVault' && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    {extraPassword && !isSettingsUnlocked ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-6">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white mb-2">
                          <Lock size={32} />
                        </div>
                        <h3 className="text-xl font-semibold text-white text-center">Configurações Protegidas</h3>
                        <p className="text-sm text-zinc-400 text-center max-w-xs">
                          Digite sua senha extra atual para alterar a imagem ou a senha.
                        </p>
                        <div className="w-full max-w-xs space-y-4">
                          <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                              <Key size={18} />
                            </div>
                            <input
                              type="password"
                              maxLength={15}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={unlockPasswordInput}
                              onChange={(e) => setUnlockPasswordInput(e.target.value.replace(/\D/g, ''))}
                              placeholder="Senha atual"
                              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                            />
                          </div>
                          <button
                            onClick={() => {
                              if (unlockPasswordInput === extraPassword) {
                                setIsSettingsUnlocked(true);
                                setUnlockPasswordInput('');
                              } else {
                                showToast('Senha incorreta', 'error');
                              }
                            }}
                            disabled={unlockPasswordInput.length === 0}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            Desbloquear
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Imagem Protegida</h3>
                        <div className="p-4 bg-zinc-900/50 border border-white/10 rounded-xl mb-6">
                          <p className="text-sm text-zinc-300 leading-relaxed">
                            A <strong>Imagem Protegida</strong> é uma camada extra de segurança para uma foto específica. A imagem selecionada ficará borrada e trancada com um cadeado na sua galeria. Para visualizá-la, será necessário digitar a senha de até 15 dígitos definida abaixo.
                          </p>
                        </div>

                        <div className="space-y-4 mb-8">
                          <label className="block text-sm font-medium text-zinc-400">1. Defina a Senha Extra (até 15 dígitos)</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                              <Key size={18} />
                            </div>
                            <input
                              type="password"
                              maxLength={15}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={newExtraPassword}
                              onChange={(e) => setNewExtraPassword(e.target.value.replace(/\D/g, ''))}
                              placeholder="Ex: 123456..."
                              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                            />
                          </div>
                          <button
                            onClick={handleUpdateExtraPassword}
                            disabled={isUpdatingPassword || newExtraPassword === extraPassword || newExtraPassword.length === 0}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isUpdatingPassword ? 'Atualizando...' : 'Salvar Senha Extra'}
                          </button>
                        </div>

                        <div className="space-y-4">
                          <label className="block text-sm font-medium text-zinc-400">2. Selecione a Imagem para Proteger</label>
                          
                          {securityImageId && (
                            <div className="p-4 bg-zinc-900/50 border border-white/10 rounded-xl flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-white overflow-hidden shrink-0">
                                  {images.find(img => img.id === securityImageId) ? (
                                    <img src={images.find(img => img.id === securityImageId)?.url} alt="Protegida" className="w-full h-full object-cover" />
                                  ) : (
                                    <Lock size={18} />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">Imagem Protegida Ativa</p>
                                  <p className="text-xs text-zinc-500">Esta imagem exige a senha extra para ser vista.</p>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    await setSecurityImage(null);
                                    showToast('Proteção removida da imagem');
                                  } catch (error) {
                                    showToast('Erro ao remover proteção', 'error');
                                  }
                                }}
                                className="text-xs text-red-400 hover:text-red-300 font-medium shrink-0"
                              >
                                Remover
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                            {images.length > 0 ? (
                              images.map((img) => (
                                <div 
                                  key={img.id}
                                  onClick={async () => {
                                    try {
                                      await setSecurityImage(img.id);
                                      showToast('Imagem protegida com sucesso!');
                                    } catch (error) {
                                      showToast('Erro ao proteger imagem', 'error');
                                    }
                                  }}
                                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${securityImageId === img.id ? 'border-white' : 'border-transparent hover:border-white/30'}`}
                                >
                                  <img src={img.url} alt="Gallery item" className="w-full h-full object-cover" />
                                  {securityImageId === img.id && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <Check className="text-white" size={24} />
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="col-span-3 p-4 bg-zinc-900/30 border border-dashed border-white/10 rounded-xl text-center">
                                <p className="text-sm text-zinc-500">
                                  Nenhuma imagem na galeria. Adicione fotos primeiro.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
                          onClick={handleRemoveFailedImages}
                          disabled={clearing || images.filter(i => i.failed).length === 0}
                          className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {clearing ? 'Removendo...' : (
                            <>
                              <AlertTriangle size={18} />
                              Remover Imagens Corrompidas ({images.filter(i => i.failed).length})
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={handleDownloadAll}
                          disabled={downloading}
                          className="w-full py-3 px-4 bg-white text-black hover:bg-zinc-200 font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {downloading ? 'Baixando...' : (
                            <>
                              <Download size={18} />
                              Baixar Imagens do Cache
                            </>
                          )}
                        </button>
                        
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
