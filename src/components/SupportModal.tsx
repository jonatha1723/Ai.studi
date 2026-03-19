import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageSquare, User, ShieldAlert, Loader2, ChevronLeft } from 'lucide-react';
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.email === 'suporte@gmail.com';

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

      let q;
      if (isAdmin) {
        q = query(collection(supportDb, 'support_messages'), orderBy('createdAt', 'asc'));
      } else {
        q = query(
          collection(supportDb, 'support_messages'),
          where('primaryUserId', '==', user.uid),
          orderBy('createdAt', 'asc')
        );
      }

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
  }, [isOpen, user, isAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUserId]);

  const groupedMessages = useMemo(() => {
    if (!isAdmin) return {};
    const groups: Record<string, Message[]> = {};
    messages.forEach(m => {
      if (!groups[m.primaryUserId]) groups[m.primaryUserId] = [];
      groups[m.primaryUserId].push(m);
    });
    return groups;
  }, [messages, isAdmin]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    const targetUserId = isAdmin ? selectedUserId : user.uid;
    if (isAdmin && !targetUserId) return;

    const targetEmail = isAdmin 
      ? (groupedMessages[targetUserId!]?.[0]?.userEmail || 'Usuário') 
      : (user.email || 'Usuário');

    try {
      await addDoc(collection(supportDb, 'support_messages'), {
        primaryUserId: targetUserId,
        userEmail: targetEmail,
        text: inputText.trim(),
        sender: isAdmin ? 'admin' : 'user',
        createdAt: serverTimestamp()
      });
      setInputText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'support_messages', supportAuth);
    }
  };

  if (!isOpen) return null;

  const displayMessages = isAdmin && selectedUserId 
    ? groupedMessages[selectedUserId] || []
    : (!isAdmin ? messages : []);

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
          {/* Admin Sidebar */}
          {isAdmin && (
            <div className={`w-full sm:w-1/3 border-r border-white/10 flex flex-col bg-[#050505] ${selectedUserId ? 'hidden sm:flex' : 'flex'}`}>
              <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <ShieldAlert size={18} className="text-emerald-400" />
                  Painel Admin
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 sm:hidden">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {Object.keys(groupedMessages).length === 0 ? (
                  <div className="p-4 text-sm text-zinc-500 text-center mt-10">Nenhum ticket aberto.</div>
                ) : (
                  Object.keys(groupedMessages).map(uid => {
                    const msgs = groupedMessages[uid];
                    const lastMsg = msgs[msgs.length - 1];
                    return (
                      <button
                        key={uid}
                        onClick={() => setSelectedUserId(uid)}
                        className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedUserId === uid ? 'bg-white/10 border-l-2 border-l-emerald-500' : ''}`}
                      >
                        <p className="font-medium text-zinc-200 truncate text-sm">{lastMsg.userEmail}</p>
                        <p className="text-xs text-zinc-500 truncate mt-1">{lastMsg.text}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Chat Area */}
          <div className={`flex-1 flex flex-col bg-[#0a0a0a] ${isAdmin && !selectedUserId ? 'hidden sm:flex' : 'flex'}`}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
              <div className="flex items-center gap-3">
                {isAdmin && selectedUserId && (
                  <button onClick={() => setSelectedUserId(null)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 sm:hidden">
                    <ChevronLeft size={24} />
                  </button>
                )}
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  {isAdmin ? <User size={20} className="text-zinc-400" /> : <MessageSquare size={20} className="text-emerald-400" />}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {isAdmin ? (selectedUserId ? groupedMessages[selectedUserId]?.[0]?.userEmail : 'Selecione um ticket') : 'Suporte'}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {isAdmin ? 'Respondendo como Admin' : 'Fale com a equipe de suporte'}
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
              ) : (!isAdmin && messages.length === 0) || (isAdmin && !selectedUserId) ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
                  <MessageSquare size={40} className="opacity-20" />
                  <p className="text-sm">
                    {isAdmin ? 'Selecione um usuário na barra lateral para responder.' : 'Envie uma mensagem para relatar um problema.'}
                  </p>
                </div>
              ) : (
                <>
                  {displayMessages.map((msg) => {
                    const isMe = isAdmin ? msg.sender === 'admin' : msg.sender === 'user';
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
                          {msg.sender === 'admin' ? 'Suporte' : (isAdmin ? msg.userEmail : 'Você')}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {(!isAdmin || selectedUserId) && (
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
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
