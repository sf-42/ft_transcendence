import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from "@fastify/helmet";
import authRoutes from "./auth.routes";
import oauthRoutes from "./externalServicesAuth";
import { config } from 'dotenv';
import cookie from '@fastify/cookie';
import { dbPromise, cleanupStaleConnections } from './services/db.service';

config();

// ===== .env vars =====
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string || '';
const CALLBACK_URI = process.env.CALLBACK_URI as string || 'http://localhost:3001/auth/google/callback';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app: FastifyInstance = fastify({
  logger: {
    transport: NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: { translateTime: "HH:MM:ss Z", colorize: true, ignore: 'pid,hostname' },
    } : undefined,
  },
});

app.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'secretCoookie'
});



// Enable CORS for development (adjust origins for production)
app.register(cors, {
  origin: true, // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Range', 'X-Total-Count']
});

// Add security headers with strict CSP for API service
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],  // API only - no resources needed
      frameAncestors: ["'none'"],  // Prevent clickjacking
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
});

// Handle preflight requests
app.addHook('onRequest', (request, reply, done) => {
  if (request.method === 'OPTIONS') {
    reply.status(204).send();
    return;
  }
  done();
});

app.register(authRoutes, { prefix: '/' });
app.register(oauthRoutes, { prefix: '/' });

async function start() {
  const PORT = Number(process.env.PORT ?? 3001);
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`auth-service started`);
    
    // Start periodic cleanup of stale connections (every 30 seconds)
    // This catches cases where WebSocket disconnect was not properly detected
    const CLEANUP_INTERVAL = 30000; // 30 seconds
    const STALE_TIMEOUT = 60000;    // Consider stale if last_seen > 60 seconds ago
    
    setInterval(async () => {
      try {
        const db = await dbPromise;
        await cleanupStaleConnections(db, STALE_TIMEOUT);
      } catch (err: any) {
        app.log.error({ err: err?.message || err }, 'Stale connection cleanup failed');
      }
    }, CLEANUP_INTERVAL);
    
    app.log.info(`Stale connection cleanup scheduled every ${CLEANUP_INTERVAL / 1000}s`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
