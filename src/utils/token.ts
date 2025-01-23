import * as crypto from 'crypto';

export function generateUUIDToken(): string {
  const token = crypto.randomUUID();
  return token.replace(/-/g, '');
}

export function generateUniqueHashFromBuffer(buffer: Buffer): string {
  const base64 = buffer.toString('base64');
  const hash = crypto.createHash('sha256').update(base64).digest('hex');
  return hash;
}
