import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from 'dotenv';
import fs from 'fs';

export interface Stats {
    gamesPlayed: number;
    gamesWon: number;
    tournamentPlayed: number;
    tournamentWon: number;
}

export interface KeyBinds {
    left: string;
    right: string;
}

export interface User {
    id: number;
    username: string;
    createdAt: string;
    updatedAt: string;
    avatar: number;
    bike: number;
    stats: Stats;
    keyBinds: KeyBinds;
    currentGameID: number | null;
    currentTournamentID: number | null;
    profilePicture: string | null;
}

config();
const DB_USER_SERVICE_PATH = process.env.DB_USER_SERVICE_PATH;


export async function initDatabase() {
    const dbDir = path.dirname(DB_USER_SERVICE_PATH!);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = await open({
        filename: DB_USER_SERVICE_PATH!,
        driver: sqlite3.Database,
    });

    await db.exec('PRAGMA foreign_keys = ON;');
    console.log('SQLite foreign_keys ON');

    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      avatar INTEGER DEFAULT 0,
      bike INTEGER DEFAULT 2,
	  gamesPlayed INTEGER DEFAULT 0,
      gamesWon INTEGER DEFAULT 0,
      tournamentPlayed INTEGER DEFAULT 0,
      tournamentWon INTEGER DEFAULT 0,
	  left TEXT NOT NULL DEFAULT 'a',
	  right TEXT NOT NULL DEFAULT 'd',
      currentgameId INTEGER DEFAULT NULL,
      currentTournamentID INTEGER DEFAULT NULL,
      profilePicture TEXT DEFAULT NULL
    );
  `);

    console.log("[INFO]: user-service database initialized");
    // Seed default tester users on each start (idempotent: only creates if missing)
    // await seedTestUsers(db);
    return db;
}

export const dbPromise = initDatabase();

// ----------- Seed Test Users -----------

// async function seedTestUsers(db: Database): Promise<void> {
//     try {
//         const testers: Array<{ id: number; username: string, avatar: number, bike: number }> = [
//             { id: 1, username: 'tester1', avatar: 0, bike: 1 },
//             { id: 2, username: 'tester2', avatar: 1, bike: 2 },
//             { id: 3, username: 'tester3', avatar: 2, bike: 3 },
//             { id: 4, username: 'tester4', avatar: 3, bike: 4 },
//         ];

//         for (const t of testers) {
//             const existing = await db.get('SELECT id FROM users WHERE username = ?', [t.username]);
//             if (!existing) {
//                 await createUser(db, t.id, t.username);
//             }
//             await updateUser(db, t.id, { avatar: t.avatar, bike: t.bike });
//         }
//     } catch (e) {
//         console.error('[WARN]: seedTestUsers failed:', e);
//     }
// }

export async function createUser(db: Database, id: number, username: string): Promise<User> {
    const now = new Date().toISOString();
    const initialStats: Stats = {
        gamesPlayed: 0,
        gamesWon: 0,
        tournamentPlayed: 0,
        tournamentWon: 0
    };
    const initialKeyBinds: KeyBinds = {
        left: 'a',
        right: 'd',
    };

    console.log('Creating new user with id:', id);

    await db.run(
        'INSERT INTO users (id, username, createdAt, updatedAt, avatar, bike, gamesPlayed, gamesWon, tournamentPlayed, tournamentWon, left, right, currentGameID, currentTournamentID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, username, now, now, 0, 2, initialStats.gamesPlayed, initialStats.gamesWon, initialStats.tournamentPlayed, initialStats.tournamentWon, initialKeyBinds.left, initialKeyBinds.right, null, null
    );
    const user: User = {
        id,
        username,
        createdAt: now,
        updatedAt: now,
        avatar: 0,
        bike: 2,
        currentGameID: 0,
        stats: initialStats,
        keyBinds: initialKeyBinds,
        currentTournamentID: null,
        profilePicture: null
    };
    console.log("[INFO]: Created new user in user-service:", user);
    return user;
}

// ----------- User Getters -----------

export async function getUserById(db: any, id: number): Promise<User | null> {
    try {
        const row = await db.get('SELECT id, username, createdAt, updatedAt, avatar, bike, gamesPlayed, gamesWon, tournamentPlayed, tournamentWon, left, right, currentGameID, currentTournamentID, profilePicture FROM users WHERE id = ?', [id]);

        if (!row)
            return null;

        const user: User = {
            id: row.id,
            username: row.username,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            avatar: row.avatar,
            bike: row.bike,
            stats: {
                gamesPlayed: row.gamesPlayed || 0,
                gamesWon: row.gamesWon || 0,
                tournamentPlayed: row.tournamentPlayed || 0,
                tournamentWon: row.tournamentWon || 0
            },
            keyBinds: {
                left: row.left || 'a',
                right: row.right || 'd'
            },
            currentGameID: row.currentGameID || 0,
            currentTournamentID: row.currentTournamentID || null,
            profilePicture: row.profilePicture
        };

        // console.log("[INFO]: getting user:", user);
        return user;
    }
    catch (error) {
        console.error('[ERROR]: getUserById failed:', error);
        return null;
    }
}

export async function getUserByUsername(db: Database, username: string): Promise<User | null> {
    try {
        const row = await db.get('SELECT id, username, createdAt, updatedAt, avatar, bike, gamesPlayed, gamesWon, tournamentPlayed, tournamentWon, left, right, currentGameID, currentTournamentID, profilePicture FROM users WHERE username = ?', [username]);

        if (!row)
            return null;

        const user: User = {
            id: row.id,
            username: row.username,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            avatar: row.avatar,
            bike: row.bike,
            stats: {
                gamesPlayed: row.gamesPlayed || 0,
                gamesWon: row.gamesWon || 0,
                tournamentPlayed: row.tournamentPlayed || 0,
                tournamentWon: row.tournamentWon || 0
            },
            keyBinds: {
                left: row.left || 'a',
                right: row.right || 'd'
            },
            currentGameID: row.currentGameID || 0,
            currentTournamentID: row.currentTournamentID || null,
            profilePicture: row.profilePicture
        };

        return user;
    }
    catch (error) {
        console.error('[ERROR]: getUserByUsername failed:', error);
        return null;
    }
}

export async function getAllUsersStats(db: Database): Promise<Record<string, Stats>> {
    try {
        const users = await db.all<User[]>('SELECT * FROM users');

        return Object.fromEntries(
            users.map(user => [
                user.username,
                {
                    gamesPlayed: user.gamesPlayed,
                    gamesWon: user.gamesWon,
                    tournamentPlayed: user.tournamentPlayed,
                    tournamentWon: user.tournamentWon
                }
            ])
        );
    }
    catch (error) {
        console.error('[ERROR]: getAllUsersStats failed:', error);
        return {};
    }
}

// ----------- Update User -----------

export async function updateUser(db: Database, userId: number, params: Partial<User>): Promise<boolean> {
    try {
        const updates: string[] = [];
        const values: any[] = [];

        console.log(`Updating user ${userId}, params:`, params);

        if (params.avatar !== undefined) {
            updates.push('avatar = ?');
            values.push(params.avatar);
        }
        if (params.bike !== undefined) {
            updates.push('bike = ?');
            values.push(params.bike);
        }
        // if (params.currentGameID !== undefined) {
        //     updates.push('currentGameID = ?');
        //     values.push(params.currentGameID);
        // }
        // if (params.currentTournamentID !== undefined) {
        //     updates.push('currentTournamentID = ?');
        //     values.push(params.currentTournamentID);
        // }

        if (updates.length === 0)
            return false;

        updates.push('updatedAt = ?');
        values.push(new Date().toISOString());
        values.push(userId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.run(query, values);

        console.log(`[INFO]: Updated user ${userId}`);
        return true;
    } catch (error) {
        console.error('[ERROR]: updateUser failed:', error);
        return false;
    }
}

export async function updateUserStats(db: Database, userId: number, stats: Partial<Stats>): Promise<boolean> {
    try {
        const updates: string[] = [];
        const values: any[] = [];

        if (stats.gamesPlayed !== undefined) {
            updates.push('gamesPlayed = ?');
            values.push(stats.gamesPlayed);
        }
        if (stats.gamesWon !== undefined) {
            updates.push('gamesWon = ?');
            values.push(stats.gamesWon);
        }
        if (stats.tournamentPlayed !== undefined) {
            updates.push('tournamentPlayed = ?');
            values.push(stats.tournamentPlayed);
        }
        if (stats.tournamentWon !== undefined) {
            updates.push('tournamentWon = ?');
            values.push(stats.tournamentWon);
        }

        if (updates.length === 0)
            return false;

        updates.push('updatedAt = ?');
        values.push(new Date().toISOString());
        values.push(userId);


        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.run(query, values);

        console.log(`[INFO]: Updated stats for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[ERROR]: updateUserStats failed:', error);
        return false;
    }
}

