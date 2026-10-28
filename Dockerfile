FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
COPY patches ./patches
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# storage/ holds runtime data (session, settings, menu media) — see .gitignore
RUN mkdir -p storage/session storage/menu

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "index.js"]
