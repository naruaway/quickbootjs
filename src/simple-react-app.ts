import { chromium } from "playwright";
import * as fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { traceRuntime, type TraceData } from "./trace.js";

export const runBrowser = async (options: { mode: string }) => {
  const browser = await chromium.launch({ headless: true });

  const ctx = await browser.newContext({ hasTouch: true });

  const page = await ctx.newPage();

  page.on("console", (msg) => console.log(msg.text()));
  const url = new URL("http://localhost:8942");
  url.searchParams.append("quickbootjsmode", options.mode);
  console.log(`visiting ${url.toString()}`);
  await page.goto(url.toString());
  // This reload() is somehow needed when taking a coverage...
  //await page.reload()
  // await page.waitForSelector(".client-only-div");
  //
  // // Some interactions
  //
  await page.hover("#app");
  await page.tap("#app");
  await page.click("#app");
  const pos = await page.evaluate(() => {
    const rect = document.getElementById("app")!.getBoundingClientRect();
    return {
      x: rect.x + 10,
      y: rect.y + 10,
    };
  });

  await page.mouse.move(pos.x, pos.y);
  await page.mouse.move(pos.x + 10, pos.y + 10);
  //await sleep(10000)
  //
  // if (MANUAL_INTERACT) {
  //   await sleep(10000)
  // }

  return {
    page,
    async close() {
      await browser.close();
    },
  };
};

export const runInBrowserToGetTrace = async (): Promise<TraceData> => {
  const result = await runBrowser({ mode: "main.quickbootjs-trace.js" });
  const traceData = await result.page.evaluate(
    (traceDataIdentifier) =>
      // @ts-expect-error: we know this actually exists and if not, some error should happen later anyway
      globalThis[traceDataIdentifier],
    traceRuntime.traceDataIdentifier,
  );

  await result.close();
  return traceData;
};
