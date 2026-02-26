import fs from "fs";
import os from "os";
import path from "path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// Custom plugin to suppress PouchDB externalization warnings
const suppressPouchDBWarnings = () => {
  return {
    name: "suppress-pouchdb-warnings",
    configResolved(config) {
      const originalWarn = config.logger.warn;
      config.logger.warn = (msg, options) => {
        // Suppress "Module externalized for browser compatibility" warnings for PouchDB
        if (
          typeof msg === "string" &&
          msg.includes("externalized for browser compatibility") &&
          (msg.includes("pouchdb") || msg.includes("events"))
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
  plugins: [sveltekit(), suppressPouchDBWarnings(), coiServiceWorker(), serveModelFromCache()],
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.message && warning.message.includes("externalized for browser compatibility")) {
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
      ignored: ["**/.venv/**", "**/onnx/**"],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
