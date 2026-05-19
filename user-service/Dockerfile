FROM node:22.20.0-alpine

RUN apk add sqlite

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN apk add --no-cache sqlite

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3002

CMD ["npm", "run", "dev"]
