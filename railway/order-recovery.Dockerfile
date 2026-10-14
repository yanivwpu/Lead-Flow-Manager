FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --strict-ssl=true
# Deliberate allowlist: no .env, .git, customer exports, web app or other startup scripts.
COPY tsconfig.json ./
COPY shared ./shared
COPY server/commerceEventPipeline.ts server/shopifyContactService.ts server/shopifyCommerceWebhooks.ts server/shopifyOrderWebhookHandler.ts ./server/
COPY scripts/verify-shopify-order-recovery.ts ./scripts/
USER node
CMD ["node", "--import", "tsx", "scripts/verify-shopify-order-recovery.ts"]
