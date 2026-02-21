FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies (production only)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY src ./src

ENV NODE_ENV=production

EXPOSE 3001

# Use node directly — no nodemon in production
CMD ["node", "src/index.js"]
