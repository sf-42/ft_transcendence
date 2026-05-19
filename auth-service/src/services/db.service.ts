import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'node:fs';
import { User } from '../user.model';
import bcrypt from 'bcrypt';

const DB_PATH = process.env.SQLITE_DB_AUTH_PATH || path.join(__dirname, '..', '..', 'db', 'users.sqlite');


const ROUNDS = 10;

async function initializeDatabase() {
	console.log(`Database path: ${DB_PATH}`);

	fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
	
	const db = await open ({
		filename: DB_PATH,
		driver: sqlite3.Database
	});

	await db.exec('PRAGMA foreign_keys = ON;');
	console.log('SQLite foreign_keys ON');

	await db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			hashedPassword TEXT,
			email TEXT UNIQUE,
			createdAt TEXT NOT NULL,
			twofa_secret TEXT,
			twofa INTEGER DEFAULT 0,
			qrCodeUrl TEXT,
			oauth_provider TEXT,
			oauth_id TEXT,
			avatar TEXT,
			is_connected INTEGER DEFAULT 0
		);
	`);
	
	// Add columns if they don't exist (for existing databases)
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN email TEXT UNIQUE`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN oauth_provider TEXT`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN oauth_id TEXT`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN twofa INTEGER DEFAULT 0`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN twofa_secret TEXT`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN qrCodeUrl TEXT`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN is_connected INTEGER DEFAULT 0`);
	} catch (e) { /* Column already exists */ }
	try {
		await db.exec(`ALTER TABLE users ADD COLUMN last_seen INTEGER`);
	} catch (e) { /* Column already exists */ }

	// Seed default tester accounts (idempotent by username)
	// await seedAuthTestUsers(db);

	// Ensure no stale connection flags remain from a previous unclean shutdown.
	// If the DB was cut abruptly, some users may still have is_connected = 1
	// which would prevent new logins until manually reset. Reset them here.
	try {
		await resetAllConnectionStatus(db);
		console.log('[INFO]: Connection statuses reset to false on startup');
	} catch (e) {
		console.error('[WARN]: Could not reset connection statuses on startup', e);
	}

	console.log(`Database user initialized with success`);
	return db;
}

export const dbPromise = initializeDatabase();

// async function seedAuthTestUsers(db: any): Promise<void> {
// 	try {
// 		const testers = ['tester1', 'tester2', 'tester3', 'tester4'];
// 		const password = '12345678';
// 		const hashed = await bcrypt.hash(password, ROUNDS);
// 		const now = new Date().toISOString();

// 		for (const username of testers) {
// 			const exists = await db.get('SELECT id FROM users WHERE username = ?', [username]);
// 			if (!exists) {
// 				await db.run(
// 					'INSERT INTO users (username, hashedPassword, createdAt, twofa) VALUES (?, ?, ?, ?)',
// 					username, hashed, now, 0
// 				);
// 			}
// 		}
// 	} catch (e) {
// 		console.error('[WARN]: seedAuthTestUsers failed:', e);
// 	}
// }


// ----------- User Getters -----------

export async function getUserById(db: any, id: number): Promise<User | null> {
	try {
		const row = await db.get( 'SELECT id, username, createdAt, hashedPassword, twofa_secret, twofa  FROM users WHERE id = ?', [id]);
		return row ? (row as User) : null;
	}
	catch (error) {
		console.error('[ERROR]: getUserById failed:', error);
		return null;
	}
}

export async function findUser(db: any, username: string): Promise<User | null> {
	try {
		const row = await db.get( 'SELECT id, username, createdAt, hashedPassword FROM users WHERE username = ?', [username]);
		return (row ? (row as User) : null);
	}
	catch (error) {
		console.error("[ERROR]: findUser failed: ", error);
		return null;
	}
}

export async function getTwoFaById(db: any, userId: number): Promise<boolean> {
	try {
		const row = await db.get( 'SELECT twofa FROM users WHERE id = ?', [userId]);
		return row?.twofa === 1 || row?.twofa === true;
	}
	catch (err) {
		console.error("[ERROR]: getTwoFa failed: ", err);
		return false;
	}
}

