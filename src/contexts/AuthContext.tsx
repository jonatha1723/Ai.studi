import React, { createContext, useContext, useEffect, useState } from 'react';
import { authPrimary, dbPrimary } from '../firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { deriveKey, generateSalt, encryptData, decryptData } from '../utils/crypto';
import { saveKeyToLocal, getKeyFromLocal, removeKeyFromLocal } from '../utils/db';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

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
    // 1. Instant Recovery: Check for cached offline user identity
    // This allows the app to bypass the login screen immediately even before Firebase SDK initializes
    const savedOfflineUser = localStorage.getItem('offline_user');
    let initialUser: any = null;
    
    if (savedOfflineUser) {
      try {
        initialUser = JSON.parse(savedOfflineUser);
        setUser(initialUser);
        
        const cachedVaultData = localStorage.getItem(`vault_data_${initialUser.uid}`);
        if (cachedVaultData) {
          const data = JSON.parse(cachedVaultData);
          setNeedsSetup(false);
          setExtraPassword(data.extraPassword || null);
          setSecurityImageId(data.securityImageId || null);
          setIsAuthReady(true); // Instant unblock to VaultUnlock screen
        }
      } catch (e) {
        console.error('Failed to parse offline user', e);
      }
    }

    // 2. Auth state listener (Background sync)
    const unsubscribePrimary = onAuthStateChanged(authPrimary, async (currentUser) => {
      if (currentUser) {
        // Persist user identity for future offline boots
        const offlineUserInfo = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL
        };
        localStorage.setItem('offline_user', JSON.stringify(offlineUserInfo));
        setUser(currentUser);
        
        const cachedData = localStorage.getItem(`vault_data_${currentUser.uid}`);
        
        if (cachedData) {
          const data = JSON.parse(cachedData);
          setNeedsSetup(false);
          setExtraPassword(data.extraPassword || null);
          setSecurityImageId(data.securityImageId || null);
          setIsAuthReady(true);

          if (navigator.onLine) {
            try {
              const userDoc = await getDoc(doc(dbPrimary, 'users', currentUser.uid));
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
            } catch (error) {
              handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            }
          }
        } else {
          try {
            const userDoc = await Promise.race([
              getDoc(doc(dbPrimary, 'users', currentUser.uid)),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            
            if (userDoc && userDoc.exists()) {
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
            } else {
              setNeedsSetup(!userDoc || !userDoc.exists());
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          }
          setIsAuthReady(true);
        }
      } else {
        // ONLY clear session if we are online (meaning the session actually expired)
        // If offline, we keep the offline_user to allow access to local vault
        if (navigator.onLine) {
          setUser(null);
          localStorage.removeItem('offline_user');
          setCryptoKey(null);
          setNeedsSetup(false);
          setExtraPassword(null);
          setSecurityImageId(null);
        }
        setIsAuthReady(true);
      }
    });

    // 3. Safety fallback: If no offline user and SDK is slow, show login after a short delay
    const timeout = setTimeout(() => {
      if (!isAuthReady) {
        setIsAuthReady(true);
      }
    }, savedOfflineUser ? 5000 : 1500);

    return () => {
      unsubscribePrimary();
      clearTimeout(timeout);
    };
  }, []);

  const signIn = async () => {
    let retries = 0;
    const maxRetries = 2;

    const attemptSignIn = async (): Promise<void> => {
      try {
        const provider = new GoogleAuthProvider();
        // Login no primário
        await signInWithPopup(authPrimary, provider);
      } catch (error: any) {
        if (error.code === 'auth/network-request-failed' && retries < maxRetries) {
          retries++;
          console.warn(`Tentativa de login falhou (rede). Tentando novamente (${retries}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          return attemptSignIn();
        }
        
        if (error.code === 'auth/network-request-failed') {
          throw new Error("Falha na conexão com o servidor de autenticação. Verifique sua internet ou se há algum bloqueador de anúncios impedindo o acesso.");
        }
        
        console.error("Erro ao autenticar no projeto primário:", error);
        throw error;
      }
    };

    return attemptSignIn();
  };

  const signInEmail = async (email: string, password: string) => {
    console.log("Iniciando signInEmail...");
    await signInWithEmailAndPassword(authPrimary, email, password);
  };

  const signUpEmail = async (email: string, password: string) => {
    console.log("Iniciando signUpEmail...");
    await createUserWithEmailAndPassword(authPrimary, email, password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(authPrimary, email);
  };

  const logOut = async () => {
    if (user) {
      await removeKeyFromLocal(user.uid);
    }
    await signOut(authPrimary);
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
        await setDoc(doc(dbPrimary, 'users', user.uid), {
          salt,
          verification,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
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
        let userDoc = await Promise.race([
          getDoc(doc(dbPrimary, 'users', user.uid)),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        
        if (!userDoc.exists()) {
        }
        
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
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
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
      await setDoc(doc(dbPrimary, 'users', user.uid), {
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
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const setSecurityImage = async (imageId: string | null) => {
    if (!user) return;
    try {
      await setDoc(doc(dbPrimary, 'users', user.uid), {
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
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
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
