import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableIndexedDbPersistence } from 'firebase/firestore';
import localConfig from '../firebase-applet-config.json';

// 1. Tenta carregar as variáveis de ambiente
const primaryConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID
};

// Se a chave da API existir no .env, usa o .env. Senão, usa o arquivo local.
const firebaseConfigPrimary = primaryConfig.apiKey ? primaryConfig : localConfig;

// Initialize Apps
const appPrimary = initializeApp(firebaseConfigPrimary, 'primary');

export const authPrimary = getAuth(appPrimary);
export const dbPrimary = getFirestore(appPrimary, firebaseConfigPrimary.firestoreDatabaseId || '(default)');

// Set Auth persistence
setPersistence(authPrimary, browserLocalPersistence).catch(console.error);

// Enable Firestore persistence (Primary only for now to avoid conflicts)
enableIndexedDbPersistence(dbPrimary).catch(console.warn);

