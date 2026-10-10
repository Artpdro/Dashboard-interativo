/**
 * Criptografia da senha SMTP em repouso (AES-256-GCM).
 *
 *  - Chave: SMTP_ENCRYPTION_KEY (recomendado) ou, na falta dela, JWT_SECRET.
 *  - Compatível com dados antigos: valores sem o prefixo "enc:v1:" são tratados como texto puro
 *    e passam a ser criptografados na próxima vez que a configuração for salva.
 */
import crypto from 'crypto';
import { AppError } from './errorHandler';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const secret = process.env.SMTP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError(
      'Defina SMTP_ENCRYPTION_KEY (ou JWT_SECRET) no arquivo .env para proteger a senha SMTP.',
      500,
      'NO_SECRET_KEY'
    );
  }
  return crypto.createHash('sha256').update(`crm-smtp:${secret}`).digest();
}

export const isEncrypted = (value: string): boolean => value.startsWith(PREFIX);

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legado: texto puro
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'Não foi possível ler a senha SMTP salva (a chave de criptografia mudou). Abra a configuração SMTP e informe a senha novamente.',
      400,
      'SMTP_PASSWORD_UNREADABLE'
    );
  }
}
