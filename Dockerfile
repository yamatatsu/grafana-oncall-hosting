# ref: https://pnpm.io/docker

FROM node:22.4.1-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl

FROM base AS dev
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter ./packages/backend-server exec prisma generate

FROM dev AS iot-data-ingester-build
RUN pnpm run -r iot-data-ingester:build
RUN pnpm deploy --filter=backend-server --prod /prod/backend-server

FROM dev AS iot-data-ingester-dev
WORKDIR /usr/src/app/packages/backend-server
CMD [ "pnpm", "iot-data-ingester:dev" ]

FROM base AS iot-data-ingester
COPY --from=iot-data-ingester-build /prod/backend-server /prod/backend-server
WORKDIR /prod/backend-server
CMD [ "pnpm", "start" ]
