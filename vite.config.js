import fs from "fs";
import os from "os";
import path from "path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// Suppress "Module externalized for browser compatibility" warnings for modules
// that use Node.js APIs only in guarded runtime branches (typeof process check).
const suppressExternalizationWarnings = () => {
  return {
    name: "suppress-externalization-warnings",
    configResolved(config) {
      const originalWarn = config.logger.warn;
      config.logger.warn = (msg, options) => {
        if (
          typeof msg === "string" &&
          (msg.includes("externalized for browser compatibility") ||
            msg.includes("Unknown output options: codeSplitting"))
        ) {
          return;
        }
        originalWarn(msg, options);
      };
    },
  };
};

// Serve coi-serviceworker.js with correct base path in dev; emit to dist root in build
const coiServiceWorker = () => {
  const swPath = path.resolve("node_modules/coi-serviceworker/coi-serviceworker.js");
  let base = "/";
  return {
    name: "coi-serviceworker",
    configResolved(config) {
      base = config.base || "/";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const swUrl = `${base}coi-serviceworker.js`.replace("//", "/");
        if (req.url !== swUrl) return next();
        res.setHeader("Content-Type", "application/javascript");
        fs.createReadStream(swPath).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "coi-serviceworker.js",
        source: fs.readFileSync(swPath, "utf-8"),
      });
    },
  };
};

// Serve ONNX model files from XDG cache so no local onnx/ directory is needed
const serveModelFromCache = () => {
  const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  const MODEL_CACHE_DIR = path.join(XDG_CACHE_HOME, "phoneme-party", "models");

  return {
    name: "serve-model-from-cache",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/onnx\/([^/]+)\/(model(?:\.\w+)?\.onnx|vocab\.json)$/);
        if (!match) return next();

        const [, modelName, filename] = match;
        const cacheFile =
          filename === "vocab.json"
            ? `${modelName}.vocab.json`
            : `${modelName}.${filename.replace("model.", "")}`;
        const cachePath = path.join(MODEL_CACHE_DIR, cacheFile);

        if (!fs.existsSync(cachePath)) return next();

        res.setHeader(
          "Content-Type",
          filename === "vocab.json" ? "application/json" : "application/octet-stream",
        );
        fs.createReadStream(cachePath).pipe(res);
      });
    },
  };
};

export default defineConfig({
  // Bundle all deps into the SSR output when building the Node.js server,
  // so the deployed build-server/ is self-contained (no node_modules needed).
  ssr: process.env.BUILD_SERVER ? { noExternal: true } : {},
  plugins: [
    sveltekit(),
    suppressExternalizationWarnings(),
    coiServiceWorker(),
    serveModelFromCache(),
  ],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: "esnext",
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.message &&
          (warning.message.includes("externalized for browser compatibility") ||
            warning.message.includes("Unknown output options: codeSplitting"))
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  worker: {
    format: "es",
  },
  server: {
    fs: {
      strict: false,
    },
    watch: {
      ignored: ["**/.venv/**", "**/onnx/**", "**/static/audio/**", "**/build-server/**"],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
