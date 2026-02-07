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

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: true, // Enable source maps for better debugging
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress warnings during build
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
  plugins: [suppressPouchDBWarnings()],
});
