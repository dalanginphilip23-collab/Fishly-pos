import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { fail } from './db.js'

export const photoDirectory = fileURLToPath(new URL('../uploads/photos/', import.meta.url))
export const photoPattern = /^\/api\/uploads\/photos\/[a-f0-9-]{36}\.(jpg|png|webp)$/

export function photoExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) throw fail(400, 'Choose a valid JPG, PNG or WebP image')
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  throw fail(400, 'Choose a valid JPG, PNG or WebP image')
}

export async function verifyPhoto(url) {
  if (url == null) return
  if (typeof url !== 'string' || !photoPattern.test(url)) throw fail(400, 'Upload a product photo first')
  try { await access(photoDirectory + url.split('/').at(-1)) }
  catch { throw fail(400, 'Photo not found. Please upload it again.') }
}
