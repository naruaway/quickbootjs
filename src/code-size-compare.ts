import { compressBrotli, compressGzip } from "./zlib.js";
import chalk from "chalk";

const compressionVariants = ["original", "gzip", "brotli"] as const;
type CompressionVariant = (typeof compressionVariants)[number];

const getSizes = async (
  text: string,
): Promise<Record<CompressionVariant, number>> => {
  const [gzipBuffer, brotliBuffer] = await Promise.all([
    compressGzip(text),
    compressBrotli(text),
  ]);
  return {
    original: new TextEncoder().encode(text).byteLength,
    gzip: gzipBuffer.byteLength,
    brotli: brotliBuffer.byteLength,
  };
};

const formatNumber = (n: number): string => {
  return new Intl.NumberFormat("en-US").format(n);
};

const formatPercentage = (ratio: number): string => {
  return (ratio * 100).toFixed(2) + "%";
};

const formatRelativeSize = (before: number, after: number): string[] => {
  if (after < before) {
    return [
      formatPercentage((before - after) / before),
      " ",
      chalk.green("smaller"),
    ];
  } else {
    return [
      formatPercentage((after - before) / before),
      " ",
      chalk.red("bigger"),
    ];
  }
};

const compareSizes = (
  before: Record<CompressionVariant, number>,
  after: Record<CompressionVariant, number>,
): void => {
  const lines: Array<Array<string>> = [];
  for (const variant of compressionVariants) {
    lines.push([
      variant,
      ": ",
      formatNumber(before[variant]),
      " -> ",
      formatNumber(after[variant]) + " bytes",
      " (",
      ...formatRelativeSize(before[variant], after[variant]),
      ")",
    ]);
  }
  const colLengths = new Map<number, number>();
  lines.forEach((line) =>
    line.forEach((l, i) => {
      colLengths.set(i, Math.max(colLengths.get(i) ?? 0, l.length));
    }),
  );
  for (const line of lines) {
    console.log(
      line
        .map((item, i) => item.padStart(colLengths.get(i) ?? 0, " "))
        .join(""),
    );
  }
};

export const compareCodeSizes = async (
  beforeCode: string,
  afterCode: string,
) => {
  const [beforeSizes, afterSizes] = await Promise.all([
    getSizes(beforeCode),
    getSizes(afterCode),
  ]);
  compareSizes(beforeSizes, afterSizes);
};
