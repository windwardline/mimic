import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Next.js serves metadata images (opengraph-image.*, icon.*, ...) and everything
// in public/ with a content type taken from the file extension, and vercel.json
// sends X-Content-Type-Options: nosniff on every route. A file whose bytes are
// not what its extension says is therefore served with the wrong type and a
// browser or crawler may refuse it: opengraph-image.png was JPEG data until
// 2026-09-28. The population is derived from the tree, not listed here.

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  webp: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  ico: (b) => b.readUInt32BE(0) === 0x00000100,
  svg: (b) => /<svg[\s>]/.test(b.subarray(0, 4096).toString("utf8")),
};

const METADATA_IMAGE = /^(opengraph-image|twitter-image|icon|apple-icon)\d*\.[a-z]+$|^favicon\.ico$/;
const IMAGE = /\.(png|jpe?g|gif|webp|ico|svg|avif|bmp|tiff?)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const root = process.cwd();
const served = [
  ...walk(join(root, "src", "app")).filter((p) => METADATA_IMAGE.test(p.split("/").pop() ?? "")),
  ...walk(join(root, "public")).filter((p) => IMAGE.test(p)),
].map((p) => relative(root, p));

describe("served image bytes match their extension", () => {
  it("examines at least one Open Graph image and the rest of the served images", () => {
    expect(served.some((p) => /opengraph-image\./.test(p))).toBe(true);
    expect(served.length).toBeGreaterThan(1);
  });

  it.each(served)("%s", (path) => {
    const ext = path.split(".").pop()!.toLowerCase();
    const matches = SIGNATURES[ext];
    expect(matches, `no signature check for .${ext}; add one before serving this type`).toBeDefined();
    expect(matches(readFileSync(join(root, path))), `${path} is not ${ext} data`).toBe(true);
  });
});
