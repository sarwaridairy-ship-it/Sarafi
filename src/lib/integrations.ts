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
