FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# deps para chromium (si realmente lo necesitás)
RUN apt-get update -o Acquire::ForceIPv4=true -o Acquire::Retries=5 \
  && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 \
    libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 libxshmfence1 libglu1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# habilita corepack (viene con node 20) para usar pnpm
RUN corepack enable

# copiar manifests y lock de pnpm
COPY package.json pnpm-lock.yaml ./

# install determinístico usando el lock
RUN pnpm install --frozen-lockfile

# copiar el resto y build
COPY . .
RUN pnpm build

EXPOSE 3030
CMD ["pnpm","start:prod"]
