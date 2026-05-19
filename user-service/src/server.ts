import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import userRoutes from './user-routes';

import { dbPromise, initDatabase } from './db';
import { uptime } from 'process';

config();

if (!process.env.DB_USER_SERVICE_PATH) {
  console.error("[FATAL]: Missing DB_USER_SERVICE_PATH environment variable");
  process.exit(1);
}

const PORT = Number(process.env.USER_PORT) || 3002;
const HOST = process.env.USER_SERVICE_HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Init FastifyInstance
const app: FastifyInstance = Fastify({
  // logger: {
  //   transport: NODE_ENV === 'development' ? {
  //     target: 'pino-pretty',
  //     options: { translateTime: "HH:MM:ss Z", colorize: true },
  //   }
  //     : undefined,
  // },
  bodyLimit: 10485760,
})

app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = JSON.parse(body as string);
    done(null, json);
  } catch (err:  any) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// Register security plugins
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],  // API only - no resources needed
      frameAncestors: ["'none'"],  // Prevent clickjacking
    },
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
});

app.register(cors, {
  origin:
    NODE_ENV === "development"
      ? true // allow all in dev
      : [/\.yourdomain\.com$/],
  credentials: true,
});

app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  }
});

const UPLOADS_DIR = process.env.PICTURE_PATH;
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Health check endpoint 
app.get('/health', async () => {
  return { status: "ok", service: "user-service", uptime: uptime() };
});

// Register user routes
// app.register(userRoutes);

// Error handling
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    success: false,
    error: NODE_ENV === "development" ? error.message : "Internal Server Error",
  });
});

// Start server
async function start() {
  try {
    const db = await dbPromise;
    app.decorate('db', db);
    app.register(userRoutes);
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`user-service started`);
    await app.ready();
    app.log.info(app.printRoutes());
  }
  catch (err) {
    console.error("[FATAL]: Could not start server:", err);
    app.log.error("[FATAL]: Could not start server:", err);
    process.exit(1);
  }
}

start();