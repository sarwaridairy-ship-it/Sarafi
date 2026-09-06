import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
) as { rewrites?: Array<{ source?: string; destination?: string }> };

describe("premium workflow static gates", () => {
  it("removes the retired dashboard and overflow-menu architecture", () => {
    for (const forbidden of [
      "showMoreNavigation",
      "mobile-more-menu",
      'activeNav === "Trade"',
      "showTrade",
    ]) {
      expect(appSource).not.toContain(forbidden);
    }
  });

  it("does not expose client-entered accounting valuation fields", () => {
    for (const forbidden of [
      "openingBaseValue",
      "operationBaseAmount",
      "settlementBaseAmount",
      "feeBaseAmount",
      "Value in AFN",
    ]) {
      expect(appSource).not.toContain(forbidden);
    }
  });

  it("contains every required refresh-safe route", () => {
    for (const route of [
      "/home",
      "/transactions/new",
      "/transactions/new/fx",
      "/transactions/new/money-in",
      "/transactions/new/money-out",
      "/transactions/new/move-money",
      "/transactions/new/debt",
      "/transactions/new/hawala",
      "/transactions/new/correction",
      "/transactions",
      "/money",
      "/customers",
      "/activity",
      "/cashbox-close",
      "/reports",
      "/reconciliation",
      "/control",
      "/control/rates",
      "/control/team",
      "/control/business",
      "/control/security",
      "/control/billing",
      "/compliance",
      "/compliance/cases",
    ]) {
      expect(appSource, route).toContain(route);
    }
  });

  it("serves nested application routes through the SPA entry point", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/app/:path*",
      destination: "/index.html",
    });
  });
});
