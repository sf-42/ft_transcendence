import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessJwt, signWsJwt } from "../services/jwt.service";
import { returnError } from "./errorDisplay";


// Check the validity of the AccessToken ( is exist and is valid)
export async function checkAccessToken( request: FastifyRequest, reply: FastifyReply ) {
    try {
        const accessToken = (request as any).cookies?.access_token;
        if (!accessToken) {
            return returnError(request, reply, "No access token", 401);
        }
        
        const decoded = verifyAccessJwt(accessToken);
        if (!decoded) {
            return returnError(request, reply, "Invalid or expired token", 401);
        }
        
        return reply.send({ 
            access_token: accessToken,
            user: {
                userId: decoded.userId,
                username: decoded.username,
                mfaVerified: decoded.mfaVerified
            }
        });

    } catch (error: any) {
        request.log.warn({ error: (error as any).message }, "Token verification failed");
        return returnError(request, reply, "Token verification failed", 401);
    }
}

// Check if user logged in
export async function checkLoggedIn( request: FastifyRequest, reply: FastifyReply ) {
    try {
        const accessToken = (request as any).cookies?.access_token;
        if (!accessToken) {
            return reply.send({
                success: false
            });
        }
        
        const decoded = verifyAccessJwt(accessToken);
        if (!decoded) {
            return reply.send({
                success: false
            });
        }
        
        return reply.send({
            success: true
        });

    } catch (error: any) {
        request.log.warn({ error: (error as any).message }, "Token verification failed");
        return returnError(request, reply, "Token verification failed", 401);
    }
}


// Generate the web Token.
// Allows user auth. on the securized canal
export async function createWebsocketToken(request: FastifyRequest, reply: FastifyReply) {
    try {
        const accessToken = (request as any).cookies?.access_token;
        if (!accessToken) {
            return returnError(request, reply, "No access token provided", 401);
        }

        const decoded = verifyAccessJwt(accessToken);
        if (!decoded) {
            return returnError(request, reply, "Invalid or expired token", 401);
        }
        
        const wsToken = signWsJwt({
            userId: decoded.userId,
            username: decoded.username,
            mfaVerified: decoded.mfaVerified,
        });
        
        return reply.send({ token: wsToken, expiresIn: 90 });
        
    } catch (error: any) {
        request.log.error({ error: (error as any).message }, "WS token generation failed");
        return returnError(request, reply, "Invalid or expired token", 401);
    }
}
