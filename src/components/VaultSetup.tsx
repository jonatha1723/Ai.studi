import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function VaultSetup() {
  const { setupVault, logOut } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const handleSubmit = async (e?: React.FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (pin.length < 6 || pin.length > 30) {
      setError('A senha deve ter entre 6 e 30 caracteres');
      return;
    }
    if (pin !== confirmPin) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      await setupVault(pin);
    } catch (err) {
      setError('Falha ao configurar o cofre');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 sm:p-8 text-zinc-100">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-10"
      >
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <motion.div 
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-20 h-20 bg-white/5 text-white rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl"
            >
              <ShieldCheck size={40} strokeWidth={1} />
            </motion.div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter text-white">Configurar Cofre</h2>
            <p className="text-zinc-500 text-sm px-4 leading-relaxed font-medium">
              Crie sua senha mestre para criptografar suas fotos.
            </p>
          </div>
        </div>

        <div className="p-5 bg-zinc-900/50 border border-white/10 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-zinc-400 shrink-0 mt-0.5" size={20} />
          <p className="text-[11px] text-zinc-400 leading-tight uppercase font-bold tracking-wider">
            Se você esquecer esta senha, seus arquivos serão perdidos para sempre.
          </p>
        </div>

        <div 
          className="space-y-10"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          <div className="space-y-6">
            <div className="relative group">
              <input
                type="text"
                name="setup-input-1"
                id="setup-input-1"
                style={{ WebkitTextSecurity: showPin ? 'none' : 'disc' }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={loading}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 text-center text-xl tracking-[0.2em] font-mono focus:outline-none focus:border-white/30 focus:bg-zinc-900 transition-all placeholder:text-zinc-700 placeholder:tracking-normal text-white"
                placeholder="Digite a senha"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-3 transition-colors"
              >
                {showPin ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>

            <div className="relative group">
              <input
                type="text"
                name="setup-input-2"
                id="setup-input-2"
                style={{ WebkitTextSecurity: showConfirmPin ? 'none' : 'disc' }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                disabled={loading}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 text-center text-xl tracking-[0.2em] font-mono focus:outline-none focus:border-white/30 focus:bg-zinc-900 transition-all placeholder:text-zinc-700 placeholder:tracking-normal text-white"
                placeholder="Repita a senha"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPin(!showConfirmPin)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-3 transition-colors"
              >
                {showConfirmPin ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>
            
            {error && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={loading}
              className="w-full bg-white text-black font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] text-base"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                'Criar Cofre'
              )}
            </button>
            
            <button
              type="button"
              onClick={logOut}
              className="w-full text-zinc-400 hover:text-white text-sm font-semibold transition-colors py-3 rounded-2xl hover:bg-zinc-900"
            >
              Cancelar e Sair
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
