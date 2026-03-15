import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: process.env.BUILD_SERVER
      ? adapterNode({ out: "build-server", precompress: false })
      : adapterStatic({
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
