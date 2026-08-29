import { describe, expect, it } from "vitest";
import { deriveTradeAmounts } from "./tradePricing";

describe("trade rate selection", () => {
  it("uses the displayed buy rate for buy calculations", () => {
    expect(deriveTradeAmounts("BUY_FX", "1000", "70.25", "70.7")).toMatchObject(
      {
        rate: "70.250000000000",
        soldAmount: "70250.000000000000",
        boughtAmount: "1000.000000000000",
        soldBaseValue: "70250.000000000000",
        boughtBaseValue: "70250.000000000000",
      },
    );
  });
  it("uses the displayed sell rate for sell calculations", () => {
    expect(
      deriveTradeAmounts("SELL_FX", "1000", "70.25", "70.7"),
    ).toMatchObject({
      rate: "70.700000000000",
      soldAmount: "1000.000000000000",
      boughtAmount: "70700.000000000000",
      soldBaseValue: "70700.000000000000",
      boughtBaseValue: "70700.000000000000",
    });
  });
});
