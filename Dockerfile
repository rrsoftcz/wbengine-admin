FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/src/lib/server ./src/lib/server
COPY --from=build --chown=node:node /app/src/lib/content-schema.ts ./src/lib/content-schema.ts
COPY --from=build --chown=node:node /app/src/lib/content-format.ts ./src/lib/content-format.ts
USER node
CMD ["node","build"]
