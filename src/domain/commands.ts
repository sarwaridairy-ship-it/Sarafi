import { z } from 'zod'

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal amount')
const uuid = z.string().uuid()

export const inlineRatePublicationSchema = z.object({
  branch_id: uuid.optional(),
  source_currency: z.string().length(3).toUpperCase(),
  target_currency: z.string().length(3).toUpperCase(),
  buy_rate: decimalString.refine((value) => value !== '0', 'Rate must be greater than zero'),
  sell_rate: decimalString.refine((value) => value !== '0', 'Rate must be greater than zero'),
})

export type InlineRatePublication = z.infer<typeof inlineRatePublicationSchema>

export const fxTradeCommandSchema = z.object({
  organization_id: uuid,
  branch_id: uuid,
  cashbox_id: uuid,
  client_command_id: z.string().trim().min(1).max(128),
  side: z.enum(['BUY_FX', 'SELL_FX', 'EXCHANGE_FX']),
  sold_currency: z.string().length(3).toUpperCase(),
  sold_amount: decimalString,
  bought_currency: z.string().length(3).toUpperCase(),
  bought_amount: decimalString,
  base_currency: z.string().length(3).toUpperCase(),
  sold_base_value: decimalString,
  bought_base_value: decimalString,
  occurred_at: z.string().datetime().optional(),
  memo: z.string().trim().max(500).optional(),
  counterparty_id: uuid.optional(),
  fee_amount: decimalString.optional(),
  fee_currency: z.string().length(3).toUpperCase().optional(),
  customer_rate: decimalString.optional(),
  device_id: uuid.optional(),
  rate_source: z.enum(['shop_rate', 'transaction_override', 'approved_stale_shop_rate']).optional(),
  override_reason: z.string().trim().min(3).max(500).optional(),
  approval_reason: z.string().trim().min(3).max(500).optional(),
  allow_stale_rate: z.boolean().optional(),
  approval_id: uuid.optional(),
  publish_rate: inlineRatePublicationSchema.optional(),
  publish_rates: z.array(inlineRatePublicationSchema).max(2).optional(),
}).superRefine((command, context) => {
  if (command.sold_currency === command.bought_currency) context.addIssue({ code: 'custom', path: ['bought_currency'], message: 'Trade currencies must differ' })
  if (command.sold_amount === '0' || command.bought_amount === '0') context.addIssue({ code: 'custom', path: ['sold_amount'], message: 'Trade amounts must be greater than zero' })
  if (command.fee_amount === '0') context.addIssue({ code: 'custom', path: ['fee_amount'], message: 'Fee must be greater than zero when supplied' })
  if (command.fee_amount && command.fee_currency && command.fee_currency !== command.base_currency && command.fee_currency !== command.sold_currency && command.fee_currency !== command.bought_currency) context.addIssue({ code: 'custom', path: ['fee_currency'], message: 'Fee currency must be part of the trade' })
})

export type FxTradeCommand = z.infer<typeof fxTradeCommandSchema>

export function parseFxTradeCommand(input: unknown): FxTradeCommand {
  return fxTradeCommandSchema.parse(input)
}

const hawalaCreateBaseSchema = z.object({
  organization_id: uuid,
  branch_id: uuid,
  hawala_partner_id: uuid,
  sender_name: z.string().trim().min(2).max(160),
  beneficiary_counterparty_id: uuid.optional(),
  beneficiary_name: z.string().trim().min(2).max(160),
  destination_location: z.string().trim().min(2).max(160),
  currency: z.string().length(3).toUpperCase(),
  amount: decimalString.refine((value) => value !== '0', 'Amount must be greater than zero'),
  fee: decimalString.optional(),
  reference_code: z.string().trim().min(4).max(80).transform((value) => value.toUpperCase()),
  client_command_id: z.string().trim().min(1).max(128),
  device_id: uuid.optional(),
  memo: z.string().trim().max(500).optional(),
  publish_rate: inlineRatePublicationSchema.optional(),
})

export const hawalaSendCommandSchema = hawalaCreateBaseSchema.omit({ reference_code: true }).extend({
  reference_code: z.string().trim().min(4).max(80).transform((value) => value.toUpperCase()).optional(),
  destination_money_account_id: uuid,
})

export const hawalaIncomingCommandSchema = hawalaCreateBaseSchema.extend({
  origin_location: z.string().trim().min(2).max(160),
})

export const hawalaPayoutCommandSchema = z.object({
  organization_id: uuid,
  reference_code: z.string().trim().min(4).max(80).transform((value) => value.toUpperCase()),
  money_account_id: uuid,
  identity_confirmed: z.literal(true),
  recipient_identity_reference: z.string().trim().min(2).max(120),
  client_command_id: z.string().trim().min(1).max(128),
  device_id: uuid.optional(),
  approval_id: uuid.optional(),
  approval_reason: z.string().trim().min(3).max(500).optional(),
  memo: z.string().trim().max(500).optional(),
})

export const hawalaSettlementCommandSchema = z.object({
  statement_line_id: uuid,
  hawala_partner_id: uuid,
  money_account_id: uuid,
  amount: decimalString.refine((value) => value !== '0', 'Amount must be greater than zero'),
  client_command_id: z.string().trim().min(1).max(128),
  device_id: uuid.optional(),
  memo: z.string().trim().max(500).optional(),
  publish_rate: inlineRatePublicationSchema.optional(),
})

export const debtCreateCommandSchema = z.object({
  organization_id: uuid,
  branch_id: uuid,
  counterparty_id: uuid,
  direction: z.enum(['receivable', 'payable']),
  currency: z.string().length(3).toUpperCase(),
  amount: decimalString.refine((value) => value !== '0', 'Amount must be greater than zero'),
  source_money_account_id: uuid.optional(),
  destination_money_account_id: uuid.optional(),
  due_at: z.string().datetime().optional(),
  memo: z.string().trim().max(500).optional(),
  device_id: uuid.optional(),
  client_command_id: z.string().trim().min(1).max(128),
  publish_rate: inlineRatePublicationSchema.optional(),
})

export const debtSettlementCommandSchema = z.object({
  debt_id: uuid,
  amount: decimalString.refine((value) => value !== '0', 'Amount must be greater than zero'),
  source_money_account_id: uuid.optional(),
  destination_money_account_id: uuid.optional(),
  memo: z.string().trim().max(500).optional(),
  device_id: uuid.optional(),
  client_command_id: z.string().trim().min(1).max(128),
  publish_rate: inlineRatePublicationSchema.optional(),
})

export type HawalaSendCommand = z.infer<typeof hawalaSendCommandSchema>
export type HawalaIncomingCommand = z.infer<typeof hawalaIncomingCommandSchema>
export type HawalaPayoutCommand = z.infer<typeof hawalaPayoutCommandSchema>
export type HawalaSettlementCommand = z.infer<typeof hawalaSettlementCommandSchema>

export const parseHawalaSendCommand = (input: unknown): HawalaSendCommand => hawalaSendCommandSchema.parse(input)
export const parseHawalaIncomingCommand = (input: unknown): HawalaIncomingCommand => hawalaIncomingCommandSchema.parse(input)
export const parseHawalaPayoutCommand = (input: unknown): HawalaPayoutCommand => hawalaPayoutCommandSchema.parse(input)
export const parseHawalaSettlementCommand = (input: unknown): HawalaSettlementCommand => hawalaSettlementCommandSchema.parse(input)
export const parseDebtCreateCommand = (input: unknown) => debtCreateCommandSchema.parse(input)
export const parseDebtSettlementCommand = (input: unknown) => debtSettlementCommandSchema.parse(input)
