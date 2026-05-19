import jwt, { JwtPayload } from 'jsonwebtoken';


// --------------------- Interfaces ---------------------

export interface JwtUserPayload {
    userId: number;
    username: string;
    mfaVerified?: boolean;
}

interface ChallengeTokenPayload extends JwtUserPayload {
    kind: 'challenge';
}

interface AccessTokenPayload extends JwtUserPayload {
    kind: 'access';
    jti?: string;
}

interface RefreshTokenPayload extends JwtUserPayload {
    kind: 'refresh';
    jti?: string;
}

interface WsTokenPayload extends JwtUserPayload {
    kind: 'ws';
    jti?: string;
}


// --------------------- Secrets and Configuration ---------------------

// SECURITY: Secrets MUST be provided via environment variables - no defaults allowed
const ACCESS_SECRET = process.env.JWT_SECRET;
const CHALLENGE_SECRET = process.env.JWT_CHALLENGE_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || ACCESS_SECRET; // Fallback to ACCESS_SECRET

if (!ACCESS_SECRET) {
    console.error('[FATAL SECURITY]: JWT_SECRET environment variable is required');
    process.exit(1);
}

if (!CHALLENGE_SECRET) {
    console.error('[FATAL SECURITY]: JWT_CHALLENGE_SECRET environment variable is required');
    process.exit(1);
}

if (!REFRESH_SECRET) {
    console.warn('[SECURITY]: JWT_REFRESH_SECRET not set, using JWT_SECRET for refresh tokens');
}

// TypeScript needs these after the checks
const JWT_ACCESS_SECRET: string = ACCESS_SECRET;
const JWT_CHALLENGE_SECRET: string = CHALLENGE_SECRET;
const JWT_REFRESH_SECRET: string = REFRESH_SECRET || ACCESS_SECRET;

const JWT_CONFIG = {
    issuer: 'transcendence',
    audience: 'transcendence-client',
    algorithm: 'HS256' as const,
    accessExpiresIn: 24 * 60 * 60,      // Access token (24h)
    refreshExpiresIn: 7 * 24 * 60 * 60, // Refresh token long (7 jours)
    challengeExpiresIn: 10 * 60,        // Challenge 2FA (10 min)
    wsExpiresIn: 90,                    // WebSocket token très court (90s)
};

const revokedTokens = new Set<string>();


// --------------------- Helpers ---------------------

function generateJti(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function verifyAlgorithm(token: string): void {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
        throw new Error('Invalid token format');
    }
    if (decoded.header.alg !== JWT_CONFIG.algorithm) {
        throw new Error(`Invalid token algorithm: expected ${JWT_CONFIG.algorithm}, got ${decoded.header.alg}`);
    }
}


// --------------------- Token Generation ---------------------

export function signAccessJwt(payload: JwtUserPayload): string {
    const jti = generateJti();
    return jwt.sign(
        { ...payload, kind: 'access', jti },
        JWT_ACCESS_SECRET,
        {
            expiresIn: JWT_CONFIG.accessExpiresIn,
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithm: JWT_CONFIG.algorithm,
        }
    );
}

export function signRefreshJwt(payload: JwtUserPayload): string {
    const jti = generateJti();
    return jwt.sign(
        { ...payload, kind: 'refresh', jti },
        JWT_REFRESH_SECRET,
        {
            expiresIn: JWT_CONFIG.refreshExpiresIn,
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithm: JWT_CONFIG.algorithm,
        }
    );
}

// sign WebSocket token (very short-lived - 90 seconds)
export function signWsJwt(payload: JwtUserPayload): string {
    const jti = generateJti();
    return jwt.sign(
        { ...payload, kind: 'ws', jti },
        JWT_ACCESS_SECRET,
        {
            expiresIn: JWT_CONFIG.wsExpiresIn,
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithm: JWT_CONFIG.algorithm,
        }
    );
}

// sign challenge token to initiate 2fa
export function sign2FAChallengeJwt(payload: Pick<JwtUserPayload, 'userId' | 'username'>): string {
    return jwt.sign(
        { ...payload, kind: 'challenge' },
        JWT_CHALLENGE_SECRET,
        {
            expiresIn: JWT_CONFIG.challengeExpiresIn,
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithm: JWT_CONFIG.algorithm,
        }
    );
}


