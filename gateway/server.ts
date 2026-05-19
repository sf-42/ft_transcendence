import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import proxy from '@fastify/http-proxy';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

config();



// ============ CONFIG ============

type AccessTokenPayload = {
	userId: number;
	username?: string;
	mfaVerified?: boolean;
};

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || '';
const COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'access_token';

const SERVICES = {
	auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
	users: process.env.USER_SERVICE_URL || 'http://user-service:3002',
	game: process.env.GAME_SERVICE_URL || 'http://game-server:3005',
	chat: process.env.CHAT_SERVICE_URL || 'http://chat-service:3004',
	matchmaking: process.env.MATCHMAKING_SERVICE_URL || 'http://matchmaking-service:3003',
};




// ============ PUBLIC ROUTES ============
const PUBLIC_ROUTES = [
	'/auth/login',
	'/auth/register',
	'/auth/refresh',
	'/auth/signup',
	'/auth/google',           // Google OAuth
	'/auth/google/callback',  // Google OAuth callback
	'/auth/42',               // 42 OAuth
	'/auth/42/callback',      // 42 OAuth callback
	'/auth/providers',        // Check available providers
	'/health',
];



// Routes who needs auth
const PROTECTED_PREFIXES = ['/users', '/game', '/chat', '/matchmaking'];

// WebSocket routes that handle their own authentication
const WEBSOCKET_ROUTES = ['/chat/ws', '/game/ws', '/matchmaking/ws'];

function isPublicRoute(url: string): boolean {
	if (PUBLIC_ROUTES.includes(url)) { return true; }
	return PUBLIC_ROUTES.some(route => url.startsWith(route));
}

function isWebSocketRoute(url: string): boolean {
	return WEBSOCKET_ROUTES.some(route => url.startsWith(route));
}

function validateConfig() {
	for (const [name, url] of Object.entries(SERVICES)) {
		if (!url) {
			console.error(`[ERROR]: Missing service url for "${name}"`);
			process.exit(1);
		}
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				throw new Error("Invalid protocol");
			}
		}
		catch (err) {
			console.error(`[ERROR]: Invalid URL for service "${name}": ${url}`);
			process.exit(1);
		}
	}
	if (!JWT_SECRET) {
		console.warn('Warning: JWT secret not set. Gateway will run but cannot verify tokens.');
	}
}



// ============ CREATE SERVER ============
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = Fastify({
	logger: {
		transport: NODE_ENV === 'development' ? {
			target: 'pino-pretty',
			options: { translateTime: "HH:MM:ss Z", colorize: true, ignore: 'pid,hostname' },
		} : undefined,
	},
	trustProxy: true,
});

async function registerPlugins() {
	await app.register(helmet, {  // Helmet - Security headers
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "blob:"],
				connectSrc: ["'self'", "ws:", "wss:"],
			},
		},
		frameguard: { action: 'deny' },   // click jacking prrotection
		noSniff: true,  // cache securised
		xssFilter: true,  // XSS protection
	});

	await app.register(cors, {
		origin: (origin, cb) => {
			// Allow requests with no origin (mobile apps, curl, etc.)
			if (!origin) {
				cb(null, true);
				return;
			}
			// Allow localhost, any IP on HTTPS port 8443, and 42lyon.fr hostnames
			const allowedPatterns = [
				/^https?:\/\/localhost(:\d+)?$/,
				/^https?:\/\/127\.0\.0\.1(:\d+)?$/,
				/^https:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:8443$/,  // Any IP on port 8443
				/^https:\/\/[a-zA-Z0-9-]+\.42lyon\.fr:8443$/,  // 42lyon.fr hostnames
			];
			if (allowedPatterns.some(pattern => pattern.test(origin))) {
				cb(null, true);
			} else {
				app.log.warn(`CORS blocked origin: ${origin}`);
				cb(new Error('Not allowed by CORS'), false);
			}
		},
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	});

	await app.register(cookie, {
		secret: process.env.COOKIE_SECRET || JWT_SECRET,  // sign cookies
	});

	await app.register(rateLimit, {
		max: Number(process.env.RATE_LIMIT_MAX || 200),
		timeWindow: '1 minute',
		keyGenerator: (req) => req.ip,
	});
}

