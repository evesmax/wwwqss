# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.js"]
