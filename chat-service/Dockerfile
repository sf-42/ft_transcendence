FROM node:22.20.0-alpine

RUN apk add --no-cache sqlite python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3004

CMD ["npm", "run", "dev"]
