import Database from "better-sqlite3";
import path from "path";

interface Friendship {
	id: number;
	user1_id: number;
	user2_id: number;
	sender: number;
	status: "pending" | "accepted" | "declined";
	created_at: string;
}

let db: Database.Database;

export async function initDatabase() {
	const dbPath = path.join(__dirname, "../database", "chat-database.db");
	db = new Database(dbPath);
	db.pragma("foreign_keys = ON");
	db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES users (id),
      FOREIGN KEY (blocked_id) REFERENCES users (id)
    );
    CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        sender INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK(user1_id < user2_id),
        UNIQUE(user1_id, user2_id),
        FOREIGN KEY (user1_id) REFERENCES users (id),
        FOREIGN KEY (user2_id) REFERENCES users (id)
    );
  `);

	console.log('[INFO]: database initialized');
	// await seedTestUsers(db);
}

// Create test users
// async function seedTestUsers(db: Database): Promise<void> {
// 	try {
// 		const testers: Array<{ id: number }> = [
// 			{ id: 1 },
// 			{ id: 2 },
// 			{ id: 3 },
// 			{ id: 4 },
// 		];

// 		const selectStmt = db.prepare('SELECT id FROM users WHERE id = ? ');

// 		for (const t of testers) {
// 			const existing = selectStmt.get(t.id);
// 			if (!existing) {
// 				await createUser(t.id);
// 			}
// 		}

// 		const friendships = [
// 			{ user1: 1, user2: 2 }, // User 1 ↔ User 2
// 			{ user1: 1, user2: 3 }, // User 1 ↔ User 3
// 			{ user1: 1, user2: 4 }, // User 1 ↔ User 4
// 			{ user1: 2, user2: 3 }, // User 2 ↔ User 3
// 			{ user1: 2, user2: 4 }, // User 2 ↔ User 4
// 			{ user1: 3, user2: 4 }, // User 3 ↔ User 4
// 		];

// 		const checkFriendshipStmt = db.prepare(
// 			'SELECT id FROM friendships WHERE user1_id = ? AND user2_id = ?'
// 		);
//         const insertFriendshipStmt = db. prepare(`
//             INSERT INTO friendships (user1_id, user2_id, sender, status) 
//             VALUES (?, ?, ?, 'accepted')
//         `);

// 		for (const friendship of friendships) {
// 			const existing = checkFriendshipStmt.get(friendship.user1, friendship.user2);
// 			if (!existing) {
// 				insertFriendshipStmt.run(
// 					friendship.user1,
// 					friendship.user2,
// 					friendship.user1 // sender is user1
// 				);
// 				console.log(`[INFO]: Created friendship between User ${friendship.user1} and User ${friendship.user2}`);
// 			}
// 		}
// 	} catch (e) {
// 		console.error('[WARN]: seedTestUsers failed:', e);
// 	}
// }

export async function block(blocker_id: number, blocked_id: number): Promise<number> {
	try {
		const stmt = db.prepare(`
			INSERT INTO blocks (blocker_id, blocked_id)
			SELECT ?, ?
			WHERE NOT EXISTS (
				SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?
      )
    `);
		const result = stmt.run(blocker_id, blocked_id, blocker_id, blocked_id);
		if (result.changes > 0) {
			console.log(
				`Block inserted successfully. Rows affected: ${result.changes}`,
			);
			return 201;
		} else {
			console.log(
				"Block between these users already exists (user1/user2 check).",
			);
			return 409;
		}
	} catch (error: any) {
		if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
			console.log("Block already exists (unique constraint).");
			return 409;
		}
		console.error("Insert block error:", error);
		throw error;
	}
}

export async function unblock(blocker_id: number, blocked_id: number): Promise<number> {
	try {
		const stmt = db.prepare(`
      DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?
    `);
		const result = stmt.run(blocker_id, blocked_id);
		if (result.changes > 0) {
			console.log(
				`Block deleted successfully. Rows affected: ${result.changes}`,
			);
			return 204;
		} else {
			console.log(
				`Block not deleted. Resource not found blocker_id: ${blocker_id}, blocked_id ${blocked_id}`,
			);
			return 404;
		}
	} catch (error) {
		console.error("Unblock error:", error);
		throw error;
	}
}

export async function getFriends(me: number): Promise<number[]> {
	try {
		const stmt = db.prepare(`
			SELECT DISTINCT 
				CASE 
				WHEN user1_id = ? THEN user2_id 
				ELSE user1_id 
				END AS friend_id
			FROM friendships
			WHERE (user1_id = ? OR user2_id = ?) AND status = 'accepted'
				AND friend_id NOT IN (
				SELECT blocked_id FROM blocks WHERE blocker_id = ?
				UNION
				SELECT blocker_id FROM blocks WHERE blocked_id = ?
			)
    `);
		const result = stmt
			.all(me, me, me, me, me)
			.map((row: any) => row.friend_id);
		return result;
	} catch (error) {
		console.error("Get friends error:", error);
		throw error;
	}
}

export async function getBlocked(me: number): Promise<number[]> {
	try {
		const stmt = db.prepare(`
     		SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?
    `);
		const result = stmt.all(me).map((row: any) => row.id);
		return result;
	} catch (error) {
		console.error("Get blocked error:", error);
		throw error;
	}
}

