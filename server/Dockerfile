# Server Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy config files
COPY package*.json ./
COPY tsconfig.json ./
# COPY vite.config.ts ./

RUN npm install

COPY src/ ./src/

# check if good
EXPOSE 3005

# CMD ["npm", "run", "dev"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]