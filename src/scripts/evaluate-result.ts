import { chromium, devices, type Browser } from "playwright";

const networkConditions = {
  "Slow 3G": {
    downloadThroughput: ((500 * 1000) / 8) * 0.8,
    uploadThroughput: ((500 * 1000) / 8) * 0.8,
    latency: 400 * 5,
    offline: false,
  },
  "Fast 3G": {
    downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
    uploadThroughput: ((750 * 1000) / 8) * 0.9,
    latency: 150 * 3.75,
    offline: false,
  },
};

const networkCondition = networkConditions["Slow 3G"];

const autoclosing = <T extends { close: () => Promise<void> }>(
  target: T,
): T & { [Symbol.asyncDispose]: () => Promise<void> } =>
  Object.assign(target, {
    async [Symbol.asyncDispose]() {
      await target.close();
    },
  });

await using browser = autoclosing(await chromium.launch());

const targets = [
  { name: "original", url: "" },
  {
    name: "quickbootjs",
    url: "",
  },
];

async function measureMetrics(
  browser: Browser,
  url: string,
): Promise<{ firstPaint: number }> {
  const context = autoclosing(await browser.newContext(devices["iPhone SE"]));
  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);

  await cdp.send("Network.emulateNetworkConditions", networkCondition);

  await page.goto(url, { waitUntil: "commit" });
  const firstPaint = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "first-paint") {
              observer.disconnect();
              resolve(entry.startTime);
              break;
            }
          }
        });
        observer.observe({ type: "paint", buffered: true });
      }),
  );
  return { firstPaint };
}

for (let i = 0; i < 10; ++i) {
  for (const target of targets) {
    const metrics = await measureMetrics(browser, target.url);
    console.log({ target, metrics });
  }
}
