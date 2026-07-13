# --- build stage: full deps + nest build → dist/ ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage: production deps + compiled output only ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Install prod deps, then drop the npm CLI itself: runtime only runs
# `node dist/main`, and npm's vendored undici is the sole source of the base
# image's HIGH CVE (CVE-2026-12151). Same layer so it never ships in an image.
RUN npm ci --omit=dev && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm
COPY --from=build /app/dist ./dist
EXPOSE 8000
# Migrations run automatically on boot (migrationsRun in app.module.ts)
CMD ["node", "dist/main"]