export async function addFriend(me: number, friend: number): Promise<number> {
	const user1 = Math.min(me, friend);
	const user2 = Math.max(me, friend);
	try {
		const checkStmt = db.prepare(`SELECT id FROM friendships WHERE user1_id = ? AND user2_id = ? AND (status = 'pending' OR status = 'accepted')`);
		const existing = checkStmt.get(user1, user2);
		if (existing) {
			console.error("A pending or friendship invite already exists");
			return 409;
		}
		const stmt = db.prepare(`
    		INSERT INTO friendships (user1_id, user2_id, sender, status) VALUES (?, ?, ?, 'pending')
    `);
		const result = stmt.run(user1, user2, me);
		if (result.changes > 0) {
			console.log("Successfully sending the friendship invite");
			return 200;
		} else {
			console.log("The friendship invite has already been sent or exists");
			return 409;
		}
	} catch (error) {
		console.error("Add Frienship error:", error);
		throw error;
	}
}

export async function deleteFriendship(me: number, friend: number): Promise<number> {
	const user1 = Math.min(me, friend);
	const user2 = Math.max(me, friend);

	try {
		const stmt = db.prepare(
			`DELETE FROM friendships WHERE user1_id = ? AND user2_id = ?`,
		);
		const result = stmt.run(user1, user2);
		if (result.changes > 0) {
			console.log(
				`deletefriendship successfully me: ${me}, old friend: ${friend}`,
			);
			return 204;
		} else {
			console.log(`Cannot delete friend me: ${me}, old friend: ${friend}`);
			return 404;
		}
	} catch (error) {
		console.error("delete friendship error:", error);
		throw error;
	}
}

export async function acceptOrDeclineFriendship(id: number, accept: boolean, user: number): Promise<number> {
	try {
		const stmt = db.prepare("SELECT * FROM friendships WHERE id = ?");
		const friendship = stmt.get(id) as Friendship | undefined;

		if (!friendship) {
			console.log("The friendship cannot find");
			return 404;
		}
		if (friendship.user1_id !== user && friendship.user2_id !== user) {
			console.log("Your are not allowed\n");
			return 403;
		}
		if (friendship.sender === user) {
			console.log("You are cannot the invite you sended\n");
			return 401;
		}
		if (friendship.status === "accepted") return 400;
		if (accept) {
			const stmt2 = db.prepare(
				"UPDATE friendships SET status = 'accepted' WHERE id = ?",
			);
			const res = stmt2.run(id);
			if (res.changes > 0) return 200;
			return 500;
		}
		const delRes = await deleteFriendship(friendship.user1_id, friendship.user2_id);
		return delRes;
	} catch (error) {
		console.error("Error in acceptOrDeclineFriendship:", error);
		return 500;
	}
}

export async function getUserById(userId: number) {
	try {
		const stmt = db.prepare(`
      SELECT id FROM users WHERE id = ?
    `);
		const result = stmt.get(userId);
		return result;
	} catch (error) {
		console.error("Get user error:", error);
		throw error;
	}
}

/**
 * Vérifier si deux utilisateurs sont amis (amitié acceptée)
 */
export async function areFriends(user1: number, user2: number): Promise<boolean> {
	try {
		const u1 = Math.min(user1, user2);
		const u2 = Math.max(user1, user2);

		const stmt = db.prepare(`
			SELECT 1 FROM friendships 
			WHERE user1_id = ? AND user2_id = ? AND status = 'accepted'
    `);
		const result = stmt.get(u1, u2);
		return !!result;
	} catch (error) {
		console.error("areFriends error:", error);
		throw error;
	}
}

/**
 * Vérifier si user1 a bloqué user2
 */
export async function isBlocked(blocker: number, blocked: number): Promise<boolean> {
	try {
		const stmt = db.prepare(`
      SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?
    `);
		const result = stmt.get(blocker, blocked);
		return !!result;
	} catch (error) {
		console.error("isBlocked error:", error);
		throw error;
	}
}

export async function createUser(id: number): Promise<boolean> {
	try {
		const stmt = await db.prepare('SELECT id FROM users WHERE id = ?');
		const row = stmt.get(id);

		if (row) {
			console.error('[ERROR]: user already created');
			return false;
		}

		const creation = await db.prepare('INSERT INTO users (id) VALUES (?)');
		await creation.run(id);
		// await db.run('INSERT INTO users (id) VALUES (?)', id);

		return true;
	} catch (error) {
		console.error('[ERROR]: createUser failed:', error);
		return false;
	}
}

export async function getPendingInvites(id: number)/* : Promise<> */ {
	try {
		const stmt = await db.prepare('SELECT * FROM friendships WHERE (user1_id = ? OR user2_id = ?) AND sender != ? AND status = ?');
		const result = await stmt.all(id, id, id, 'pending');

		// console.log("getPendingInvite result:", result);

		if (result.length === 0)
			return {};

		return Object.fromEntries(
			result.map(invite => [
				invite.sender.toString(),
				invite
			])
		);

		// return result;
	} catch (error) {
		console.error('[ERROR]: getPendingInvites failed:', error);
		throw (error);
	}
}

export async function deleteAllFriendship(id: number) {
	try {
		const stmt = await db.prepare('DELETE FROM friendships WHERE user1_id = ? OR user2_id = ?');
		await stmt.run(id, id);
		return true;
	} catch (error) {
		console.error('[ERROR]: deleteAllFriendship failed:', error);
		return false;
	}
}