FROM node:20-bookworm-slim

# Evita prompts
ENV DEBIAN_FRONTEND=noninteractive

# ==== FIX APT: https + ipv4 ====
RUN apt-get update -o Acquire::ForceIPv4=true -o Acquire::Retries=5 \
  && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 \
    libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 libxshmfence1 libglu1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm","run","start:prod"]
