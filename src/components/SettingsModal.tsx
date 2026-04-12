import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, HardDrive, User, Clock, Trash2, Check, AlertTriangle, EyeOff, DownloadCloud, Lock, Image as ImageIcon, Key, Download, Loader2, Sparkles, ExternalLink, Wrench, RotateCcw, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clearImageCache, saveImageToCache, getAllImagesFromCache, removeImageFromCache } from '../utils/db';
import { decryptData } from '../utils/crypto';
import { useInstallPrompt } from '../utils/useInstallPrompt';
import { APP_VERSION } from '../constants';
import Toast, { ToastType } from './Toast';

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
  onOpenTrash?: () => void;
}

export default function SettingsModal({ isOpen, onClose, images = [], onOpenTrash }: SettingsModalProps) {
  const { user, logOut, extraPassword, securityImageId, updateExtraPassword, setSecurityImage, cryptoKey } = useAuth();
  const { isInstallable, promptToInstall, isInIframe } = useInstallPrompt();
  const [autoLockTimer, setAutoLockTimer] = useState<string>('15');
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
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

  useEffect(() => {
    const calculateStorage = async () => {
      try {
        const cachedImages = await getAllImagesFromCache();
        let totalBytes = 0;
        cachedImages.forEach(img => {
          if (img.ciphertext) {
            // Base64 size estimation: (n * 3/4) - padding
            totalBytes += (img.ciphertext.length * 0.75);
          }
        });
        setStorageUsage({ total: totalBytes, count: cachedImages.length });
      } catch (e) {
        console.error('Error calculating storage:', e);
      }
    };

    if (isOpen) {
      calculateStorage();
    }
  }, [isOpen, images]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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
    { id: 'security', label: 'Segurança', icon: Shield, description: 'Privacidade e bloqueio automático' },
    { id: 'fakeVault', label: 'Imagem Protegida', icon: Lock, description: 'Oculte fotos com senha extra' },
    { id: 'storage', label: 'Armazenamento', icon: HardDrive, description: 'Cache e limpeza de dados' },
    { id: 'trash', label: 'Lixeira Local', icon: Trash2, description: 'Recupere fotos apagadas recentemente' },
    { id: 'news', label: 'Novidades', icon: Sparkles, description: 'O que há de novo no app' },
    { id: 'repair', label: 'Reparar Cofre', icon: Wrench, description: 'Corrigir erros de carregamento' },
    { id: 'account', label: 'Conta', icon: User, description: 'Sua sessão e instalação' },
    { id: 'about', label: 'Sobre', icon: Sparkles, description: 'Versão e informações do app' },
  ] as const;

  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id'] | 'menu'>('menu');

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
            className="relative w-full max-w-2xl bg-zinc-950 md:rounded-3xl shadow-2xl overflow-hidden border-0 md:border border-white/10 flex flex-col h-[100dvh] md:h-[600px] md:max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-zinc-900/50 shrink-0">
              {activeTab !== 'menu' && (
                <button 
                  onClick={() => setActiveTab('menu')}
                  className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors text-white"
                >
                  <motion.div
                    initial={{ x: 5, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                  </motion.div>
                </button>
              )}
              <h2 className="text-xl font-bold text-white tracking-tight">
                {activeTab === 'menu' ? 'Configurações' : tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <div className="flex-1" />
              <button 
                onClick={handleClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto relative bg-[#050505]">
              <AnimatePresence mode="wait">
                {activeTab === 'menu' ? (
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="p-4 space-y-1"
                  >
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            if (tab.id === 'trash') {
                              onOpenTrash?.();
                              handleClose();
                            } else {
                              setActiveTab(tab.id);
                            }
                          }}
                          className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all hover:bg-white/5 active:bg-white/10 text-left group"
                        >
                          <div className="p-3 bg-zinc-900/50 rounded-2xl border border-white/5 text-zinc-400 group-hover:text-white group-hover:border-white/10 transition-colors">
                            <Icon size={24} strokeWidth={1.5} />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-white font-medium text-base">{tab.label}</h3>
                            <p className="text-sm text-zinc-500 line-clamp-1">{tab.description}</p>
                          </div>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 group-hover:text-zinc-400 transition-colors">
                            <path d="m9 18 6-6-6-6"/>
                          </svg>
                        </button>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 30 }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    className="p-6 pb-24 md:pb-8 h-full"
                  >
                    <div className="max-w-md mx-auto">
                      {activeTab === 'security' && (
                        <div className="space-y-8">
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Proteção de Tela</h3>
                            <p className="text-sm text-zinc-400 mb-6">
                              Oculta o conteúdo do cofre quando você muda de aba ou minimiza o aplicativo.
                            </p>
                            
                            <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all border-white/10 hover:border-white/20 bg-zinc-900/30 mb-8">
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
                                  className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
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
                        </div>
                      )}

                      {activeTab === 'fakeVault' && (
                        <div className="space-y-8">
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
                                    type="text"
                                    name="settings-unlock-input"
                                    id="settings-unlock-input"
                                    style={{ WebkitTextSecurity: 'disc' }}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck="false"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-form-type="other"
                                    maxLength={15}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={unlockPasswordInput}
                                    onChange={(e) => setUnlockPasswordInput(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Digite aqui"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
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
                                  className="w-full py-3 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  Desbloquear
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-2">Imagem Protegida</h3>
                              <div className="p-4 bg-zinc-900/50 border border-white/10 rounded-2xl mb-6">
                                <p className="text-sm text-zinc-300 leading-relaxed">
                                  A <strong>Imagem Protegida</strong> é uma camada extra de segurança para uma foto específica. A imagem selecionada ficará borrada e trancada com um cadeado na sua Cloud Gallery. Para visualizá-la, será necessário digitar a senha de até 15 dígitos definida abaixo.
                                </p>
                              </div>

                              <div className="space-y-4 mb-8">
                                <label className="block text-sm font-medium text-zinc-400">1. Defina a Senha Extra (até 15 dígitos)</label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
                                    <Key size={18} />
                                  </div>
                                  <input
                                    type="text"
                                    name="settings-new-extra-input"
                                    id="settings-new-extra-input"
                                    style={{ WebkitTextSecurity: 'disc' }}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck="false"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-form-type="other"
                                    maxLength={15}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={newExtraPassword}
                                    onChange={(e) => setNewExtraPassword(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Digite aqui"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                                  />
                                </div>
                                <button
                                  onClick={handleUpdateExtraPassword}
                                  disabled={isUpdatingPassword || newExtraPassword === extraPassword || newExtraPassword.length === 0}
                                  className="w-full py-3 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  {isUpdatingPassword ? 'Atualizando...' : 'Salvar Senha Extra'}
                                </button>
                              </div>

                              <div className="space-y-4">
                                <label className="block text-sm font-medium text-zinc-400">2. Selecione a Imagem para Proteger</label>
                                
                                {securityImageId && (
                                  <div className="p-4 bg-zinc-900/50 border border-white/10 rounded-2xl flex items-center justify-between mb-4">
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
                                    <div className="col-span-3 p-4 bg-zinc-900/30 border border-dashed border-white/10 rounded-2xl text-center">
                                      <p className="text-sm text-zinc-500">
                                        Nenhuma imagem na Cloud Gallery. Adicione fotos primeiro.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'storage' && (
                        <div className="space-y-8">
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Gerenciamento de Armazenamento</h3>
                            <p className="text-sm text-zinc-400 mb-6">
                              As imagens são criptografadas e armazenadas na nuvem. O cache local ajuda a economizar banda e carregar mais rápido.
                            </p>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
                                <p className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wider">Uso de Dados</p>
                                <p className="text-2xl font-bold text-white tabular-nums">{formatBytes(storageUsage.total)}</p>
                                <p className="text-[10px] text-zinc-600 mt-1">Estimativa de dados na nuvem</p>
                              </div>
                              <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
                                <p className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wider">Total de Fotos</p>
                                <p className="text-2xl font-bold text-white tabular-nums">{storageUsage.count}</p>
                                <p className="text-[10px] text-zinc-600 mt-1">Arquivos protegidos</p>
                              </div>
                            </div>

                            <div className="p-5 bg-zinc-900/50 border border-white/10 rounded-2xl space-y-4">
                              <div className="flex items-start gap-4">
                                <div className="p-3 bg-white/10 text-white rounded-xl border border-white/5">
                                  <HardDrive size={24} />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-white font-medium">Cache Local</h4>
                                  <p className="text-sm text-zinc-500 mt-1">
                                    Libere espaço no seu dispositivo apagando imagens temporárias.
                                  </p>
                                </div>
                              </div>
                              
                              <button
                                onClick={handleRemoveFailedImages}
                                disabled={clearing || images.filter(i => i.failed).length === 0}
                                className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                                className="w-full py-3 px-4 bg-white text-black hover:bg-zinc-200 font-medium rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                                className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                        </div>
                      )}

                      {activeTab === 'news' && (
                        <div className="space-y-8">
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="p-2 bg-white/10 rounded-xl text-white">
                                <Sparkles size={20} />
                              </div>
                              <h3 className="text-lg font-semibold text-white">O que há de novo</h3>
                            </div>

                            <div className="space-y-4">
                              {[
                                {
                                  title: "Interface Renovada",
                                  description: "Design mais limpo e moderno, focado na sua privacidade.",
                                  date: "Março 2026"
                                },
                                {
                                  title: "Reparação Automática",
                                  description: "Novo sistema que detecta e corrige automaticamente imagens que falham ao carregar.",
                                  date: "Março 2026"
                                },
                                {
                                  title: "Criptografia Avançada",
                                  description: "Suas fotos agora contam com uma camada extra de proteção militar.",
                                  date: "Fevereiro 2026"
                                },
                                {
                                  title: "Lixeira Local",
                                  description: "Apagou sem querer? Agora você tem 30 dias para recuperar suas fotos.",
                                  date: "Janeiro 2026"
                                }
                              ].map((item, i) => (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  key={i}
                                  className="p-4 bg-zinc-900/50 border border-white/10 rounded-2xl group hover:border-white/20 transition-all"
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <h4 className="text-white font-medium">{item.title}</h4>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">{item.date}</span>
                                  </div>
                                  <p className="text-sm text-zinc-500 leading-relaxed">
                                    {item.description}
                                  </p>
                                </motion.div>
                              ))}
                            </div>

                            <div className="mt-8 p-6 bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-3xl relative overflow-hidden group">
                              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                                <Sparkles size={80} />
                              </div>
                              <div className="relative z-10">
                                <h4 className="text-white font-bold text-lg mb-2">Sugira uma função</h4>
                                <p className="text-sm text-zinc-400 mb-6 max-w-[200px]">
                                  Sua opinião é fundamental para evoluirmos o aplicativo.
                                </p>
                                <button
                                  onClick={() => {
                                    window.open('https://t.me/seu_canal', '_blank');
                                    showToast('Abrindo canal de sugestões...');
                                  }}
                                  className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 active:scale-95 transition-all text-sm"
                                >
                                  Enviar Sugestão
                                  <ExternalLink size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'repair' && (
                        <div className="space-y-8">
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="p-2 bg-white/10 rounded-xl text-white">
                                <Wrench size={20} />
                              </div>
                              <h3 className="text-lg font-semibold text-white">Reparar Cofre</h3>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-white/10 rounded-3xl space-y-6">
                              <div className="flex items-start gap-4">
                                <div className="p-3 bg-white/10 text-white rounded-2xl border border-white/5">
                                  <RotateCcw size={24} />
                                </div>
                                <div>
                                  <h4 className="text-white font-bold text-lg">Reparação Profunda</h4>
                                  <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                                    Se algumas imagens não estão carregando ou aparecem com erro, esta função irá limpar o cache local e forçar uma nova sincronização com a nuvem.
                                  </p>
                                </div>
                              </div>

                              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
                                <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                                <p className="text-xs text-amber-200/70 leading-relaxed">
                                  O aplicativo será reiniciado após a limpeza para garantir que todos os dados sejam atualizados corretamente.
                                </p>
                              </div>

                              <button
                                onClick={async () => {
                                  setClearing(true);
                                  try {
                                    await clearImageCache();
                                    showToast('Cache limpo! Reiniciando...', 'success');
                                    setTimeout(() => {
                                      window.location.reload();
                                    }, 1500);
                                  } catch (error) {
                                    showToast('Erro ao reparar cofre', 'error');
                                    setClearing(false);
                                  }
                                }}
                                disabled={clearing}
                                className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {clearing ? (
                                  <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Reparando...
                                  </>
                                ) : (
                                  <>
                                    <Wrench size={20} />
                                    Iniciar Reparação
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="mt-8 p-4 bg-zinc-900/30 rounded-2xl border border-white/5">
                              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Dica de Segurança</h4>
                              <p className="text-xs text-zinc-600 leading-relaxed">
                                Suas fotos estão seguras na nuvem. A reparação apenas limpa a cópia local que pode ter sido corrompida por falhas de conexão ou armazenamento do dispositivo.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'account' && (
                        <div className="space-y-8">
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
                                      } else if (isInIframe) {
                                        showToast('Abra em uma nova aba para instalar o app.', 'info');
                                      } else {
                                        showToast('Para instalar: use o menu do navegador "Adicionar à Tela de Início" ou o ícone na barra de endereços.', 'info');
                                      }
                                    }}
                                    className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-2xl transition-all flex items-center justify-center gap-2"
                                  >
                                  <DownloadCloud size={18} />
                                  Instalar Aplicativo
                                </button>
                                <button
                                  onClick={logOut}
                                  className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium rounded-2xl transition-all flex items-center justify-center gap-2"
                                >
                                  <AlertTriangle size={18} />
                                  Encerrar Sessão
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'about' && (
                        <div className="space-y-8">
                          <div>
                            <div className="flex items-center gap-3 mb-6">
                              <div className="p-2 bg-white/10 rounded-xl text-white">
                                <Sparkles size={20} />
                              </div>
                              <h3 className="text-lg font-semibold text-white">Sobre o App</h3>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-white/10 rounded-3xl space-y-6 text-center">
                              <div className="flex justify-center">
                                <div className="w-20 h-20 bg-white text-black rounded-[2rem] flex items-center justify-center shadow-2xl">
                                  <Shield size={40} strokeWidth={2.5} />
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xl font-bold text-white">Cloud Gallery</h4>
                                <p className="text-sm text-zinc-500 mt-1">Versão {APP_VERSION}</p>
                              </div>

                              <div className="pt-4 space-y-3">
                                <button
                                  onClick={() => {
                                    showToast('Buscando atualizações...');
                                    if ('serviceWorker' in navigator) {
                                      navigator.serviceWorker.getRegistrations().then((registrations) => {
                                        if (registrations.length === 0) {
                                          showToast('Você já está na versão mais recente!', 'info');
                                        } else {
                                          for (const registration of registrations) {
                                            registration.update();
                                          }
                                          showToast('Verificação concluída. Se houver novidades, o app atualizará em breve.', 'info');
                                        }
                                      });
                                    } else {
                                      window.location.reload();
                                    }
                                  }}
                                  className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                  <RefreshCw size={20} />
                                  Verificar Atualizações
                                </button>
                                
                                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
                                  Criptografia de Ponta a Ponta Ativa
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
