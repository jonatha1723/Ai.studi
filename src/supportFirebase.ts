import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBiSs-z3089P6-9fx5z-uLn6fVYilot22U",
  authDomain: "testeeeee-12894.firebaseapp.com",
  projectId: "testeeeee-12894",
  storageBucket: "testeeeee-12894.firebasestorage.app",
  messagingSenderId: "728327375572",
  appId: "1:728327375572:web:4439521092b8abf6640941",
  measurementId: "G-0CFC9N0HM1"
};

export const supportApp = initializeApp(firebaseConfig, "support");
export const supportDb = getFirestore(supportApp);
export const supportAuth = getAuth(supportApp);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, authInstance: any) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance.currentUser?.uid,
      email: authInstance.currentUser?.email,
      emailVerified: authInstance.currentUser?.emailVerified,
      isAnonymous: authInstance.currentUser?.isAnonymous,
      tenantId: authInstance.currentUser?.tenantId,
      providerInfo: authInstance.currentUser?.providerData.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const initSupportAuth = async () => {
  try {
    if (!supportAuth.currentUser) {
      await signInAnonymously(supportAuth);
    }
  } catch (error: any) {
    console.error("Erro ao autenticar no servidor de suporte:", error);
    if (error.code === 'auth/admin-restricted-operation') {
      throw new Error("Autenticação anônima desativada. Ative o provedor 'Anônimo' no Firebase Console (Authentication > Sign-in method) do projeto testeeeee-12894.");
    }
    throw error;
  }
};
