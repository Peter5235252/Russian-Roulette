/**
 * Client-Side End-to-End Encryption Utility
 * Uses native Web Crypto API (AES-GCM 256-bit with PBKDF2 key derivation & randomized IV)
 * to encrypt sensitive API keys before persisting them in browser storage.
 */

const ENCRYPTION_PREFIX = 'enc:v1:';

// Get or initialize a unique persistent device salt for key derivation
function getDeviceSalt(): Uint8Array {
  const saltKey = 'dealer_device_salt_v1';
  let saltHex = localStorage.getItem(saltKey);
  if (!saltHex) {
    const randomSalt = crypto.getRandomValues(new Uint8Array(16));
    saltHex = Array.from(randomSalt, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.getItem(saltKey) || localStorage.setItem(saltKey, saltHex);
  }
  const bytes = new Uint8Array(saltHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(saltHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Derive a 256-bit AES-GCM key from device fingerprint context
async function deriveSecretKey(): Promise<CryptoKey> {
  const salt = getDeviceSalt();
  const encoder = new TextEncoder();
  const rawKeyMaterial = encoder.encode(`DEALER_AI_KEY_SECRET_${window.location.host}_${navigator.userAgent}`);
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    rawKeyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an API key string using AES-GCM 256.
 */
export async function encryptApiKey(plainText: string): Promise<string> {
  if (!plainText || plainText.startsWith(ENCRYPTION_PREFIX)) {
    return plainText; // Already empty or encrypted
  }

  try {
    const key = await deriveSecretKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plainText);

    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    const ivHex = Array.from(iv, b => b.toString(16).padStart(2, '0')).join('');
    const dataArray = new Uint8Array(encryptedContent);
    const dataHex = Array.from(dataArray, b => b.toString(16).padStart(2, '0')).join('');

    return `${ENCRYPTION_PREFIX}${ivHex}:${dataHex}`;
  } catch (err) {
    console.error('Failed to encrypt API key:', err);
    return plainText; // Fallback
  }
}

/**
 * Decrypts an encrypted API key payload.
 */
export async function decryptApiKey(cipherPayload: string): Promise<string> {
  if (!cipherPayload || !cipherPayload.startsWith(ENCRYPTION_PREFIX)) {
    return cipherPayload; // Unencrypted legacy key
  }

  try {
    const raw = cipherPayload.substring(ENCRYPTION_PREFIX.length);
    const [ivHex, dataHex] = raw.split(':');
    if (!ivHex || !dataHex) return '';

    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    const data = new Uint8Array(dataHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);

    const key = await deriveSecretKey();
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  } catch (err) {
    console.error('Failed to decrypt API key:', err);
    return '';
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}
