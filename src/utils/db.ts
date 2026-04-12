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
  trash: {
    key: string; // image id
    value: {
      id: string;
      ciphertext: string;
      iv: string;
      createdAt: any;
      deletedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<VaultDB>> | null = null;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VaultDB>('secure-vault-db', 2, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('trash')) {
          db.createObjectStore('trash', { keyPath: 'id' });
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

// Trash Management
export async function saveToTrash(item: { id: string, ciphertext: string, iv: string, createdAt: any, deletedAt: number }) {
  const db = await getDB();
  await db.put('trash', item);
}

export async function getTrashItems() {
  const db = await getDB();
  return db.getAll('trash');
}

export async function removeFromTrash(id: string) {
  const db = await getDB();
  await db.delete('trash', id);
}

export async function clearTrash() {
  const db = await getDB();
  await db.clear('trash');
}
