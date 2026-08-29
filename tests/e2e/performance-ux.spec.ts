import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test("core web journeys remain usable on a constrained connection", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium CDP provides the lab throttle",
  );
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const metrics = { cls: 0, lcpMilliseconds: null as number | null };
    Object.defineProperty(window, "__sarafiMetrics", { value: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      const latest = list.getEntries().at(-1);
      if (latest) metrics.lcpMilliseconds = latest.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 90 * 1024,
    connectionType: "cellular3g",
  });

  const timed = async (name: string, action: () => Promise<void>) => {
    const started = Date.now();
    await action();
    return { name, milliseconds: Date.now() - started };
  };

  const journeys = [];
  journeys.push(
    await timed("public landing and sign-in", async () => {
      await page.goto("/?public=1");
      await expect(
        page.getByRole("heading", {
          name: "Simple digital daftar for Sarafi shops",
        }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    }),
  );
  journeys.push(
    await timed("owner home", async () => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Good morning, Mohammad." }),
      ).toBeVisible();
    }),
  );
  journeys.push(
    await timed("Buy", async () => {
      await page
        .getByRole("button", { name: "Buy currency", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: /Buy currency/ }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close trade" }).click();
    }),
  );
  journeys.push(
    await timed("My money", async () => {
      await page.getByRole("button", { name: /My money/ }).click();
      await expect(
        page.getByRole("heading", { name: "Where is my money?" }),
      ).toBeVisible();
    }),
  );

  const metrics = await page.evaluate(() => {
    const stored = (
      window as unknown as {
        __sarafiMetrics: { cls: number; lcpMilliseconds: number | null };
      }
    ).__sarafiMetrics;
    return {
      cls: stored.cls,
      lcpMilliseconds: stored.lcpMilliseconds,
    };
  });
  const report = {
    profile: "150 ms latency, 1.6 Mbps down, 0.72 Mbps up",
    journeys,
    ...metrics,
  };
  await mkdir(path.resolve("test-results"), { recursive: true });
  await writeFile(
    path.resolve("test-results/performance-ux.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  for (const journey of journeys)
    expect(journey.milliseconds).toBeLessThan(15_000);
  expect(metrics.cls).toBeLessThan(0.1);
  if (metrics.lcpMilliseconds !== null)
    expect(metrics.lcpMilliseconds).toBeLessThan(5_000);
});
