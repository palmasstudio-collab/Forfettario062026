FROM node:20-bookworm-slim

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make build-essential && rm -rf /var/lib/apt/lists/*

# Copia i file necessari per le dipendenze
COPY package.json package-lock.json* ./

# Installa le dipendenze
RUN npm install

# Copia il resto dell'applicazione
COPY . .

# Build
RUN npm run build

# Expose port (Cloud Run sets this dynamically via PORT env var)
EXPOSE 8080

ENV NODE_ENV=production

CMD ["npm", "start"]
