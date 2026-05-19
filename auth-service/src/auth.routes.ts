import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UserSignupBody, UserLoginBody, removeUserBody, userLogin, userSignup, verify2faToken, getUsers, changePassword, changeUserPassword, removeUser } from "./user.model";
import { TwoFaVerifyBody } from "./auth.controller";
import { signWsJwt, signRefreshJwt, verifyAccessJwt, verifyRefreshJwt, rotateRefreshToken, revokeToken, decodeToken, JwtUserPayload } from "./services/jwt.service";
import { rateLimitMiddleware, SENSITIVE_ROUTES } from "./middleware/rate-limit";
import { dbPromise, getIsConnected, setIsConnected } from "./services/db.service";
import { createWebsocketToken, checkAccessToken, checkLoggedIn } from "./utils/token";
import { returnError } from "./utils/errorDisplay";



// CSFR (Cross-Site Request Forgery): attack where a maliciouys website tricks a logged-in user into performing
//                                   unwanted actions on another site by explointing their cookies.
//   -> lax limit the cookie auto send during cross-site requests mot "normal"
//

const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,  // CSRF security, strict typing (see def. up)
	path: '/',  // Cookie sended to all path
};

// Define all routes of auth
export default async function authRoutes(app: FastifyInstance) {
	
	// Rate Limiting Hook
	app.addHook('preHandler', async (request, reply) => {
		if (SENSITIVE_ROUTES.some(route => request.url.includes(route))) {
			await rateLimitMiddleware(request, reply);
		}
	});
	// Root
	app.get("/", (_, reply) => {
		reply.send({ message: "auth-service online" })
	});
	// Health Check
	app.get("/health", (_, reply) => {
		reply.send({ status: "ok", service: "auth-service" })
	});


	// ===== TOKEN ROUTES =====

	// Token Check (for frontend to verify auth)
	app.get("/token", async (request: FastifyRequest, reply: FastifyReply) => {
		return await checkAccessToken( request, reply );
	});

	app.get("/loggedin", async (request: FastifyRequest, reply: FastifyReply) => {
		return await checkLoggedIn( request, reply );
	});

	// WebSocket Token (short-lived 90s)
	app.post("/ws-token", async (request: FastifyRequest, reply: FastifyReply) => {
			return await createWebsocketToken(request, reply);
	});

	// ========================


	// ===== CONNECTIONS =====

	// Login
	app.post("/login", async (request: FastifyRequest<{ Body: UserLoginBody }>, reply: FastifyReply) => {
		return await userLogin(request as any, reply);
	});

	// ===== Signup =====
	app.post("/signup", async (request: FastifyRequest<{ Body: UserSignupBody }>, reply: FastifyReply) => {
		try {
			return await userSignup(request as any, reply);
		} catch (err) {
			console.error("[ERROR] /signup:", err);
			return returnError(request as any, reply, "Signup failed", 500);
		}
	});

	// ===== 2FA =====
	app.post("/2fa/verify", async (request: FastifyRequest<{ Body: TwoFaVerifyBody }>, reply: FastifyReply) => {
		try {
			return await verify2faToken(request as any, reply);
		} catch (err) {
			console.error("[ERROR] /2fa/verify:", err);
			return returnError(request as any, reply, "2FA verification failed", 500);
		}
	});

	

	// ===== Refresh Token (rotation) =====
	app.post("/refresh", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const refreshToken = (request as any).cookies?.refresh_token;
			if (!refreshToken) {
				return returnError(request as any, reply, "No refresh token provided", 401);
			}
			// Rotation: generate new tokens + rm old one
			const result = rotateRefreshToken(refreshToken);
			if (!result) {
				(reply as any).clearCookie("access_token", { path: "/" });
				(reply as any).clearCookie("refresh_token", { path: "/" });
				return returnError(request as any, reply, "Invalid or expired refresh token", 401);
			}
			// Set new cookies
			(reply as any).setCookie("access_token", result.accessToken, {
				...COOKIE_OPTIONS,
				maxAge: 24 * 60 * 60, // 24h
			});
			
			(reply as any).setCookie("refresh_token", result.refreshToken, {
				...COOKIE_OPTIONS,
				maxAge: 7 * 24 * 60 * 60, // 7d
			});
			
			return reply.send({ success: true, expiresIn: 86400 }); // 24h in sec
		} catch (error: any) {
			request.log.warn({ error: error.message }, "Token refresh failed");
			(reply as any).clearCookie("access_token", { path: "/" });
			(reply as any).clearCookie("refresh_token", { path: "/" });
			
			return returnError(request as any, reply, "Invalid or expired refresh token", 401);
		}
	});

	// ===== Logout (improved with revocation) =====
	app.post("/logout", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const accessToken = (request as any).cookies?.access_token;
			const refreshToken = (request as any).cookies?.refresh_token;
			
			if (accessToken) {
				const decoded = decodeToken(accessToken);
				if (decoded?.jti) {
					revokeToken(decoded.jti as string);
				}
				// Set connection status to false
				if (decoded?.userId) {
					const db = await dbPromise;
					await setIsConnected(db, decoded.userId as number, false);
				}
			}
			if (refreshToken) {
				const decoded = decodeToken(refreshToken);
				if (decoded?.jti) {
					revokeToken(decoded.jti as string);
				}
			}
			
			(reply as any).clearCookie("access_token", { path: "/" });
			(reply as any).clearCookie("refresh_token", { path: "/" });
			
			return reply.send({ success: true, message: "Logged out successfully" });
			
		} catch (error: any) {
			(reply as any).clearCookie("access_token", { path: "/" });
			(reply as any).clearCookie("refresh_token", { path: "/" });
			
			return reply.send({ success: true, message: "Logged out" });
		}
	});

	// ===== Auth Status =====
	app.get("/status", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const db = await dbPromise;
			const accessToken = (request as any).cookies?.access_token;
			
			if (!accessToken) {
				return reply.send({ authenticated: false });
			}
			
			const decoded = verifyAccessJwt(accessToken);
			
			if (!decoded) {
				return reply.send({ authenticated: false });
			}
			
			// Get oauth_provider from DB
			const user = await db.get('SELECT oauth_provider FROM users WHERE id = ?', [decoded.userId]);
			
			return reply.send({
				authenticated: true,
				userId: decoded.userId,
				username: decoded.username,
				mfaVerified: decoded.mfaVerified,
				oauthProvider: user?.oauth_provider || null,
			});
			
		} catch (error) {
			return reply.send({ authenticated: false });
		}
	});

	app.put("/password", async (request:FastifyRequest<{ Body: changePassword }>, reply: FastifyReply) => {
		try {
			return await changeUserPassword(request, reply);
		}
		catch (err) {
			request.log.error(err, "[ROUTE ERROR] /password failed");
			return returnError(request as any, reply, "Internal server error", 500);
		}
	});

	// ===== Remove =====
	app.delete("/remove",async (req: FastifyRequest<{ Body: removeUserBody }>, reply: FastifyReply) => {
			try {
				return await removeUser(req, reply);
			} catch (err) {
				req.log.error(err, "[ROUTE ERROR] /remove failed");
				return returnError(req as any, reply, "Internal server error", 500);
			}
		}
	);

	// ===== Users =====
	app.get("/users", async (request, reply) => {
		try {
			return await getUsers(request, reply);
		} catch (err) {
			console.error("[ERROR] /users:", err);
			return returnError(request as any, reply, "Get users failed", 500);
		}
	});

	// ===== Connection Status (for chat-service to update) =====
	app.post("/connection-status", async (request: FastifyRequest<{ Body: { userId: number, isConnected: boolean } }>, reply: FastifyReply) => {
		try {
			const { userId, isConnected } = request.body;
			
			if (typeof userId !== 'number' || typeof isConnected !== 'boolean') {
				return reply.status(400).send({ success: false, error: "Invalid payload" });
			}
			
			const db = await dbPromise;
			const success = await setIsConnected(db, userId, isConnected);
			
			if (success) {
				return reply.send({ success: true, message: `Connection status updated to ${isConnected}` });
			} else {
				return reply.status(500).send({ success: false, error: "Failed to update connection status" });
			}
		} catch (err) {
			console.error("[ERROR] /connection-status:", err);
			return reply.status(500).send({ success: false, error: "Internal server error" });
		}
	});

	// ===== Get Connection Status =====
	app.get("/connection-status/:userId", async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
		try {
			const userId = parseInt(request.params.userId, 10);
			
			if (isNaN(userId)) {
				return reply.status(400).send({ success: false, error: "Invalid userId" });
			}
			
			const db = await dbPromise;
			const isConnected = await getIsConnected(db, userId);
			
			return reply.send({ success: true, isConnected });
		} catch (err) {
			console.error("[ERROR] /connection-status/:userId:", err);
			return reply.status(500).send({ success: false, error: "Internal server error" });
		}
	});
}