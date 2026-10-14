FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts --strict-ssl=true
# Deliberate allowlist: no .env, .git, customer exports, web app or other startup scripts.
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node server/commerceEventPipeline.ts server/shopifyContactService.ts server/shopifyCommerceWebhooks.ts server/shopifyOrderWebhookHandler.ts ./server/
COPY --chown=node:node scripts/verify-shopify-order-recovery.ts ./scripts/
USER node
CMD ["node", "--import", "tsx", "scripts/verify-shopify-order-recovery.ts"]
