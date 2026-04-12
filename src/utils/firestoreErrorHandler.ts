import { authPrimary } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    message: error instanceof Error ? error.message : String(error),
    operation: operationType,
    // Path is safe to keep for debugging, but we remove personal data
    timestamp: new Date().toISOString()
  };
  
  console.error('[Cloud Gallery] Registro de Falha Operacional:', errInfo);
  // Throwing a clean error message that doesn't leak secrets
  throw new Error(`Erro no Banco de Dados (${operationType}): ${errInfo.message}`);
}
