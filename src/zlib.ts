import * as zlib from "node:zlib";
import { promisify } from "node:util";
import * as fs from "node:fs";

const promisifiedGzip = promisify(zlib.gzip);

export const compressGzip = async (data: string): Promise<Uint8Array> => {
  return await promisifiedGzip(data, {
    level: zlib.constants.Z_BEST_COMPRESSION,
  });
};

const promisifiedBrotli = promisify(zlib.brotliCompress);

export const compressBrotli = async (data: string): Promise<Uint8Array> => {
  return await promisifiedBrotli(data);
};

export const writeTextWithGzipAndBrotli = async (
  filePath: string,
  contents: string,
): Promise<void> => {
  const [gzipBuffer, brotliBuffer] = await Promise.all([
    compressGzip(contents),
    compressBrotli(contents),
  ]);

  fs.writeFileSync(filePath, contents);

  fs.writeFileSync(filePath + ".gz", gzipBuffer);
  fs.writeFileSync(filePath + ".br", brotliBuffer);
};
