# Dockerfile - AutoBot WSZia Production 24/7
FROM node:22-alpine

WORKDIR /app

# Pasang dependencies
COPY package*.json ./
RUN npm ci --only=production

# Salin kod sumber
COPY . .

# Pastikan folder data wujud untuk storan kekal
RUN mkdir -p /app/data

# Port aplikasi
EXPOSE 3000

# Volum kekal untuk pangkalan data dan sesi WhatsApp
VOLUME ["/app/data"]

# Pembolehubah persekitaran lalai
ENV NODE_ENV=production
ENV PORT=3000

# Arahan mula pelayan pengeluaran
CMD ["node", "src/server.js"]
