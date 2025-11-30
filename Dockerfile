
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (dev + prod)
RUN npm install --legacy-peer-deps

# Copier le code source
COPY . .

# Build de l'application NestJS
RUN npm run build

FROM node:18-alpine

WORKDIR /app

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S shadowguard -u 1001

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer UNIQUEMENT les dépendances de production
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copier le code compilé depuis le builder
COPY --from=builder --chown=shadowguard:nodejs /app/dist ./dist

# Changer la propriété des fichiers
RUN chown -R shadowguard:nodejs /app

# Utiliser l'utilisateur non-root
USER shadowguard

# Exposer le port de l'API
EXPOSE 3000

# Variable d'environnement pour la production
ENV NODE_ENV=production


# Lancer l'application
CMD ["node", "dist/main.js"]