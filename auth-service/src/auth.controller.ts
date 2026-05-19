import { FastifyRequest, FastifyReply } from 'fastify';
import { decode2FAChallengeJwt, signAccessJwt, JwtUserPayload } from './services/jwt.service';
import { dbPromise, getUserById } from './services/db.service';
import { verify2faCode } from './2fa';

export interface TwoFaVerifyBody {
    twoFactorCode: string;
    challengeToken: string; 
}


