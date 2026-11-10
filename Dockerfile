FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4173
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node data ./data
COPY --chown=node:node ml/artifacts ./ml/artifacts
COPY --chown=node:node contracts ./contracts
COPY --chown=node:node src/preferences.js ./src/preferences.js
COPY --chown=node:node tests/fixtures/purchase-import ./tests/fixtures/purchase-import
RUN mkdir -p .local-data && chown -R node:node .local-data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/start.mjs"]

