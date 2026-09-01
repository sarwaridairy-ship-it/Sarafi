import { describe, expect, it } from "vitest";
import { businessDateInTimeZone } from "./businessTime";

describe("businessDateInTimeZone", () => {
  it("uses the Kabul business day instead of the UTC day", () => {
    const nearMidnightInKabul = new Date("2026-09-01T20:10:00.000Z");
    expect(businessDateInTimeZone(nearMidnightInKabul, "Asia/Kabul")).toBe(
      "2026-09-02",
    );
    expect(businessDateInTimeZone(nearMidnightInKabul, "UTC")).toBe(
      "2026-09-01",
    );
  });
});
