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
  extraPassword: string | null;
  securityImageId: string | null;
  updateExtraPassword: (password: string) => Promise<void>;
  setSecurityImage: (imageId: string | null) => Promise<void>;
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
  const [extraPassword, setExtraPassword] = useState<string | null>(null);
  const [securityImageId, setSecurityImageId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const cachedData = localStorage.getItem(`vault_data_${currentUser.uid}`);
        
        if (cachedData) {
          // INSTANT LOAD FROM CACHE
          const data = JSON.parse(cachedData);
          setNeedsSetup(false);
          setExtraPassword(data.extraPassword || null);
          setSecurityImageId(data.securityImageId || null);
          setIsAuthReady(true); // Unblock UI immediately!

          // Update cache in background if online
          if (navigator.onLine) {
            try {
              const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
              if (userDoc.exists()) {
                const freshData = userDoc.data();
                setExtraPassword(freshData.extraPassword || null);
                setSecurityImageId(freshData.securityImageId || null);
                localStorage.setItem(`vault_data_${currentUser.uid}`, JSON.stringify({
                  salt: freshData.salt,
                  verification: freshData.verification,
                  extraPassword: freshData.extraPassword,
                  securityImageId: freshData.securityImageId
                }));
              }
            } catch (e) {
              console.error('Background fetch failed', e);
            }
          }
        } else {
          // No cache, wait for network
          try {
            const userDoc = await Promise.race([
              getDoc(doc(db, 'users', currentUser.uid)),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
            if (!userDoc.exists()) {
              setNeedsSetup(true);
            } else {
              setNeedsSetup(false);
              const data = userDoc.data();
              setExtraPassword(data.extraPassword || null);
              setSecurityImageId(data.securityImageId || null);
              
              localStorage.setItem(`vault_data_${currentUser.uid}`, JSON.stringify({
                salt: data.salt,
                verification: data.verification,
                extraPassword: data.extraPassword,
                securityImageId: data.securityImageId
              }));
            }
          } catch (error) {
            console.error('Erro ao buscar dados do usuário:', error);
            setNeedsSetup(false);
          }
          setIsAuthReady(true);
        }
      } else {
        setCryptoKey(null);
        setNeedsSetup(false);
        setExtraPassword(null);
        setSecurityImageId(null);
        setIsAuthReady(true);
      }
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
      const pinKey = await deriveKey(pin, salt, true);
      
      // Encrypt a verification string to check the PIN later
      const verification = await encryptData('vault-check', pinKey);

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
      
      localStorage.setItem(`vault_data_${user.uid}`, JSON.stringify({
        salt,
        verification,
        extraPassword: null,
        securityImageId: null
      }));

      await saveKeyToLocal(user.uid, pinKey);
      setCryptoKey(pinKey);
      setNeedsSetup(false);
    } catch (error) {
      console.error('Erro ao configurar o cofre:', error);
      throw error;
    }
  };

  const unlockVault = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      let data;
      const cachedData = localStorage.getItem(`vault_data_${user.uid}`);
      
      if (cachedData) {
        data = JSON.parse(cachedData);
      } else {
        const userDoc = await Promise.race([
          getDoc(doc(db, 'users', user.uid)),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        if (!userDoc.exists()) return false;
        data = userDoc.data();
        localStorage.setItem(`vault_data_${user.uid}`, JSON.stringify({
          salt: data.salt,
          verification: data.verification,
          extraPassword: data.extraPassword,
          securityImageId: data.securityImageId
        }));
      }
      
      const salt = data.salt;
      const pinKey = await deriveKey(pin, salt, true);
      
      // 1. Verify the PIN
      if (data.verification) {
        try {
          const check = await decryptData(data.verification.ciphertext, data.verification.iv, pinKey);
          if (check !== 'vault-check') return false;
        } catch (e) {
          return false; // Wrong PIN
        }
      }

      await saveKeyToLocal(user.uid, pinKey);
      setCryptoKey(pinKey);
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

  const updateExtraPassword = async (password: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        extraPassword: password
      }, { merge: true });
      setExtraPassword(password);
      
      const cachedData = localStorage.getItem(`vault_data_${user.uid}`);
      if (cachedData) {
        const data = JSON.parse(cachedData);
        data.extraPassword = password;
        localStorage.setItem(`vault_data_${user.uid}`, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Erro ao atualizar senha extra:', error);
      throw error;
    }
  };

  const setSecurityImage = async (imageId: string | null) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        securityImageId: imageId
      }, { merge: true });
      setSecurityImageId(imageId);
      
      const cachedData = localStorage.getItem(`vault_data_${user.uid}`);
      if (cachedData) {
        const data = JSON.parse(cachedData);
        data.securityImageId = imageId;
        localStorage.setItem(`vault_data_${user.uid}`, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Erro ao definir imagem de segurança:', error);
      throw error;
    }
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
      lockVault,
      extraPassword,
      securityImageId,
      updateExtraPassword,
      setSecurityImage
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