// --------------------- Token Verification ---------------------

export function decode2FAChallengeJwt(token: string): Pick<JwtUserPayload, 'userId' | 'username'> | null {
    try {
        verifyAlgorithm(token);
        const decoded = jwt.verify(token, JWT_CHALLENGE_SECRET, {
            algorithms: [JWT_CONFIG.algorithm],
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
        }) as JwtPayload;

        if (decoded.kind !== 'challenge') {
            console.error('Token used for 2FA verification is not a challenge token');
            return null;
        }

        return {
            userId: decoded.userId as number,
            username: decoded.username as string,
        };
    } catch (error) {
        console.error('2FA Challenge Token verification failed:', (error as Error).message);
        return null;
    }
}

// Verify access token with strict validation
export function verifyAccessJwt(token: string): AccessTokenPayload | null {
    try {
        verifyAlgorithm(token);
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
            algorithms: [JWT_CONFIG.algorithm],
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
        }) as JwtPayload & AccessTokenPayload;

        if (decoded.kind !== 'access' && decoded.kind !== 'ws') {
            console.error('Token used is not an access or ws token');
            return null;
        }

        // Check if token is revoked
        if (decoded.jti && revokedTokens.has(decoded.jti)) {
            console.error('Token has been revoked');
            return null;
        }

        return decoded as AccessTokenPayload;
    } catch (error) {
        console.error('Access Token verification failed:', (error as Error).message);
        return null;
    }
}

// Alias pour compatibilité (typo dans l'ancien code)
export const verrifyAccessJwt = verifyAccessJwt;

// Verify refresh token
export function verifyRefreshJwt(token: string): RefreshTokenPayload | null {
    try {
        verifyAlgorithm(token);
        const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
            algorithms: [JWT_CONFIG.algorithm],
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
        }) as JwtPayload & RefreshTokenPayload;

        if (decoded.kind !== 'refresh') {
            console.error('Token used is not a refresh token');
            return null;
        }

        // Check if token is revoked
        if (decoded.jti && revokedTokens.has(decoded.jti)) {
            console.error('Refresh token has been revoked');
            return null;
        }

        return decoded as RefreshTokenPayload;
    } catch (error) {
        console.error('Refresh Token verification failed:', (error as Error).message);
        return null;
    }
}

// Verify WS token (accepts both ws and access tokens)
export function verifyWsJwt(token: string): WsTokenPayload | null {
    try {
        verifyAlgorithm(token);
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
            algorithms: [JWT_CONFIG.algorithm],
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
        }) as JwtPayload & WsTokenPayload;

        if (decoded.kind !== 'ws' && decoded.kind !== 'access') {
            console.error('Token used is not a ws or access token');
            return null;
        }

        // Check if token is revoked
        if (decoded.jti && revokedTokens.has(decoded.jti)) {
            console.error('WS token has been revoked');
            return null;
        }

        return decoded as WsTokenPayload;
    } catch (error) {
        console.error('WS Token verification failed:', (error as Error).message);
        return null;
    }
}


// --------------------- Token Revocation ---------------------

// Revoke a token by its jti
export function revokeToken(jti: string): void {
    revokedTokens.add(jti);
    console.log(`[Security] Token revoked: ${jti.substring(0, 10)}...`);

    // Clean up after 24h to avoid memory leak
    setTimeout(() => {
        revokedTokens.delete(jti);
    }, 24 * 60 * 60 * 1000);
}

// Decode token without verification (for getting jti to revoke)
export function decodeToken(token: string): JwtPayload | null {
    try {
        return jwt.decode(token) as JwtPayload;
    } catch {
        return null;
    }
}

// Rotate refresh token (generates new tokens + revokes old)
export function rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string } | null {
    const decoded = verifyRefreshJwt(oldToken);

    if (!decoded) {
        return null;
    }

    // Revoke the old refresh token
    if (decoded.jti) {
        revokeToken(decoded.jti);
    }

    // Generate new tokens
    const payload: JwtUserPayload = {
        userId: decoded.userId,
        username: decoded.username,
        mfaVerified: decoded.mfaVerified,
    };

    return {
        accessToken: signAccessJwt(payload),
        refreshToken: signRefreshJwt(payload),
    };
}