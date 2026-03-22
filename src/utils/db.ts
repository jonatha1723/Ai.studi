import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface VaultDB extends DBSchema {
  keys: {
    key: string; // user uid
    value: CryptoKey;
  };
  images: {
    key: string; // image id
    value: {
      id: string;
      ciphertext: string;
      iv: string;
      createdAt: any;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<VaultDB>> | null = null;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VaultDB>('secure-vault-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// Key Management
export async function saveKeyToLocal(uid: string, key: CryptoKey) {
  const db = await getDB();
  await db.put('keys', key, uid);
}

export async function getKeyFromLocal(uid: string): Promise<CryptoKey | undefined> {
  const db = await getDB();
  return db.get('keys', uid);
}

export async function removeKeyFromLocal(uid: string) {
  const db = await getDB();
  await db.delete('keys', uid);
}

// Image Cache Management
export async function saveImageToCache(image: { id: string, ciphertext: string, iv: string, createdAt: any }) {
  const db = await getDB();
  await db.put('images', image);
}

export async function getImageFromCache(id: string) {
  const db = await getDB();
  return db.get('images', id);
}

export async function removeImageFromCache(id: string) {
  const db = await getDB();
  await db.delete('images', id);
}

export async function clearImageCache() {
  const db = await getDB();
  await db.clear('images');
}

export async function getAllImagesFromCache() {
  const db = await getDB();
  return db.getAll('images');
}
