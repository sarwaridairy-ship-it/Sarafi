import { describe, expect, it } from 'vitest'
import { fallbackDocumentTemplates, localizedDocumentTemplate, mergeDocumentTemplates, renderDocumentTemplate } from './documentTemplates'

describe('document templates', () => {
  it('renders the fixed Dari receipt wording with only transaction variables changed', () => {
    const record = fallbackDocumentTemplates.find((item) => item.template_code === 'transaction.buy_fx')!
    const localized = localizedDocumentTemplate(record, 'fa-AF')
    const body = renderDocumentTemplate(localized.body, {
      received_amount: '1,000',
      received_currency: 'USD',
      given_amount: '70,250',
      given_currency: 'AFN',
    })

    expect(localized.title).toBe('خرید اسعار')
    expect(body).toContain('1,000 USD')
    expect(body).toContain('70,250 AFN')
    expect(body).not.toMatch(/\{[a-z_]+\}/)
  })

  it('lets an active database record replace the matching fallback without removing other templates', () => {
    const merged = mergeDocumentTemplates([{
      ...fallbackDocumentTemplates.find((item) => item.template_code === 'report.filtered')!,
      title_en: 'Custom report note',
    }])

    expect(merged.find((item) => item.template_code === 'report.filtered')?.title_en).toBe('Custom report note')
    expect(merged.some((item) => item.template_code === 'transaction.sell_fx')).toBe(true)
  })
})
