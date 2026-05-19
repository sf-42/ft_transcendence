import fastify from "fastify";
import helmet from "@fastify/helmet";
import routes from "./route";
import { initDatabase } from "./database";
import { ConnectionManager } from "./ConnectionManager";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT) || 3004;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const server = fastify({
  logger: {
    transport: NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: { translateTime: "HH:MM:ss Z", colorize: true, ignore: 'pid,hostname' },
    } : undefined,
  },
});

async function start() {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[FATAL]: Missing JWT_SECRET environment variable");
      process.exit(1);
    }
    await initDatabase();
    
    // Security headers with strict CSP for API service
    await server.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
    });
    
    await server.register(require("@fastify/websocket"));
    const manager = new ConnectionManager();
    await server.register(routes, { manager });
    await server.listen({ port: PORT, host: HOST });
    console.log(`chat-service started`);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
