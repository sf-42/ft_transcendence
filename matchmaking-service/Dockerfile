FROM node:22.20.0-alpine

RUN apk add sqlite

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3003

CMD ["npm", "run", "dev"]