function attachAuthHook() {
	app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
		if ('x-user-id' in req.headers) {
			delete req.headers['x-user-id'];
		}
		const url = req.url.split('?')[0];  // Remove query params

		// Skip auth for WebSocket routes - they handle their own authentication
		if (isWebSocketRoute(url)) {
			return;
		}

		try {
			const token = req.cookies?.[COOKIE_NAME];
			if (!token) {
				if (!isPublicRoute(url) && PROTECTED_PREFIXES.some(p => url.startsWith(p))) {  // protected routes = 401
					return reply.status(401).send({
						success: false,
						error: 'Authentication required'
					});
				}
				return;
			}

			if (!JWT_SECRET) {
				req.log.warn('JWT_SECRET not configured');
				return;
			}

			const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
			if (payload?.userId) {
				if (payload.mfaVerified === false) {
					if (!url.startsWith('/auth/2fa') && !url.startsWith('/auth/logout')) {  // authorize only 2fa routes
						return reply.status(403).send({
							success: false,
							error: '2FA verification required',
							requires2FA: true,
						});
					}
				}

				req.headers['x-user-id'] = String(payload.userId);
				if (payload.username) {
					req.headers['x-username'] = payload.username;
				}
				req.log.info(`User authenticated: ${payload.userId}`);
			}
		} catch (err: any) {
			req.log.warn('Invalid access token in cookie');
			reply.clearCookie(COOKIE_NAME, { path: '/' });

			if (!isPublicRoute(url) && PROTECTED_PREFIXES.some(p => url.startsWith(p))) {
				return reply.status(401).send({
					success: false,
					error: 'Invalid or expired token'
				});
			}
		}
	});
}

async function registerRoutes() {  // config proxy per service
	await app.register(proxy as any, {
		upstream: SERVICES.auth,
		prefix: '/auth',
		http2: false,
		onError(reply: any, error: any) {
			app.log.error({ err: error }, 'Proxy error on /auth');
			reply.status(502).send({ success: false, error: 'Auth service unavaible' });
		},
		replyOptions: {
			rewriteRequestHeaders(req: any, headers: any) {
				if (req.headers['x-user-id']) {
					headers['x-user-id'] = String(req.headers['x-user-id']);
				}
				return headers;
			},
		},
	});
	await app.register(proxy as any, {
		upstream: SERVICES.users,
		prefix: '/users',
		http2: false,
		contentTypesToEncode: [], 
		onError(reply: any, error: any) {
			app.log.error({ err: error }, 'Proxy error on /users');
			reply.status(502).send({ success: false, error: 'Users service unavaible' });
		},
		replyOptions: {
			rewriteRequestHeaders(req: any, headers: any) {
				if (req.headers['x-user-id']) {
					headers['x-user-id'] = String(req.headers['x-user-id']);
				}
				return headers;
			},
		},
	});
	await app.register(proxy as any, {
		upstream: SERVICES.game,
		prefix: '/game',
		http2: false,
		onError(reply: any, error: any) {
			app.log.error({ err: error }, 'Proxy error on /game');
			reply.status(502).send({ success: false, error: 'Users service unavaible' });
		},
		replyOptions: {
			rewriteRequestHeaders(req: any, headers: any) {
				if (req.headers['x-user-id']) {
					headers['x-user-id'] = String(req.headers['x-user-id']);
				}
				return headers;
			},
		},
	});
	await app.register(proxy as any, {
		upstream: SERVICES.chat,
		prefix: '/chat',
		http2: false,
		websocket: true,
		onError(reply: any, error: any) {
			app.log.error({ err: error }, 'Proxy error on /chat');
			reply.status(502).send({ success: false, error: 'Chat service unavailable' });
		},
		replyOptions: {
			rewriteRequestHeaders: (req: any, headers: any) => {
				// For HTTP requests, x-user-id is already set by preHandler
				if (req.headers['x-user-id']) {
					headers['x-user-id'] = String(req.headers['x-user-id']);
					return headers;
				}

				// For WebSocket, decode JWT from cookie
				try {
					const token = req.cookies?.[COOKIE_NAME];
					if (token && JWT_SECRET) {
						const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
						if (payload?.userId) {
							headers['x-user-id'] = String(payload.userId);
						}
					}
				} catch {
					// Invalid token - chat-service will reject the connection
				}
				return headers;
			},
		}
	});
	await app.register(proxy as any, {
		upstream: SERVICES.matchmaking,
		prefix: '/matchmaking',
		http2: false,
		onError(reply: any, error: any) {
			app.log.error({ err: error }, 'Proxy error on /matchmaking');
			reply.status(502).send({ success: false, error: 'Matchmaking service unavailable' });
		},
		replyOptions: {
			rewriteRequestHeaders(req: any, headers: any) {
				if (req.headers['x-user-id']) {
					headers['x-user-id'] = String(req.headers['x-user-id']);
				}
				return headers;
			},
		}
	});
	app.get('/health', async () => ({ status: 'ok', service: 'gateway', upstreams: SERVICES }));
}

async function start() {
	validateConfig();

	await registerPlugins();
	attachAuthHook();
	await registerRoutes();

	try {
		await app.listen({ host: HOST, port: PORT });
		app.log.info(`gateway started`);
	} catch (error) {
		app.log.error(error);
		process.exit(1);
	}
}

void start();