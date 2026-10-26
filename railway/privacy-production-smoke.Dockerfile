FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN ./node_modules/.bin/esbuild scripts/smoke-shopify-privacy-production.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/privacy-production-smoke.cjs
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/privacy-production-smoke.cjs ./dist/privacy-production-smoke.cjs
USER node
CMD ["node", "dist/privacy-production-smoke.cjs", "--send-one-production-test"]
