/**
 * Rate Limiting Middleware
 * Protects against brute-force attacks on auth endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitEntry {
    count: number;
    resetTime: number;
    blocked?: boolean;
    blockUntil?: number;
}

interface RateLimitStore {
    [key: string]: RateLimitEntry;
}

const store: RateLimitStore = {};

// Skip rate limiting in test environment
const SKIP_RATE_LIMIT = process.env.NODE_ENV === 'test' || process.env.SKIP_RATE_LIMIT === 'true';

const RATE_LIMITS = {
    login: { maxAttempts: 10, windowMs: 60000, blockDurationMs: 300000 },      // 5 tentatives/min, block 5min
    signup: { maxAttempts: 10, windowMs: 60000, blockDurationMs: 600000 },     // 3/min, block 10min
    '2fa': { maxAttempts: 10, windowMs: 60000, blockDurationMs: 300000 },      // 5/min, block 5min
    'ws-token': { maxAttempts: 15, windowMs: 60000, blockDurationMs: 60000 }, // 10/min, block 1min
    refresh: { maxAttempts: 10, windowMs: 60000, blockDurationMs: 60000 },    // 10/min, block 1min
    default: { maxAttempts: 100, windowMs: 60000, blockDurationMs: 60000 },   // 100/min
};

function getClientKey(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : request.ip || 'unknown';
    const ua = request.headers['user-agent']?.substring(0, 50) || 'unknown';
    return `${ip}:${ua}`;
}

function getEndpointType(url: string): keyof typeof RATE_LIMITS {
    if (url.includes('/login')) return 'login';
    if (url.includes('/signup')) return 'signup';
    if (url.includes('/2fa') || url.includes('/verify')) return '2fa';
    if (url.includes('/ws-token')) return 'ws-token';
    if (url.includes('/refresh')) return 'refresh';
    return 'default';
}

export async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Skip rate limiting in test/dev environment when configured
    if (SKIP_RATE_LIMIT) {
        return;
    }
    
    const clientKey = getClientKey(request);
    const endpointType = getEndpointType(request.url);
    const config = RATE_LIMITS[endpointType];
    const storeKey = `${clientKey}:${endpointType}`;
    
    const now = Date.now();
    let entry = store[storeKey];
    
    if (entry?.blocked && entry.blockUntil && entry.blockUntil > now) {
        const retryAfter = Math.ceil((entry.blockUntil - now) / 1000);
        reply.header('Retry-After', retryAfter.toString());
        reply.header('X-RateLimit-Remaining', '0');
        reply.status(429).send({
            error: 'Too many requests',
            message: `Too many ${endpointType} attempts. Try again in ${retryAfter} seconds.`,
            retryAfter,
        });
        return;
    }
    
    if (!entry || entry.resetTime < now) {
        entry = {
            count: 0,
            resetTime: now + config.windowMs,
            blocked: false,
        };
    }
    
    entry.count++;
    
    if (entry.count > config.maxAttempts) {
        entry.blocked = true;
        entry.blockUntil = now + config.blockDurationMs;
        store[storeKey] = entry;
        
        const retryAfter = Math.ceil(config.blockDurationMs / 1000);
        reply.header('Retry-After', retryAfter.toString());
        reply.header('X-RateLimit-Remaining', '0');
        
        request.log.warn({
            clientKey: clientKey.substring(0, 20) + '...',
            endpointType,
            attempts: entry.count,
        }, 'Rate limit exceeded - client blocked');
        
        reply.status(429).send({
            error: 'Too many requests',
            message: `Too many ${endpointType} attempts. Blocked for ${retryAfter} seconds.`,
            retryAfter,
        });
        return;
    }
    
    store[storeKey] = entry;
    
    reply.header('X-RateLimit-Limit', config.maxAttempts.toString());
    reply.header('X-RateLimit-Remaining', (config.maxAttempts - entry.count).toString());
    reply.header('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
}

setInterval(() => {
    const now = Date.now();
    for (const key in store) {
        const entry = store[key];
        if (entry.resetTime < now && (!entry.blocked || (entry.blockUntil && entry.blockUntil < now))) {
            delete store[key];
        }
    }
}, 60000);

export const SENSITIVE_ROUTES = ['/login', '/signup', '/2fa', '/verify', '/ws-token', '/refresh'];
