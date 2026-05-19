import Fastify, { FastifyInstance , FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import proxy from '@fastify/http-proxy';
import { config } from 'dotenv';
import matchmakingRoutes from './matchmaking-routes';
import { dbPromise, initDatabase } from './db';
import { uptime } from 'process';

config();

if (!process.env.SQLITE_MATCHMAKING_DB_PATH) {
  console.error("[FATAL]: Missing SQLITE_MATCHMAKING_DB_PATH environment variable");
  process.exit(1);
}

const PORT = Number(process.env.MATCHMAKING_PORT) || 3003;
const HOST = process.env.MATCHMAKING_SERVICE_HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

// Init FastifyInstance
const app: FastifyInstance = Fastify({
  // logger: {
  //   transport: NODE_ENV === 'development' ? {
  //     target: 'pino-pretty',
  //     options: { translateTime: "HH:MM:ss Z", colorize: true },
  // }
  // : undefined,
  // },
})

// Register security plugins
app.register(helmet, {
  contentSecurityPolicy: NODE_ENV === "production",
});

app.register(cors, {
  origin:
    NODE_ENV === "development"
      ? true // allow all in dev
      : [/\.yourdomain\.com$/],
  credentials: true,
});

// Health check endpoint 
app.get('/health', async() => {
  return {status: "ok", service: "matchmaking-service", uptime: uptime()};
});

// Detailed request logging for debugging (method, url, headers, body)
app.addHook('preHandler', async (request, reply) => {
  try {
    const safeBody = request.body && typeof request.body === 'object' ? JSON.stringify(request.body) : String(request.body || '');
    app.log.debug({
      msg: 'incoming request',
      method: request.method,
      url: request.url,
      hostname: request.hostname,
      remoteAddress: request.ip || request.routerPath || request.headers['x-forwarded-for'],
      headers: request.headers,
      body: safeBody,
    });
  } catch (e) {
    app.log.debug({ msg: 'error serializing request body for log', err: String(e) });
  }
});

// Custom not-found handler to log unmatched routes with details
app.setNotFoundHandler((request, reply) => {
  app.log.warn({
    msg: 'Route not found',
    method: request.method,
    url: request.url,
    headers: request.headers
  });
  reply.status(404).send({ error: 'Route not found' });
});

app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
  const incoming = (request.headers['x-service-token'] as string) || '';
  if (incoming && incoming === SERVICE_TOKEN) {
    (request as any).isServiceCall = true;
    return;
  }
  // sinon poursuivre le flux normal d'auth
});

// Error handling
app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
  app.log.error(error);
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    success:false,
    error: NODE_ENV === "development" ? error.message : "Internal Server Error",
  });
});

// Start server
async function start() {
  try {
    const db = await dbPromise;
    app.decorate('db', db);
    app.register(matchmakingRoutes);
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`matchmaking-service started`);
    await app.ready();
    app.log.info(app.printRoutes());
  }
  catch (err) {
    app.log.error("[FATAL]: Could not start server: ", err);
    process.exit(1);
  }
}

start();