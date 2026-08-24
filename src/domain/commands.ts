import { z } from 'zod'

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal amount')
const uuid = z.string().uuid()

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
}).superRefine((command, context) => {
  if (command.sold_currency === command.bought_currency) context.addIssue({ code: 'custom', path: ['bought_currency'], message: 'Trade currencies must differ' })
  if (command.sold_amount === '0' || command.bought_amount === '0') context.addIssue({ code: 'custom', path: ['sold_amount'], message: 'Trade amounts must be greater than zero' })
})

export type FxTradeCommand = z.infer<typeof fxTradeCommandSchema>

export function parseFxTradeCommand(input: unknown): FxTradeCommand {
  return fxTradeCommandSchema.parse(input)
}
