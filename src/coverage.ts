import * as babel from "@babel/core";
import * as fs from "node:fs";
import { $ } from "zx";
import { runBrowser } from "./simple-react-app.js";

const filePath = "./fixtures/simple-react-app/dist/main.quickboot.js";

const code = fs.readFileSync(filePath, "utf-8");
const result = babel.transformSync(code, {
  filename: filePath,
  plugins: ["babel-plugin-istanbul"],
});

fs.writeFileSync(
  "./fixtures/simple-react-app/dist/main.quickboot-coverage.js",
  result?.code!,
);

const browser = await runBrowser({ mode: "main.quickboot-coverage.js" });

const coverageData = await browser.page.evaluate(
  () => (globalThis as unknown as { __coverage__: unknown }).__coverage__,
);
await browser.close();

await $`mkdir -p .nyc_output`;
fs.writeFileSync(".nyc_output/out.json", JSON.stringify(coverageData));
await $`./node_modules/.bin/nyc report --reporter=html && cd ./coverage && serve`;
