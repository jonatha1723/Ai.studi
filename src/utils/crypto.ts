const ALGORITHM = 'AES-GCM';
const PBKDF2_ITERATIONS = 100000;
const SALT_SIZE = 16;
const IV_SIZE = 12;

export async function generateSalt(): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  return btoa(String.fromCharCode(...salt));
}

export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: string, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_SIZE));
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    enc.encode(data)
  );

  let binary = '';
  const bytes = new Uint8Array(encrypted);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    ciphertext: btoa(binary),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptData(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  const ciphertextStr = atob(ciphertextBase64);
  const ciphertext = new Uint8Array(ciphertextStr.length);
  for (let i = 0; i < ciphertextStr.length; i++) {
    ciphertext[i] = ciphertextStr.charCodeAt(i);
  }

  const ivStr = atob(ivBase64);
  const iv = new Uint8Array(ivStr.length);
  for (let i = 0; i < ivStr.length; i++) {
    iv[i] = ivStr.charCodeAt(i);
  }

  const decrypted = await window.crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}
