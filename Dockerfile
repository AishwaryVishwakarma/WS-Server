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
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8000
# Migrations run automatically on boot (migrationsRun in app.module.ts)
CMD ["node", "dist/main"]
