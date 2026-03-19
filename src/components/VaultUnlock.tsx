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
              <LockKeyhole size={40} strokeWidth={1} />
            </motion.div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter text-white">Cofre Protegido</h2>
            <p className="text-zinc-500 text-sm px-4 leading-relaxed font-medium">
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
                className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 text-center text-xl tracking-[0.2em] font-mono focus:outline-none focus:border-white/30 focus:bg-zinc-800/50 transition-all placeholder:text-zinc-700 placeholder:tracking-normal text-white"
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
              className="w-full bg-white text-black font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] text-base"
            >
              {loading ? (
                <div className="flex gap-1.5 items-center justify-center">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1.5 h-1.5 bg-black rounded-full"
                    />
                  ))}
                </div>
              ) : (
                'Desbloquear'
              )}
            </button>
            
            <button
              type="button"
              onClick={logOut}
              className="w-full text-zinc-400 hover:text-white text-sm font-semibold transition-colors py-3 rounded-2xl hover:bg-zinc-900/50"
            >
              Sair da conta
            </button>
          </div>
        </form>


      </motion.div>
    </div>
  );
}
