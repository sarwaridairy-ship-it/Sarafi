import { describe, expect, it } from 'vitest'
import { UnsupportedBiometricProvider, validateDocumentFile } from './integrations'

describe('optional integration boundaries', () => {
  it('accepts only supported private-document formats and size', () => {
    expect(validateDocumentFile(new File(['image'], 'id.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(validateDocumentFile(new File(['text'], 'id.txt', { type: 'text/plain' }))).toBe('Document type is not allowed')
    expect(validateDocumentFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }))).toBe('Document must be between 1 byte and 5 MB')
  })

  it('fails safely when biometric hardware is unavailable', async () => {
    const provider = new UnsupportedBiometricProvider()
    expect(await provider.isAvailable()).toBe(false)
    await expect(provider.verify()).resolves.toEqual({ verified: false, reason: 'No supported biometric provider is configured' })
  })
})
