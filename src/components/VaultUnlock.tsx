import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LockKeyhole, AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function VaultUnlock() {
  const { unlockVault, logOut } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 6 || pin.length > 30) {
      setError('A senha deve ter entre 6 e 30 caracteres');
      return;
    }
    setLoading(true);
    setError('');
    
    const success = await unlockVault(pin);
    if (!success) {
      setError('Falha ao desbloquear o cofre. Verifique sua senha.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-8 text-zinc-100">
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
              className="w-20 h-20 bg-blue-600/20 text-blue-400 rounded-[2rem] flex items-center justify-center shadow-xl shadow-blue-900/10"
            >
              <LockKeyhole size={40} strokeWidth={1.5} />
            </motion.div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-white">Cofre Protegido</h2>
            <p className="text-zinc-400 text-sm px-4 leading-relaxed">
              Sua galeria está criptografada. Digite sua senha para acessar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="space-y-4">
            <div className="relative group">
              <input
                type={showPassword ? "text" : "password"}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={loading}
                className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-3xl py-4 text-center text-xl tracking-[0.2em] font-mono focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-zinc-700 placeholder:tracking-normal text-white"
                placeholder="••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-3 transition-colors"
              >
                {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
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
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-5 rounded-[1.5rem] hover:bg-blue-500 transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center shadow-lg shadow-blue-900/20 text-lg"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                'Desbloquear'
              )}
            </button>
            
            <button
              type="button"
              onClick={logOut}
              className="w-full text-zinc-400 hover:text-white text-sm font-semibold transition-colors py-3 rounded-2xl hover:bg-zinc-900"
            >
              Sair da conta
            </button>
          </div>
        </form>


      </motion.div>
    </div>
  );
}
