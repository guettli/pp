/**
 * Playwright route handlers that intercept all external CDN requests and serve
 * them locally. Applied to every browser context so tests never hit the internet.
 *
 * - ORT WASM files     → node_modules/onnxruntime-web/dist/  (already on disk)
 * - fastenhancer.onnx  → ~/.cache/phoneme-party/cdn/          (downloaded by cache-cdn-assets task)
 * - Bootstrap Icons    → empty 200  (cosmetic, not tested)
 * - Google Fonts       → empty 200  (cosmetic, not tested)
 * - Twemoji SVGs       → minimal SVG  (not tested)
 */

import fs from "fs";
import os from "os";
import path from "path";

const ORT_DIST = path.resolve("node_modules/onnxruntime-web/dist");
const CDN_CACHE = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "phoneme-party",
  "cdn",
);

function contentType(filename) {
  if (filename.endsWith(".wasm")) return "application/wasm";
  if (filename.endsWith(".mjs") || filename.endsWith(".js")) return "application/javascript";
  if (filename.endsWith(".css")) return "text/css";
  if (filename.endsWith(".woff2")) return "font/woff2";
  if (filename.endsWith(".woff")) return "font/woff";
  if (filename.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * Register CDN route handlers on a Playwright BrowserContext.
 * Call once after context creation, before any page.goto().
 */
export async function setupCdnRoutes(context) {
  // ORT WASM + JS files from jsdelivr → node_modules
  await context.route("https://cdn.jsdelivr.net/npm/onnxruntime-web@**", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop();
    const localPath = path.join(ORT_DIST, filename);
    if (fs.existsSync(localPath)) {
      await route.fulfill({ body: fs.readFileSync(localPath), contentType: contentType(filename) });
    } else {
      await route.fulfill({ status: 404, body: `not found: ${filename}` });
    }
  });

  // FastEnhancer noise-suppressor ONNX model → local cache
  await context.route("https://github.com/aask1357/**", async (route) => {
    const cachePath = path.join(CDN_CACHE, "fastenhancer_b.onnx");
    if (fs.existsSync(cachePath)) {
      await route.fulfill({
        body: fs.readFileSync(cachePath),
        contentType: "application/octet-stream",
      });
    } else {
      await route.fulfill({
        status: 503,
        body: `fastenhancer_b.onnx not cached — run: ./run task cache-cdn-assets`,
      });
    }
  });

  // Bootstrap Icons CSS + fonts → empty (cosmetic)
  await context.route("https://cdn.jsdelivr.net/npm/bootstrap-icons@**", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({ status: 200, body: "", contentType: contentType(filename) });
  });

  // Google Fonts CSS + font files → empty (cosmetic)
  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, body: "", contentType: "text/css" }),
  );
  await context.route("https://fonts.gstatic.com/**", (route) =>
    route.fulfill({ status: 200, body: Buffer.alloc(0), contentType: "font/woff2" }),
  );

  // Twemoji SVGs → minimal valid SVG (not tested)
  await context.route("https://cdn.jsdelivr.net/gh/twitter/twemoji@**", (route) =>
    route.fulfill({
      status: 200,
      body: "<svg xmlns='http://www.w3.org/2000/svg'/>",
      contentType: "image/svg+xml",
    }),
  );
}
