/**
 * Cryptographic Password Hashing & Biometric Security Utilities
 * Implements SHA-256 hashing with salt using browser Web Crypto API.
 */

const SALT = 'exam_guardrail_salt_sec_2025';

/**
 * Computes a secure SHA-256 hash of a password string.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}:${SALT}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a plain text password against either a stored SHA-256 hash
 * or stored plaintext (with fallback for legacy records).
 */
export async function verifyPassword(
  enteredPassword: string,
  storedHash?: string,
  storedPlain?: string
): Promise<boolean> {
  const trimmed = enteredPassword.trim();
  if (!trimmed) return false;

  if (storedHash) {
    const computedHash = await hashPassword(trimmed);
    if (computedHash === storedHash) {
      return true;
    }
  }

  if (storedPlain && storedPlain.trim() === trimmed) {
    return true;
  }

  return false;
}
