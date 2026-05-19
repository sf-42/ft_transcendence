import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import Websocket from "@fastify/websocket";

import {
	block,
	unblock,
	getFriends,
	addFriend,
	deleteFriendship,
	acceptOrDeclineFriendship,
	getUserById,
	// areFriends,
	// isBlocked,
	createUser,
	getPendingInvites,
	getBlocked,
	deleteAllFriendship
} from "./database";

import { ConnectionManager } from "./ConnectionManager";
import { handleMessage } from "./webSocketHandler";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

// Helper function to update connection status in auth-service
async function updateConnectionStatus(userId: number, isConnected: boolean): Promise<boolean> {
	try {
		const response = await fetch(`${AUTH_SERVICE_URL}/connection-status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId, isConnected })
		});

		const responseText = await response.text();
		if (!response.ok) {
			console.error(`[ERROR]: Failed to update connection status for user ${userId}: ${response.status}`);
			return false;
		}

		console.log(`[INFO]: Connection status for user ${userId} set to ${isConnected}`);
		return true;
	} catch (err) {
		console.error(`[ERROR]: updateConnectionStatus failed for user ${userId}:`, err);
		return false;
	}
}

interface JWTPayload {
	id: number;
	email: string;
}

type AccessTokenPayload = {
	userId: number;
	username?: string;
	mfaVerified?: boolean;
};

export default async function routes(fastify: FastifyInstance, options: { manager: ConnectionManager }) {
	const manager = options.manager;

	// Add hook to extract user ID from gateway header
	fastify.addHook("preHandler", async (request, reply) => {
		const userId = request.headers['x-user-id'];
		if (userId) {
			(request as any).user = {
				id: parseInt(userId as string, 10)
			};
		}
	});

	fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
		return { hello: "world" };
	});

	fastify.post("/users", async (req: FastifyRequest<{ body: { id: string } }>, reply: FastifyReply) => {
		try {
			const id = Number(req.body);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: `Invalid id: ${req.body}` });

			const result = await createUser(id);
			console.log(`[INFO]: created user ${id} in chat service`);
			return reply.status(200).send({ success: result });
		} catch (error) {
			return reply.status(500).send({ error: 'Failed to create user' });
		}
	});

	// Search users by username
	fastify.get("/search", async (request: FastifyRequest<{ Querystring: { username: string } }>, reply: FastifyReply) => {
		try {
			const username = request.query.username;
			if (!username || username.length < 2) {
				return reply.status(400).send({
					success: false,
					message: "Username must be at least 2 characters",
				});
			}

			const me = (request as any).user?.id;
			if (!me) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorizeeeed",
				});
			}

			// Call user-service to search users
			try {
				const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3002';
				const searchResponse = await fetch(`${userServiceUrl}/search?username=${encodeURIComponent(username)}`);

				if (!searchResponse.ok) {
					return reply.status(204).send({
						success: true,
						message: "No user found",
					});
				}

				const user = await searchResponse.json();
				// const users = (userData.data || []).filter((user: any) => user.id !== me);

				if (user.id === me)
					return reply.status(400).send({ success: false, error: "You are searching yourself" });

				console.log("user found:", user);

				return reply.status(200).send({
					success: true,
					data: user,
				});
			} catch (error) {
				console.error("User service search error:", error);
				return reply.status(500).send({
					success: false,
					message: "Failed to search users",
				});
			}
		} catch (err) {
			console.error("Search error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	},
	);

	// Block
	fastify.post("/block", async (request: FastifyRequest<{ Body: { blocked_id: number } }>, reply: FastifyReply) => {
		try {
			const blocker_id = (request as any).user?.id;
			const { blocked_id } = request.body;

			if (!blocker_id) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			if (blocker_id === blocked_id || !blocked_id) {
				return reply.status(400).send({
					success: false,
					message: "Invalid payload",
				});
			}
			const statusCode = await block(blocker_id, blocked_id);
			if (statusCode === 201) {
				return reply.status(201).send({
					success: true,
					message: "Resource created",
				});
			} else if (statusCode === 409) {
				return reply.status(409).send({
					success: false,
					message: "Resource already exists",
				});
			} else {
				return reply.status(500).send({
					success: false,
					message: "Server error",
				});
			}
		} catch (err) {
			console.error("Block error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	});

	// get blocked users
	fastify.get("/blocked", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const me = (request as any).user?.id;

			if (!me) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			const blocked = await getBlocked(me);
			if (blocked.length === 0) {
				if (await getUserById(me))
					return reply.status(204).send({
						success: true,
						message: "No blocked user",
						data: {}
					});
				else
					return reply.status(404).send({
						success: false,
						message: "User not found",
					});
			}

			return reply.status(200).send({
				success: true,
				data: blocked,
			});
		} catch (err) {
			console.error("Error while getting blocked users:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	});

	// Unblock
	fastify.delete("/block/:blocked_id", async (request: FastifyRequest<{ Params: { blocked_id: string } }>, reply: FastifyReply) => {
		try {
			const blocker_id = (request as any).user?.id;
			const blocked_id = parseInt(request.params.blocked_id);

			if (!blocker_id) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			if (blocker_id === blocked_id || !blocked_id) {
				return reply.status(400).send({
					success: false,
					message: "Invalid request",
				});
			}

			const res = await unblock(blocker_id, blocked_id);
			if (res === 204) {
				return reply.status(204).send();
			} else {
				return reply.status(404).send({
					success: false,
					message: "Resource not found",
				});
			}
		} catch (err) {
			console.error("Unblock error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	},
	);

	// Get all friends
	fastify.get("/friends", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const me = (request as any).user?.id;

			if (!me) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			const friends = await getFriends(me);
			if (friends.length === 0) {
				if (await getUserById(me))
					return reply.status(204).send({
						success: true,
						message: "No friend found",
						data: {}
					});
				else
					return reply.status(404).send({
						success: false,
						message: "User not found",
					});
			}

			const friendsData = await Promise.all(friends.map(async (friendId: number) => {
				const isOnline = manager.isConnected(friendId);
				return {
					id: friendId,
					isOnline
				};
			}));

			return reply.status(200).send({
				success: true,
				data: friendsData,
			});
		} catch (err) {
			console.error("Friends error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	});

	// Add friend (friend request)
	fastify.post("/friends", async (request: FastifyRequest<{ Body: { friend: number } }>, reply: FastifyReply) => {
		try {
			const me = (request as any).user?.id;
			const { friend } = request.body;

			if (!me) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			if (me === friend || !friend) {
				return reply.status(400).send({
					success: false,
					message: "Invalid request",
				});
			}

			const res = await addFriend(me, friend);
			if (res === 200) {
				return reply.status(200).send({
					success: true,
					message: "Friend request sent",
				});
			} else {
				return reply.status(409).send({
					success: false,
					message: "Resource already exists",
				});
			}
		} catch (err) {
			console.error("Add friend error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	},
	);

	// Delete friendship
	fastify.delete("/friends/:friend", async (request: FastifyRequest<{ Params: { friend: string } }>, reply: FastifyReply) => {
		try {
			const me = (request as any).user?.id;
			const friend = parseInt(request.params.friend);

			if (!me) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			if (me === friend || !friend) {
				return reply.status(400).send({
					success: false,
					message: "Invalid request",
				});
			}

			const res = await deleteFriendship(me, friend);
			if (res === 204) {
				return reply.status(204).send();
			} else {
				return reply.status(404).send({
					success: false,
					message: "Resource not found",
				});
			}
		} catch (err) {
			console.error("Delete friendship error:", err);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	},
	);

	// Get pending invites
	fastify.get("/friends/invites", async (req: FastifyRequest, reply: FastifyReply) => {
		const userId = (req.headers as any)['x-user-id'];
		if (!userId) {
			return reply.status(401).send({
				error: 'Unauthorized - missing user ID'
			});
		}

		try {
			const res = await getPendingInvites(userId);

			return reply.status(200).send({ success: true, data: res });
		} catch (error) {
			console.error("[ERROR]: get pending invites error:", error);
			return reply.status(500).send({ success: false, message: "Internal server error" });
		}
	});

	// Accept or decline friendship
	fastify.put("/friends/:id_friendship", async (request: FastifyRequest<{
		Params: { id_friendship: string };
		Body: { pending: boolean };
	}>,
		reply: FastifyReply) => {
		try {
			const id = parseInt(request.params.id_friendship);
			// Handle body as string or object
			let body = request.body as any;
			if (typeof body === 'string') {
				try {
					body = JSON.parse(body);
				} catch (e) {
					return reply.status(400).send({ success: false, message: "Invalid JSON body" });
				}
			}
			const pending = body?.pending;
			const user = (request as any).user?.id;

			if (!user) {
				return reply.status(401).send({
					success: false,
					message: "Unauthorized - missing x-user-id header",
				});
			}

			if (!id || user <= 0) {
				return reply.status(400).send({
					success: false,
					message: "Invalid parameters",
				});
			}

			const res = await acceptOrDeclineFriendship(id, pending, user);
			switch (res) {
				case 200:
					return reply.status(200).send({
						success: true,
						message: "Friendship accepted",
					});
				case 204:
					return reply.status(204).send();
				case 400:
					return reply.status(400).send({
						success: false,
						message: "Friendship already accepted",
					});
				case 401:
					return reply.status(401).send({
						success: false,
						message: "Sender cannot accept their own request",
					});
				case 403:
					return reply.status(403).send({
						success: false,
						message: "User not allowed to modify this friendship",
					});
				case 404:
					return reply.status(404).send({
						success: false,
						message: "Friendship not found",
					});
				default:
					return reply.status(500).send({
						success: false,
						message: "Internal server error",
					});
			}
		} catch (error) {
			console.error("PUT /friends/:id_friendship error:", error);
			return reply.status(500).send({
				success: false,
				message: "Internal server error",
			});
		}
	},
	);
	fastify.delete('/internal/sync', async function (req: FastifyRequest, reply: FastifyReply) {
		const apiKey = req.headers['x-internal-secret'];
		const db = (fastify as any).db;
		if (apiKey !== process.env.INTERNAL_SERVICE_SECRET) {
			return reply.status(403).send({ error: "Access denied. Internal communication only." });
		}
		const id = Number(req.headers['x-user-id']);
		if (Number.isNaN(id)) {
			return reply.status(400).send({ error: 'Invalid user id' });
		}
		const res = await deleteAllFriendship(id);
		if (res) {
			return reply.status(200).send({ success: true });
		} else {
			return reply.status(500).send({ error: 'Failed to delete friendships' });
		}
	});

	fastify.get("/ws", { websocket: true }, async (connection, req: FastifyRequest) => {
		const ws = connection.socket;
		const COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'access_token';
		const JWT_SECRET = process.env.JWT_SECRET || '';

		// Parse cookies From header
		const cookies = parse(req.headers.cookie || '');

		// Extract userId from JWT cookie
		let userId: number | null = null;
		const token = cookies[COOKIE_NAME];

		if (token && JWT_SECRET) {
			try {
				const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
				if (payload?.userId) {
					userId = payload.userId;
				}
			} catch (err: any) {
				// console.error('[Chat WS] Invalid JWT:', err.message);
			}
		}

		if (!userId) {
			console.log('[Chat WS] No valid authentication, closing connection');
			ws.send(JSON.stringify({ type: "error", message: "Missing authentication" }));
			ws.close();
			return;
		}

		// Verify user exists
		try {
			const user = await getUserById(userId);
			if (!user) {
				ws.send(JSON.stringify({ type: "error", message: "User not found" }));
				ws.close();
				return;
			}
		} catch (err) {
			ws.send(JSON.stringify({ type: "error", message: "DB error" }));
			ws.close();
			return;
		}

		// Add user to connection manager and set connection status
		// Note: ConnectionManager.add() handles closing old connections if user was already connected
		manager.add(userId, ws);
		await updateConnectionStatus(userId, true);
		console.log(`User ${userId} connected to chat`);

		/* // Send authentication success message
		ws.send(JSON.stringify({ 
			type: "auth_success", 
			message: "Successfully authenticated",
			userId: userId 
		})); */

		// Handle incoming messages
		ws.on("message", async (data: any) => {
			handleMessage(data, userId, ws, manager);
		});

		ws.on("error", (error: any) => {
			console.error(`WebSocket error for user ${userId}:`, error);
		});

		// Note: connection status update on close is handled by ConnectionManager.remove()
		ws.on("close", () => {
			console.log(`User ${userId} disconnected`);
		});
	},
	);
}

/*

*/
/*
  id: tosend,
  message:
*/
