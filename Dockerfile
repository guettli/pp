# Runtime image for the Phoneme Party SvelteKit server (adapter-node).
#
# The build happens outside this file, in .github/workflows/publish-image.yml:
# it needs zig (WASM), uv (PanPhon data), pnpm and the generated phrase audio,
# none of which belong in the runtime image. This file only packages the
# finished build-server/ directory, which is self-contained (vite bundles all
# dependencies with ssr.noExternal, so there is no node_modules here).
#
# Build context: the repository root after `BUILD_SERVER=1 pnpm build`.
FROM node:22-slim

COPY build-server /app/build-server

# /api/feedback writes to $PWD/feedback. The Deployment mounts a volume at
# /data, so user feedback survives a pod restart.
WORKDIR /data
RUN chown node:node /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

USER node
EXPOSE 3000
CMD ["node", "/app/build-server/index.js"]
