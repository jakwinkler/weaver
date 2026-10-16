FROM node:22-alpine AS build

RUN apk add --no-cache g++ make python3 \
    && corepack enable \
    && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build
RUN ./apps/api/node_modules/.bin/tsx deploy/compose/verify-plugin-runtime.cjs

FROM node:22-alpine AS api

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
RUN node -e "require('reflect-metadata'); require('@weaver/db'); require('@weaver/jira-import')"
RUN ./node_modules/.bin/tsx /app/deploy/compose/verify-plugin-runtime.cjs
CMD ["./node_modules/.bin/tsx", "dist/main.js"]

FROM node:22-alpine AS worker

RUN mkdir -p /tmp/weaver-uploads && chown node:node /tmp/weaver-uploads
WORKDIR /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/worker /app/apps/worker
COPY --from=build /app/packages /app/packages

USER node
RUN node -e "const r = require('node:module').createRequire('/app/apps/worker/package.json'); r('reflect-metadata'); r('@weaver/db'); r('@weaver/jira-import')"
CMD ["node", "apps/worker/dist/main.js"]

FROM nginxinc/nginx-unprivileged:alpine AS web

ENV WEAVER_API_UPSTREAM=api:3000
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
