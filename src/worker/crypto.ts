import { scrypt } from "node:crypto";

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function createToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function timingSafeStringEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return constantTimeBytesEqual(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

async function derivePassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(new Uint8Array(derivedKey));
      },
    );
  });
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(password, salt);
  return `scrypt-v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(input: { password: string; hash: string }): Promise<boolean> {
  const [algorithm, nValue, rValue, pValue, saltValue, expectedValue] = input.hash.split("$");
  if (algorithm !== "scrypt-v1" || !nValue || !rValue || !pValue || !saltValue || !expectedValue) return false;
  if (Number(nValue) !== SCRYPT_N || Number(rValue) !== SCRYPT_R || Number(pValue) !== SCRYPT_P) return false;
  try {
    const actual = await derivePassword(input.password, base64ToBytes(saltValue));
    const expected = base64ToBytes(expectedValue);
    if (actual.byteLength !== expected.byteLength) return false;
    return constantTimeBytesEqual(actual, expected);
  } catch {
    return false;
  }
}
