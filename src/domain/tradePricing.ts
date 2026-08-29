import Decimal from "decimal.js";

export function deriveTradeAmounts(
  side: "BUY_FX" | "SELL_FX" | "EXCHANGE_FX",
  foreignAmount: string,
  buyRate: string,
  sellRate: string,
) {
  const amount = new Decimal(foreignAmount);
  const rate = new Decimal(side === "BUY_FX" ? buyRate : sellRate);
  if (!amount.isFinite() || amount.lte(0) || !rate.isFinite() || rate.lte(0))
    throw new Error("Amount and rate must be positive");

  // The cashier always enters the foreign-currency amount. For a buy the shop
  // receives that amount and gives AFN; for a sell the shop gives that amount
  // and receives AFN. This keeps the UI, command, and receipt perspectives
  // aligned.
  const soldAmount = side === "BUY_FX" ? amount.mul(rate) : amount;
  const boughtAmount = side === "BUY_FX" ? amount : amount.mul(rate);
  const baseValue = side === "BUY_FX" ? soldAmount : boughtAmount;
  return {
    rate: rate.toFixed(12),
    soldAmount: soldAmount.toFixed(12),
    boughtAmount: boughtAmount.toFixed(12),
    soldBaseValue: baseValue.toFixed(12),
    boughtBaseValue: baseValue.toFixed(12),
  };
}
