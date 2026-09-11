export type DocumentType = 'customer_photo' | 'tazkira' | 'passport' | 'other'

export interface DocumentCaptureProvider {
  capture(input: HTMLInputElement): Promise<File | null>
}

export interface BiometricIdentityProvider {
  isAvailable(): Promise<boolean>
  verify(): Promise<{ verified: boolean; reason?: string }>
}

export class BrowserDocumentCaptureProvider implements DocumentCaptureProvider {
  async capture(input: HTMLInputElement): Promise<File | null> {
    return new Promise((resolve) => {
      const complete = () => { input.removeEventListener('change', complete); resolve(input.files?.[0] ?? null) }
      input.addEventListener('change', complete, { once: true })
      input.click()
    })
  }
}

export class UnsupportedBiometricProvider implements BiometricIdentityProvider {
  async isAvailable(): Promise<boolean> { return false }
  async verify(): Promise<{ verified: boolean; reason: string }> { return { verified: false, reason: 'No supported biometric provider is configured' } }
}

export function validateDocumentFile(file: File, allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'], maxBytes = 5 * 1024 * 1024): string | null {
  if (!allowedTypes.includes(file.type)) return 'Document type is not allowed'
  if (file.size <= 0 || file.size > maxBytes) return 'Document must be between 1 byte and 5 MB'
  return null
}

export async function sanitizeIdentityImage(file: File): Promise<{ file: File | null; error: string | null }> {
  const validationError = validateDocumentFile(file, ['image/jpeg', 'image/png'], 8 * 1024 * 1024)
  if (validationError) return { file: null, error: validationError }
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
  const isPng = signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a
  if ((file.type === 'image/jpeg' && !isJpeg) || (file.type === 'image/png' && !isPng)) return { file: null, error: 'Image content does not match its file type' }
  try {
    const bitmap = await createImageBitmap(file)
    if (bitmap.width < 480 || bitmap.height < 300) { bitmap.close(); return { file: null, error: 'Use a clearer image at least 480 by 300 pixels' } }
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return { file: null, error: 'Image could not be processed safely' } }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob || blob.size <= 0 || blob.size > 5 * 1024 * 1024) return { file: null, error: 'Processed image must be no larger than 5 MB' }
    return { file: new File([blob], 'identity-evidence.jpg', { type: 'image/jpeg', lastModified: Date.now() }), error: null }
  } catch {
    return { file: null, error: 'Image could not be decoded safely' }
  }
}
