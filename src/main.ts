import { generateOptimizedCode } from "./optimize.js";
import * as fs from "node:fs";
import { runInBrowserToGetTrace } from "./simple-react-app.js";
import { generateTraceCode } from "./facade.js";
import { compareCodeSizes } from "./code-size-compare.js";
import { withAdditionalSuffixForJsFilePath } from "./util.js";

const runQuickbootjs = async ({ targetJsPath }: { targetJsPath: string }) => {
  const write = (suffix: string, contents: string): void => {
    fs.writeFileSync(
      withAdditionalSuffixForJsFilePath(targetJsPath, suffix),
      contents,
    );
  };

  const originalCode = fs.readFileSync(targetJsPath, "utf-8");

  write("quickbootjs-trace.js", generateTraceCode(originalCode));

  const traceData = await runInBrowserToGetTrace();

  //await write("quickbootjs-tracedata-0.json", JSON.stringify(traceData, null, 2));

  const optimized = await generateOptimizedCode(originalCode, traceData);

  write("quickbootjs-main.js", optimized.code);

  const extractedCode = `"use strict";const data = ${JSON.stringify(
    optimized.extracted,
  )};return {getCode(i) {return data.extractedCodes[i]}}`;

  write("quickbootjs-extracted.js", extractedCode);

  return {
    original: { code: originalCode },
    optimized: {
      main: { code: optimized.code },
      extracted: { code: extractedCode },
    },
  };
};

const result = await runQuickbootjs({
  targetJsPath: "./fixtures/apps/react-lazy-load-after-animation/dist/main.js",
});

await compareCodeSizes(result.original.code, result.optimized.main.code);

console.log(
  `Visit http://localhost:8942/?quickbootjsmode=main.quickbootjs-main.js to check the quickbootjs behavior`,
);
