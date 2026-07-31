# Oh My SSH static web UI. SSH transport is provided by the separately
# deployed Cloudflare raw relay; this image never accepts SSH credentials.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --chown=node:node server/prod.mjs ./server/prod.mjs
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "server/prod.mjs"]
