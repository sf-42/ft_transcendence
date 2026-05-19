/**
 * External OAuth Services (Google & 42)
 * Handles OAuth2 authentication flows
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { signAccessJwt, signRefreshJwt, verifyAccessJwt } from './services/jwt.service';
import { returnError } from './utils/errorDisplay';

// ===== Configuration =====
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://localhost:8443/auth/google/callback';

const FORTYTWO_CLIENT_ID = process.env.FORTYTWO_CLIENT_ID || '';
const FORTYTWO_CLIENT_SECRET = process.env.FORTYTWO_CLIENT_SECRET || '';
const FORTYTWO_REDIRECT_URI = process.env.FORTYTWO_REDIRECT_URI || 'https://localhost:8443/auth/42/callback';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:8443';

// For OAuth flows, we need to redirect to the same domain as the callback URI
// to ensure cookies are sent correctly
const OAUTH_FRONTEND_URL = 'https://localhost:8443';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3002';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://chat-service:3004';

// Cookie options
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

// ===== Database helpers =====
import { dbPromise } from './services/db.service';

interface OAuthUser {
    id: number;
    username: string;
    oauth_provider: string;
    oauth_id: string;
    avatar?: string;
}

async function findOrCreateOAuthUser(
    provider: 'google' | '42',
    oauthId: string,
    username: string,
    avatar?: string
): Promise<OAuthUser | null> {
    const db = await dbPromise;
    
    // Check if user exists with this OAuth ID (returning user)
    let user = await db.get(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        [provider, oauthId]
    );
    
    if (user) {
        return user;
    }
    
    // Clean username: only alphanumeric, underscore, dash - max 20 chars
    const cleanUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);
    
    // Check if username already exists
    const existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existingUsername) {
        // Username taken - return null to signal error
        return null;
    }
    
    // Create new user
    const result = await db.run(
        `INSERT INTO users (username, oauth_provider, oauth_id, avatar, twofa, createdAt) 
         VALUES (?, ?, ?, ?, 0, datetime('now'))`,
        [cleanUsername, provider, oauthId, avatar || null]
    );
    
    return {
        id: result.lastID!,
        username: cleanUsername,
        oauth_provider: provider,
        oauth_id: oauthId,
        avatar,
    };
}

// Sync user with user-service
async function syncUserWithUserService(userId: number, username: string): Promise<void> {
    try {
        const response = await fetch(`${USER_SERVICE_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, username }),
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error('[USER SYNC ERROR]:', error);
        } else {
            console.log(`[USER SYNC] User ${userId} (${username}) synced with user-service`);
        }
    } catch (err) {
        console.error('[USER SYNC ERROR]:', err);
        // Don't throw - user can still login, just might have missing profile data
    }
}

// Sync user with chat-service
async function syncUserWithChatService(userId: number): Promise<void> {
    try {
        const response = await fetch(`${CHAT_SERVICE_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userId),
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error('[CHAT SYNC ERROR]:', error);
        } else {
            console.log(`[CHAT SYNC] User ${userId} synced with chat-service`);
        }
    } catch (err) {
        console.error('[CHAT SYNC ERROR]:', err);
        // Don't throw - user can still login, just might have missing chat features
    }
}

// ===== Google OAuth =====

async function getGoogleTokens(code: string): Promise<{ access_token: string; id_token: string }> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google token exchange failed: ${error}`);
    }
    
    return response.json();
}

interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture?: string;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
        throw new Error('Failed to get Google user info');
    }
    
    return response.json();
}

// ===== 42 OAuth =====

async function get42Tokens(code: string): Promise<{ access_token: string }> {
    const response = await fetch('https://api.intra.42.fr/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: FORTYTWO_CLIENT_ID,
            client_secret: FORTYTWO_CLIENT_SECRET,
            redirect_uri: FORTYTWO_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`42 token exchange failed: ${error}`);
    }
    
    return response.json();
}

interface FortyTwoUserInfo {
    id: number;
    email: string;
    login: string;
    image?: { link?: string };
}

async function get42UserInfo(accessToken: string): Promise<FortyTwoUserInfo> {
    const response = await fetch('https://api.intra.42.fr/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
        throw new Error('Failed to get 42 user info');
    }
    
    return response.json();
}


function checkAlreadyLoggedIn(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.cookies.access_token) {
        try {
            const decoded = verifyAccessJwt(request.cookies.access_token);
            if (decoded) {
                reply.redirect(`${OAUTH_FRONTEND_URL}/?error=already_logged_in`);
                return true;
            }
        } catch (e) {
        }
    }
    return false;
}


// ===== Routes =====
// NOTE: Routes are registered WITHOUT /auth prefix because gateway proxy strips it
// Gateway receives /auth/google → forwards /google to auth-service

export default async function oauthRoutes(app: FastifyInstance) {
    
    // ==================== GOOGLE ====================
    
    // Redirect to Google OAuth
    app.get('/google', async (request: FastifyRequest, reply: FastifyReply) => {
        if (checkAlreadyLoggedIn(request, reply)) {
            return;
        }
        if (!GOOGLE_CLIENT_ID) {
            return returnError(request, reply, 'Google OAuth not configured', 503);
        }
        
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            prompt: 'consent',
        });
        
        return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
    
    // Google OAuth callback
    app.get('/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { code, error } = request.query as { code?: string; error?: string };
            
            if (error) {
                app.log.warn({ error }, 'Google OAuth error');
                return reply.redirect(`${FRONTEND_URL}/login?error=google_denied`);
            }
            
            if (!code) {
                return reply.redirect(`${FRONTEND_URL}/login?error=no_code`);
            }
            
            // Exchange code for tokens
            const tokens = await getGoogleTokens(code);
            
            // Get user info
            const googleUser = await getGoogleUserInfo(tokens.access_token);
            
            // Find or create user in our database (using name as username)
            const user = await findOrCreateOAuthUser(
                'google',
                googleUser.id,
                googleUser.name,
                googleUser.picture
            );
            
            // Username already taken
            if (!user) {
                app.log.warn({ name: googleUser.name }, 'Google OAuth: username already taken');
                return reply.redirect(`${FRONTEND_URL}/login?error=username_taken`);
            }
            
            // Sync user with user-service and chat-service
            await syncUserWithUserService(user.id, user.username);
            await syncUserWithChatService(user.id);
            
            // Generate our JWT tokens
            const accessToken = signAccessJwt({
                userId: user.id,
                username: user.username,
                mfaVerified: true, // OAuth = verified
            });
            
            const refreshToken = signRefreshJwt({
                userId: user.id,
                username: user.username,
                mfaVerified: true,
            });
            
            // Set cookies
            (reply as any).setCookie('access_token', accessToken, {
                ...COOKIE_OPTIONS,
                maxAge: 24 * 60 * 60, // 24 hours
            });
            
            (reply as any).setCookie('refresh_token', refreshToken, {
                ...COOKIE_OPTIONS,
                maxAge: 7 * 24 * 60 * 60, // 7 days
            });
            
            // Redirect to frontend (use localhost to match cookie domain from OAuth callback)
            return reply.redirect(`${OAUTH_FRONTEND_URL}/?login=success`);
            
        } catch (err: any) {
            app.log.error({ err: err.message, stack: err.stack }, 'Google OAuth callback error');
            console.error('[GOOGLE OAUTH ERROR]:', err);
            return reply.redirect(`${OAUTH_FRONTEND_URL}/login?error=google_failed`);
        }
    });
    
    // ==================== 42 ====================
    
    // Redirect to 42 OAuth
    app.get('/42', async (request: FastifyRequest, reply: FastifyReply) => {
        if (checkAlreadyLoggedIn(request, reply)) {
            return;
        }
        if (!FORTYTWO_CLIENT_ID) {
            return returnError(request, reply, '42 OAuth not configured', 503);
        }
        
        const params = new URLSearchParams({
            client_id: FORTYTWO_CLIENT_ID,
            redirect_uri: FORTYTWO_REDIRECT_URI,
            response_type: 'code',
            scope: 'public',
        });
        
        return reply.redirect(`https://api.intra.42.fr/oauth/authorize?${params}`);
    });
    
    // 42 OAuth callback
    app.get('/42/callback', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { code, error } = request.query as { code?: string; error?: string };
            
            if (error) {
                app.log.warn({ error }, '42 OAuth error');
                return reply.redirect(`${FRONTEND_URL}/login?error=42_denied`);
            }
            
            if (!code) {
                return reply.redirect(`${FRONTEND_URL}/login?error=no_code`);
            }
            
            // Exchange code for tokens
            const tokens = await get42Tokens(code);
            
            // Get user info
            const fortyTwoUser = await get42UserInfo(tokens.access_token);
            
            // Find or create user in our database (using login as username)
            const user = await findOrCreateOAuthUser(
                '42',
                fortyTwoUser.id.toString(),
                fortyTwoUser.login,
                fortyTwoUser.image?.link
            );
            
            // Username already taken
            if (!user) {
                app.log.warn({ login: fortyTwoUser.login }, '42 OAuth: username already taken');
                return reply.redirect(`${FRONTEND_URL}/login?error=username_taken`);
            }
            
            // Sync user with user-service and chat-service
            await syncUserWithUserService(user.id, user.username);
            await syncUserWithChatService(user.id);
            
            // Generate our JWT tokens
            const accessToken = signAccessJwt({
                userId: user.id,
                username: user.username,
                mfaVerified: true, // OAuth = verified
            });
            
            const refreshToken = signRefreshJwt({
                userId: user.id,
                username: user.username,
                mfaVerified: true,
            });
            
            // Set cookies
            (reply as any).setCookie('access_token', accessToken, {
                ...COOKIE_OPTIONS,
                maxAge: 24 * 60 * 60, // 24 hours
            });
            
            (reply as any).setCookie('refresh_token', refreshToken, {
                ...COOKIE_OPTIONS,
                maxAge: 7 * 24 * 60 * 60,
            });
            
            // Redirect to frontend (use localhost to match cookie domain from OAuth callback)
            return reply.redirect(`${OAUTH_FRONTEND_URL}/?login=success`);
            
        } catch (err: any) {
            app.log.error({ err: err.message }, '42 OAuth callback error');
            return reply.redirect(`${OAUTH_FRONTEND_URL}/login?error=42_failed`);
        }
    });
    
    // ==================== Status ====================
    
    // Check which OAuth providers are available
    app.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({
            google: !!GOOGLE_CLIENT_ID,
            fortytwo: !!FORTYTWO_CLIENT_ID,
        });
    });
}
