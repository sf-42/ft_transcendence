# Frontend Dockerfile
FROM node:22.20.0-alpine

WORKDIR /app

# Copy config files
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./

RUN npm install

COPY src/ ./src/
COPY assets/ ./assets/
COPY index.html ./


EXPOSE 5173


CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]