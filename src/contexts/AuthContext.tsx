import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { deriveKey, generateSalt, encryptData, decryptData } from '../utils/crypto';
import { saveKeyToLocal, getKeyFromLocal, removeKeyFromLocal } from '../utils/db';

interface AuthContextType {
  user: User | null;
  cryptoKey: CryptoKey | null;
  isAuthReady: boolean;
  needsSetup: boolean;
  signIn: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  setupVault: (pin: string) => Promise<void>;
  unlockVault: (pin: string) => Promise<boolean>;
  lockVault: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has a salt in Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (!userDoc.exists()) {
            setNeedsSetup(true);
          } else {
            setNeedsSetup(false);
          }
        } catch (error) {
          console.error('Erro ao buscar dados do usuário:', error);
        }
      } else {
        setCryptoKey(null);
        setNeedsSetup(false);
      }
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      throw error;
    }
  };

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logOut = async () => {
    if (user) {
      await removeKeyFromLocal(user.uid);
    }
    await signOut(auth);
    setCryptoKey(null);
  };

  const setupVault = async (pin: string) => {
    if (!user) return;
    try {
      const salt = await generateSalt();
      const key = await deriveKey(pin, salt);
      
      // Encrypt a verification string to check the password later
      const verification = await encryptData('vault-check', key);

      try {
        await setDoc(doc(db, 'users', user.uid), {
          salt,
          verification,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Erro ao salvar configuração do cofre:', error);
        throw error;
      }
      
      await saveKeyToLocal(user.uid, key);
      setCryptoKey(key);
      setNeedsSetup(false);
    } catch (error) {
      console.error('Erro ao configurar o cofre:', error);
      throw error;
    }
  };

  const unlockVault = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) return false;
      
      const data = userDoc.data();
      const salt = data.salt;
      const key = await deriveKey(pin, salt);
      
      // Verify the key using the verification string
      if (data.verification) {
        try {
          const check = await decryptData(data.verification.ciphertext, data.verification.iv, key);
          if (check !== 'vault-check') return false;
        } catch (e) {
          return false; // Decryption failed, wrong password
        }
      } else {
        // Fallback for old accounts: try to decrypt the first image
        const q = query(collection(db, 'images'), where('userId', '==', user.uid), limit(1));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const img = snapshot.docs[0].data();
          try {
            await decryptData(img.ciphertext, img.iv, key);
            // If successful, save verification string for future
            const verification = await encryptData('vault-check', key);
            await setDoc(doc(db, 'users', user.uid), { verification }, { merge: true });
          } catch (e) {
            // Decryption failed. It could be a wrong password or a corrupted image.
            // We don't block them from entering, but we don't save the verification string.
            // They will see "Failed to decrypt" in the gallery and can delete the image.
            console.warn('Fallback decryption failed. Password might be wrong or image corrupted.');
          }
        } else {
          // Vault is empty, so we can't verify. Just save the verification string for the future.
          const verification = await encryptData('vault-check', key);
          await setDoc(doc(db, 'users', user.uid), { verification }, { merge: true });
        }
      }
      
      await saveKeyToLocal(user.uid, key);
      setCryptoKey(key);
      return true;
    } catch (e) {
      console.error('Erro ao desbloquear o cofre:', e);
      return false;
    }
  };

  const lockVault = async () => {
    if (user) {
      await removeKeyFromLocal(user.uid);
    }
    setCryptoKey(null);
  };

  useEffect(() => {
    if (!cryptoKey) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      const timerSetting = localStorage.getItem('autoLockTimer') || '15';
      if (timerSetting === 'never') {
        clearTimeout(timeoutId);
        return;
      }
      
      const minutes = parseInt(timerSetting, 10);
      if (isNaN(minutes)) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lockVault();
      }, minutes * 60 * 1000);
    };

    const handleActivity = () => {
      resetTimer();
    };

    // Initial setup
    resetTimer();

    // Listeners
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [cryptoKey, user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      cryptoKey, 
      isAuthReady, 
      needsSetup, 
      signIn, 
      signInEmail,
      signUpEmail,
      resetPassword,
      logOut, 
      setupVault, 
      unlockVault, 
      lockVault 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
