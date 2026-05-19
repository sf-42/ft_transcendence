import { timeStamp } from "console";
import { ConnectionManager } from "./ConnectionManager";
import { areFriends, isBlocked } from "./database";
import { validateMessage, validateUserId, sanitizeHtml } from "./validation";

interface WebSocketMessage {
	type: 'message' | 'friend-request' | 'game-invite' | 'tournament-invite';
	from?: number;
	to?: number;
	content?: string;
	message?: string;
}

export async function handleMessage(data: any, userId: number, ws: any, manager: ConnectionManager) {
	try {
		const message: WebSocketMessage = JSON.parse(data);
		// const { to, content } = message;
		message.from = userId;

		if (!message.to) {
			ws.send(JSON.stringify({
				type: "error",
				message: "Invalid message format"
			}));
			return;
		}

		// Validate recipient ID
		const toValidation = validateUserId(message.to);
		if (!toValidation.valid) {
			ws.send(JSON.stringify({
				type: "error",
				message: toValidation.error
			}));
			return;
		}

		switch (message.type) {
			case 'message':
				await forwardChatMessage(message, ws, manager);
				break;
			case 'friend-request':
				await forwardFriendRequest(message, ws, manager);
				break;
			case 'game-invite':
				await forwardGameAndTournamentInvite(message, ws, manager);
				break;
			case 'tournament-invite':
				await forwardGameAndTournamentInvite(message, ws, manager);
				break;
			default:
				console.error('Unknown message type:', message.type);
		}
	} catch (error) {
		console.error("Message handling error:", error);
		ws.send(JSON.stringify({
			type: "error",
			message: "Failed to process message"
		}));
	}
}

async function forwardChatMessage(message: WebSocketMessage, ws: any, manager: ConnectionManager) {
	if (!message.content) {
		ws.send(JSON.stringify({
			type: "error",
			message: "Invalid message format"
		}));
		return;
	}

	// Validate message content
	const contentValidation = validateMessage(message.content);
	if (!contentValidation.valid) {
		ws.send(JSON.stringify({
			type: "error",
			message: contentValidation.error
		}));
		return;
	}

	if (typeof message.to !== "number" || typeof message.content !== "string") {
		ws.send(JSON.stringify({
			type: "error",
			message: "Invalid data types"
		}));
		return;
	}

	// Sanitize message content before forwarding
	message.content = sanitizeHtml(message.content);

	// Check if they are friends
	const isFriendConnection = await areFriends(message.from, message.to);
	if (!isFriendConnection) {
		ws.send(JSON.stringify({
			type: "error",
			message: "You are not friend with this user"
		}));
		return;
	}

	// Check if receiver has blocked sender
	const isReceiverBlocked = await isBlocked(message.to, message.from);
	if (isReceiverBlocked) {
		ws.send(JSON.stringify({
			type: "error",
			message: "This user has blocked you"
		}));
		return;
	}

	// Check if receiver is connected
	if (!manager.isConnected(message.to)) {
		ws.send(JSON.stringify({
			type: "error",
			message: "User is offline"
		}));
		return;
	}

	// Send message to specific user
	const messageData = JSON.stringify({
		type: "message",
		from: message.from,
		to: message.to,
		content: message.content,
		timestamp: Date.now()
	});

	console.log('Sent message:', messageData);

	manager.sendTo(message.to, messageData);

	// Also send confirmation back to sender
	ws.send(JSON.stringify({
		type: "message_sent",
		to: message.to,
		content: message.content,
		timestamp: Date.now()
	}));
}

async function forwardFriendRequest(message: WebSocketMessage, ws: any, manager: ConnectionManager) {
	if (await isBlocked(message.to, message.from)) {
		ws.send(JSON.stringify({
			type: "error",
			message: "This user has blocked you"
		}));
		return;
	}

	if (!manager.isConnected(message.to)) {
		console.log(`User ${message.to} is not connected to receive notification`);
		return;
	}

	const notification = {
		type: message.type,
		from: message.from,
		timestamp: Date.now()
	}

	manager.sendNotificationTo(message.to, notification);
}

async function forwardGameAndTournamentInvite(message: WebSocketMessage, ws: any, manager: ConnectionManager) {
	if (await isBlocked(message.to, message.from)) {
		ws.send(JSON.stringify({
			type: "error",
			message: "This user has blocked you"
		}));
		return;
	}

	if (!manager.isConnected(message.to)) {
		console.log(`User ${message.to} is not connected to receive notification`);
		return;
	}

	const notification = {
		type: message.type,
		from: message.from,
		content: message.content,
		timestamp: Date.now()
	}

	manager.sendNotificationTo(message.to, notification);
}