export async function updateUserKeyBinds(db: Database, userId: number, keyBinds: Partial<KeyBinds>): Promise<boolean> {
    try {
        const updates: string[] = [];
        const values: any[] = [];

        if (keyBinds.left !== undefined) {
            updates.push('left = ?');
            values.push(keyBinds.left);
        }
        if (keyBinds.right !== undefined) {
            updates.push('right = ?');
            values.push(keyBinds.right);
        }

        if (updates.length === 0)
            return false;

        updates.push('updatedAt = ?');
        values.push(new Date().toISOString());
        values.push(userId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.run(query, values);

        console.log(`[INFO]: Updated keybinds for user ${userId}:`);
        return true;
    } catch (error) {
        console.error('[ERROR]: updateUserKeyBinds failed:', error);
        return false;
    }
}

export async function updateUsercurrentGame(db: Database, userId: number, gameid: number): Promise<boolean> {
    try {
        const values: any[] = [];
        values.push(new Date().toISOString());
        values.push(gameid);
        values.push(userId);

        const query = `UPDATE users SET updatedAt = ?, currentgameId = ? WHERE id = ?`;
        await db.run(query, values);

        console.log(`[INFO]: Updated currentgameId for user ${userId}`);
        return true;
    }
    catch (error) {
        console.error('[ERROR]: updateUsercurrentGame failed:', error);
        return false;
    }
}

export async function updateUserCurrentTournament(db: Database, userId: number, tournamentId: number): Promise<boolean> {
    try {
        const values: any[] = [];
        values.push(new Date().toISOString());
        values.push(tournamentId);
        values.push(userId);

        const query = `UPDATE users SET updatedAt = ?, currentTournamentID = ? WHERE id = ?`;
        await db.run(query, values);

        console.log(`[INFO]: Updated currentTournamentID for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[ERROR]: updateUserCurrentTournament failed:', error);
        return false;
    }
}


export async function addResult(db: Database, userId: number, type: string, win: boolean): Promise<boolean> {
    try {
        const updates: string[] = [];

        if (type === "game") {
            updates.push('gamesPlayed = gamesPlayed + 1');
            if (win === true)
                updates.push('gamesWon = gamesWon + 1');
        }
        else if (type === "tournament") {
            updates.push('tournamentPlayed = tournamentPlayed + 1');
            if (win === true)
                updates.push('tournamentWon = tournamentWon + 1');
        }
        else {
            console.error('[ERROR]: unknown type in addResult:', type);
            return (false);
        }

        const query = `UPDATE users SET ${updates.join(', ')}, updatedAt = ? WHERE id = ?`;
        await db.run(query, [new Date().toISOString(), userId]);

        console.log(`[INFO]: incremented ${type}Played ${win ? 'and ' + type + 'Won' : ''} for user ${userId}`);
        return (true);
    } catch (error) {
        console.error('[ERROR]: addResult failed:', error);
        return (false);
    }
}

export async function deleteUser(db: Database, userId: number) {
    try {
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
        console.log(`[INFO]: Deleted user ${userId}`);
        return (true);
    } catch (error) {
        console.error('[ERROR]: deleteUser failed:', error);
        return (false);
    }
}

export async function updateProfilePicture(db: Database, userId: number, profilePictureUrl: string): Promise<boolean> {
    try {
        await db.run('UPDATE users SET profilePicture = ? WHERE id = ?', [profilePictureUrl, userId]);
        console.log(`[INFO]: Updated profilePictureUrl for user ${userId}:`, profilePictureUrl);
        return (true);
    } catch (error) {
        console.error('[ERROR]: updateProfilePicture failed:', error);
        return (false);
    }
}

export async function deleteProfilePicture(db: Database, userId: number): Promise<boolean> {
    try {
        await db.run('UPDATE users SET profilePicture = NULL WHERE id = ?', [userId]);
        console.log(`[INFO]: Delete profilePictureUrl for user ${userId}`);
        return (true);
    } catch (error) {
        console.error('[ERROR]: Delete ProfilePicture failed:', error);
        return (false);
    }
}   