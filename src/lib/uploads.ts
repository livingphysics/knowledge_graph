import crypto from 'node:crypto';
import fs from 'node:fs';
import { paths } from './db';

export const MAX_PDF_BYTES = 30 * 1024 * 1024; // 30MB (matches middleware + server-action limit)
const PDF_MAGIC = Buffer.from('%PDF');

export class UploadError extends Error {}

/**
 * Hashes the PDF, validates magic bytes, writes to data/uploads/{sha}.pdf.
 * Returns the sha256 hex. If the same hash already exists on disk, it's reused (dedup).
 */
export async function savePdf(file: File): Promise<string> {
  if (file.size === 0) throw new UploadError('PDF file is empty');
  if (file.size > MAX_PDF_BYTES) {
    throw new UploadError(`PDF too large (max ${MAX_PDF_BYTES / 1024 / 1024}MB)`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.subarray(0, 4).equals(PDF_MAGIC)) {
    throw new UploadError('File is not a valid PDF (magic bytes %PDF not found)');
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const dest = paths.uploadFile(sha);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
  return sha;
}
