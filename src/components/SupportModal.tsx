import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageSquare, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supportDb, initSupportAuth, handleFirestoreError, OperationType, supportAuth } from '../supportFirebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

interface Message {
  id: string;
  primaryUserId: string;
  userEmail: string;
  text: string;
  sender: 'user' | 'admin';
  createdAt: any;
}

export default function SupportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    
    let unsubscribe: () => void;
    
    const setup = async () => {
      setLoading(true);
      setAuthError(null);
      try {
        await initSupportAuth();
      } catch (error: any) {
        setAuthError(error.message);
        setLoading(false);
        return;
      }

      let q = query(
        collection(supportDb, 'support_messages'),
        where('primaryUserId', '==', user.uid),
        orderBy('createdAt', 'asc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        setMessages(msgs);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'support_messages', supportAuth);
      });
    };

    setup();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOpen, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    try {
      await addDoc(collection(supportDb, 'support_messages'), {
        primaryUserId: user.uid,
        userEmail: user.email || 'Usuário',
        text: inputText.trim(),
        sender: 'user',
        createdAt: serverTimestamp()
      });
      setInputText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'support_messages', supportAuth);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-[#0a0a0a] rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 flex h-[85vh] sm:h-[80vh]"
        >
          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-[#0a0a0a]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <MessageSquare size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Suporte
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Fale com a equipe de suporte
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
                </div>
              ) : authError ? (
                <div className="h-full flex flex-col items-center justify-center text-red-400 space-y-3 p-6 text-center">
                  <ShieldAlert size={40} className="opacity-50" />
                  <p className="text-sm font-medium">{authError}</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
                  <MessageSquare size={40} className="opacity-20" />
                  <p className="text-sm">
                    Envie uma mensagem para relatar um problema.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isMe = msg.sender === 'user';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl ${
                          isMe 
                            ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/20 rounded-tr-sm' 
                            : 'bg-white/10 text-zinc-200 border border-white/5 rounded-tl-sm'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        </div>
                        <span className="text-[10px] text-zinc-600 mt-1 px-1 font-medium">
                          {msg.sender === 'admin' ? 'Suporte' : 'Você'}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <form onSubmit={handleSend} className="p-4 border-t border-white/10 bg-[#050505] shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 flex items-center justify-center text-white transition-colors shrink-0"
                >
                  <Send size={18} className="ml-1" />
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
