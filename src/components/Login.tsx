import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, ShieldCheck, Mail, Key, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const { signIn, signInEmail, signUpEmail, resetPassword } = useAuth();
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUpEmail(email, password);
      } else {
        await signInEmail(email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login por e-mail e senha não está ativado no Firebase. Por favor, ative-o no Console do Firebase (Authentication > Sign-in method).');
      } else {
        console.error('Erro de autenticação:', err);
        setError(`Ops! Algo deu errado\n${err.message || 'Ocorreu um erro inesperado no login'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Digite seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('E-mail de recuperação enviado!');
    } catch (err: any) {
      setError('Erro ao enviar e-mail. Verifique o endereço digitado.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signIn();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('O login foi cancelado.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Este domínio não está autorizado no Firebase. Adicione os domínios do app (ais-dev-... e ais-pre-...) na lista de domínios autorizados (Authentication > Settings > Authorized domains).');
      } else {
        console.error('Erro no Google Sign-In:', err);
        setError(`Ops! Algo deu errado\n${err.message || 'Ocorreu um erro inesperado no login'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 sm:p-8 text-zinc-100">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-12"
      >
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <motion.div 
              initial={{ scale: 0.5, rotate: 10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-20 h-20 bg-white/5 text-white rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl"
            >
              <ShieldCheck size={40} strokeWidth={1} />
            </motion.div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter text-white">Cloud Gallery</h1>
            <p className="text-zinc-500 text-sm px-4 leading-relaxed font-medium">
              Armazenamento em nuvem com criptografia de ponta a ponta.
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!isEmailLogin ? (
            <motion.div
              key="google"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {error && (
                <motion.p 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-lg whitespace-pre-line"
                >
                  {error}
                </motion.p>
              )}
              
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-200/50 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] text-base"
              >
                {loading ? (
                  <div className="relative">
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 blur-md bg-black/20 rounded-full"
                    />
                    <Loader2 className="animate-spin relative z-10" size={20} />
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continuar com o Google
                  </>
                )}
              </button>

              <button
                onClick={() => setIsEmailLogin(true)}
                className="w-full bg-zinc-900/50 hover:bg-zinc-800 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] border border-white/10 text-base"
              >
                <Mail size={20} />
                Entrar com E-mail
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="email"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleSubmit}
              className="space-y-8"
            >
              <div className="space-y-4">
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-white transition-colors" size={20} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail"
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 focus:bg-zinc-800/50 transition-all"
                  />
                </div>

                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-white transition-colors" size={20} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 focus:bg-zinc-800/50 transition-all"
                  />
                </div>
              </div>

              {error && (
                <motion.p 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-lg whitespace-pre-line"
                >
                  {error}
                </motion.p>
              )}

              {message && (
                <motion.p 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-zinc-400 text-xs text-center font-medium bg-white/5 py-2 rounded-lg"
                >
                  {message}
                </motion.p>
              )}

              <div className="space-y-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] text-base"
                >
                  {loading ? (
                    <div className="relative">
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 blur-md bg-black/20 rounded-full"
                      />
                      <Loader2 className="animate-spin relative z-10" size={20} />
                    </div>
                  ) : (
                    <>
                      {isSignUp ? 'Criar Conta' : 'Entrar'}
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>

                <div className="flex flex-col gap-4 text-center">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm text-zinc-400 hover:text-white font-semibold transition-colors py-2"
                  >
                    {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem uma conta? Cadastre-se'}
                  </button>
                  
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Esqueceu a senha?
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsEmailLogin(false);
                      setError('');
                      setMessage('');
                    }}
                    className="text-sm text-zinc-500 hover:text-white font-semibold transition-colors py-3 rounded-2xl hover:bg-zinc-900/50"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
