
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

FROM node:18-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S shadowguard -u 1001

COPY package*.json ./

RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

COPY --from=builder --chown=shadowguard:nodejs /app/dist ./dist

RUN chown -R shadowguard:nodejs /app

USER shadowguard

EXPOSE 3000

ENV NODE_ENV=production


# Lancer l'application
CMD ["node", "dist/main.js"]