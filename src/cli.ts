#!/usr/bin/env node

import { generateTraceCode } from "./facade.js";
import { generateOptimizedCode } from "./optimize.js";
import { withAdditionalSuffixForJsFilePath } from "./util.js";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { compareCodeSizes } from "./code-size-compare.js";

// TODO: explore better package for CLI (or build my own...)
import _cac from "cac";
const cac = _cac as unknown as typeof _cac.default;

const generateTrace = async ({ targetJsPath }: { targetJsPath: string }) => {
  const write = (suffix: string, contents: string): void => {
    fs.writeFileSync(
      withAdditionalSuffixForJsFilePath(targetJsPath, suffix),
      contents,
    );
  };

  const originalBackupPath = withAdditionalSuffixForJsFilePath(
    targetJsPath,
    "quickbootjs-original.js",
  );

  const originalCode = fs.existsSync(originalBackupPath)
    ? fs.readFileSync(originalBackupPath, "utf-8")
    : fs.readFileSync(targetJsPath, "utf-8");

  console.log(`backing up the original code to ${originalBackupPath}`);
  write("quickbootjs-original.js", originalCode);

  console.log(`writing trace code to ${targetJsPath}`);
  fs.writeFileSync(targetJsPath, generateTraceCode(originalCode));

  const traceDataPath = path.basename(
    withAdditionalSuffixForJsFilePath(
      targetJsPath,
      "quickbootjs-tracedata.json",
    ),
  );
  console.log(
    "Please do the following: \n" +
      [
        "open your app in browser and emulate initial expected actions of actual users such as 'just wait for an animation to be finished' or 'scoll to some target component and click it'",
        `obtain traceData by executing copy(__QUICKBOOTJS_TRACE__) in dev tool console and save it as ${traceDataPath} under the same directory as the original JS file`,
        `then you can run "quickbootjs optimize '${targetJsPath}'"`,
      ]
        .map((t) => `  - ${t}`)
        .join("\n"),
  );
};

const optimize = async ({ targetJsPath }: { targetJsPath: string }) => {
  const write = (suffix: string, contents: string): void => {
    fs.writeFileSync(
      withAdditionalSuffixForJsFilePath(targetJsPath, suffix),
      contents,
    );
  };

  const originalBackupPath = withAdditionalSuffixForJsFilePath(
    targetJsPath,
    "quickbootjs-original.js",
  );
  const originalCode = fs.readFileSync(originalBackupPath, "utf-8");

  // TODO validation here
  const traceData = JSON.parse(
    fs.readFileSync(
      withAdditionalSuffixForJsFilePath(
        targetJsPath,
        "quickbootjs-tracedata.json",
      ),
      "utf-8",
    ),
  );

  const optimized = await generateOptimizedCode(originalCode, traceData);

  console.log(`writing optimized JS to ${targetJsPath}`);
  fs.writeFileSync(targetJsPath, optimized.code);

  const extractedCode = `"use strict";const data = ${JSON.stringify(
    optimized.extracted,
  )};return {getCode(i) {return data.extractedCodes[i]}}`;

  console.log(`writing extracted code`);
  write("quickbootjs-extracted.js", extractedCode);

  await compareCodeSizes(originalCode, optimized.code);
  console.log(
    `Now you can check your app in browser to confirm it loads the reduced JS file first`,
  );
};

const cli = cac("quickbootjs");

cli
  .command(
    "trace <targetJsPath>",
    "Generate tracer and replace <targetJsPath> with it",
  )
  .action(async (targetJsPath) => {
    await generateTrace({ targetJsPath });
  });

cli
  .command(
    "optimize <targetJsPath>",
    "Generate optimized JS and replace <targetJsPath> with it",
  )
  .action(async (targetJsPath) => {
    await optimize({ targetJsPath });
  });

cli.help((sections) => {
  sections.splice(1, 0, {
    title: "Summary",
    body: "  quickbootjs CLI allows you to reduce JS code size using Quickboot.js. See https://quickbootjs.nry.app for more details. This is still an experimental tool.",
  });
});

cli.on("command:*", () => {
  console.error(chalk.red("Invalid command: %s", cli.args.join(" ")));
  cli.outputHelp();
  process.exit(1);
});

const args = cli.parse();

if (args.args.length === 0) {
  cli.outputHelp();
  process.exit(1);
}
