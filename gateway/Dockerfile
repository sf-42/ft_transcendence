FROM node:20.0.0-alpine

WORKDIR /app

# Install runtime deps
COPY package*.json ./
RUN npm install --production=false

# Copy source
COPY tsconfig.json ./
COPY server.ts ./

EXPOSE 3000


CMD ["npm", "run", "dev"]
