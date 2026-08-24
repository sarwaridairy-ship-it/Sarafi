import { describe, expect, it } from 'vitest'
import { hasCompleteTranslations, isRtl, requiredTranslationKeys, translate } from './i18n'

describe('Afghanistan localization resources', () => {
  it('has complete English, Dari, and Pashto key coverage', () => {
    expect(requiredTranslationKeys().length).toBeGreaterThan(20)
    expect(hasCompleteTranslations('en')).toBe(true)
    expect(hasCompleteTranslations('fa-AF')).toBe(true)
    expect(hasCompleteTranslations('ps-AF')).toBe(true)
  })
  it('switches direction only for Dari and Pashto', () => {
    expect(isRtl('en')).toBe(false)
    expect(isRtl('fa-AF')).toBe(true)
    expect(isRtl('ps-AF')).toBe(true)
    expect(translate('fa-AF', 'buy')).toBe('خرید ارز')
  })
})
