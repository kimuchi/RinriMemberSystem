FROM node:20-slim AS builder

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Install client dependencies and build
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Production image
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/index.js"]
