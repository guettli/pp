import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: "index.html",
      pages: "dist",
      assets: "dist",
    }),
    paths: {
      base: "/phoneme-party",
    },
  },
};

export default config;
