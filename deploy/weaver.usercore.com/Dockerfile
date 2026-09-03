FROM node:20-alpine AS build

RUN apk add --no-cache g++ make python3 \
    && corepack enable \
    && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

FROM node:20-alpine AS api

RUN corepack enable \
    && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app/apps/api
RUN mkdir -p /tmp/weaver-uploads && chown node:node /tmp/weaver-uploads
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api /app/apps/api
COPY --from=build /app/packages /app/packages
COPY --from=build /app/plugins /app/plugins
COPY --from=build /app/deploy /app/deploy

EXPOSE 3000
USER node
CMD ["./node_modules/.bin/tsx", "dist/main.js"]

FROM node:20-alpine AS worker

WORKDIR /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/worker /app/apps/worker
COPY --from=build /app/packages /app/packages

USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM nginxinc/nginx-unprivileged:alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