export async function setTwoFaById(db: any, userId: number, twoFa: boolean) {
	try {
		await db.run('UPDATE users SET twofa = ? WHERE id = ?', [twoFa, userId]);
		return null;
	}
	catch (err) {
		console.error("[ERROR]: addTwoFaById failed: ", err);
		return null;
	}
}

export async function getDbPassword(db: any, userId: number) {
	try {
		const row = await db.get('SELECT hashedPassword FROM users WHERE id = ?', [userId]);
		return row?.hashedPassword || null;
	}
	catch (err) {
		console.error("[ERROR] get hashedPassword failed");
		throw (err);
	}
}

export async function changeDbPassword(db: any, userId: number, hashedPassword: string) {
	try {
		await db.run("UPDATE users SET hashedPassword = ? WHERE id = ?", [hashedPassword, userId]);
		return null;
	}
	catch (err) {
		console.error("[ERROR] chang password into db failed");
		throw (err);
	}
}

// ========== Connection Status Functions ==========

export async function getIsConnected(db: any, userId: number): Promise<boolean> {
	try {
		const row = await db.get('SELECT is_connected FROM users WHERE id = ?', [userId]);
		return row?.is_connected === 1;
	} catch (err) {
		console.error('[ERROR]: getIsConnected failed:', err);
		return false;
	}
}

export async function setIsConnected(db: any, userId: number, isConnected: boolean): Promise<boolean> {
	try {
		const now = Date.now();
		await db.run('UPDATE users SET is_connected = ?, last_seen = ? WHERE id = ?', [isConnected ? 1 : 0, now, userId]);
		console.log(`[INFO]: User ${userId} connection status set to ${isConnected}`);
		return true;
	} catch (err) {
		console.error('[ERROR]: setIsConnected failed:', err);
		return false;
	}
}

export async function resetAllConnectionStatus(db: any): Promise<void> {
	try {
		await db.run('UPDATE users SET is_connected = 0');
		console.log('[INFO]: All connection statuses reset to false');
	} catch (err) {
		console.error('[ERROR]: resetAllConnectionStatus failed:', err);
	}
}

// Cleanup stale connections (users marked as connected but not seen for > timeout)
export async function cleanupStaleConnections(db: any, timeoutMs: number = 60000): Promise<number> {
	try {
		const cutoff = Date.now() - timeoutMs;
		const result = await db.run(
			'UPDATE users SET is_connected = 0 WHERE is_connected = 1 AND (last_seen IS NULL OR last_seen < ?)',
			[cutoff]
		);
		const count = result.changes || 0;
		if (count > 0) {
			console.log(`[INFO]: Cleaned up ${count} stale connection(s)`);
		}
		return count;
	} catch (err) {
		console.error('[ERROR]: cleanupStaleConnections failed:', err);
		return 0;
	}
}

export async function removeUserFromDb(db: any, id: number, password: string, skip2FAPasswordCheck: boolean = false) {
	try {
		const user = await db.get("SELECT * FROM users WHERE id = ?", id);
		if (!user) {
			return { success: false, error: "User not found" };
		}
		
		// OAuth users don't have a password - they can delete without password verification
		if (user.oauth_provider) {
			await db.run("DELETE FROM users WHERE id = ?", id);
			return { success: true, message: "User deleted successfully" };
		}
		
		// If 2FA was verified, skip password check
		if (skip2FAPasswordCheck) {
			await db.run("DELETE FROM users WHERE id = ?", id);
			return { success: true, message: "User deleted successfully" };
		}
		
		// Regular user without 2FA - verify password
		if (!user.hashedPassword) {
			return { success: false, error: "Cannot verify password" };
		}
		
		const isValid = await bcrypt.compare(password, user.hashedPassword);
		if (!isValid) {
			return { success: false, error: "Invalid password" };
		}
		await db.run("DELETE FROM users WHERE id = ?", id);

		return { success: true, message: "User deleted successfully" };
	} catch (err) {
		console.error("Error removing user:", err);
		return { success: false, error: "Internal server error" };
	}
}