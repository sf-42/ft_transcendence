import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from 'dotenv';
import fs from 'fs';

export interface Game 
{
  id: number;
  createdAt: string;
  updatedAt: string;
  powerups: number;
  player1: string | null;
  player2: string | null;
  tournamentId: number | null;
}

/* 
  Tournament bracket: Map<number, Game[]> / Round[] => round: Game[]
*/

export interface Tournament
{
  id: number;
  maxPlayers: number; // (4 or 8)
  status: 'pending' | 'in_progress' | 'finished';
  currentRound: number;
  powerUps: boolean;
  creator: number;
  players: string;
  bracket: string;
  winnerId: number | null;
  
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

config();
const DB_MATCHMAKING_SERVICE_PATH = process.env.DB_MATCHMAKING_SERVICE_PATH;


export async function initDatabase() {
  const dbDir = path.dirname(DB_MATCHMAKING_SERVICE_PATH!);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = await open({
    filename: DB_MATCHMAKING_SERVICE_PATH!,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      powerups INTEGER NOT NULL DEFAULT 0 CHECK (powerups IN (0,1)),
      player1 TEXT DEFAULT NULL,
      player2 TEXT DEFAULT NULL,
      tournamentId INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maxPlayers INTEGER NOT NULL CHECK (maxPlayers IN (4, 8)),
      powerUps INTEGER NOT NULL DEFAULT 0 CHECK (powerUps IN (0,1)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'finished')),
      currentRound INTEGER NOT NULL DEFAULT 0,
      winnerId INTEGER DEFAULT NULL,
      bracket TEXT NOT NULL DEFAULT '{}',
      players TEXT NOT NULL DEFAULT '[]',
	  creator INTEGER DEFAULT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completedAt TEXT DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_status ON tournaments(status);
  `);

  console.log("[INFO]: matchmaking-service database initialized");
  return db;
}

export const dbPromise = initDatabase();

export async function createGame(db: Database, powerups: number, player1: string, tournamentId?: number): Promise<Game> 
{
  const now = new Date().toISOString();
  const tournament = tournamentId === undefined ? null : tournamentId;
  console.log("Lauching sql request to db to create a game");
  const row = await db.run(
      'INSERT INTO games (createdAt, updatedAt, powerups, player1, player2, tournamentId) VALUES (?, ?, ?, ?, ?, ?) ' ,
      now, now, powerups, player1, null, tournament
  );
  const Game: Game = {
      id: row.lastID!,
      createdAt: now,
      updatedAt: now,
      powerups : powerups,
      player1: player1,
      player2: null,
      tournamentId: tournamentId || null
  };
  console.log("[INFO]: Created new Game in matchmaking-service:", Game);
  return Game;
}

// ----------- GAMES FUNCTIONS -----------

export async function getGameById(db: any, id: number): Promise<Game | null> {
	try {
		const updated = await db.get('SELECT id, createdAt, updatedAt, powerups, player1, player2, tournamentId FROM games WHERE id = ?', [id]);
		console.log("[INFO]: getting game:", updated);
    return updated ? (updated as Game) : null;
	}
	catch (error) {
		console.error('[ERROR]: getGameById failed:', error);
		return null;
	}
}

export async function JoinGame(db: any, id : number, player2: string): Promise<Game | null>
{
  try
  {
    const now = new Date().toISOString();
    const updated = await db.run(
      'UPDATE games SET player2 = ?, updatedAt = ? WHERE id = ?;', player2, now, id
    );
    return updated ? (updated as Game) : null;
  }
  catch (error)
  {
    console.error('[ERROR]: JoinGame failed:', error);
    return null;
  }
}

export async function LeaveGame(db: any, id: number, player: 1 | 2) : Promise<Game | null>
{
  try
  {
    const now = new Date().toISOString();
    const playerentry : string = 'player' + player.toString();
    const updated = await db.run(
      `UPDATE games SET ${playerentry} = ?, updatedAt = ? WHERE id = ?;`, null, now, id
    );
    const row = await db.get('SELECT id, createdAt, updatedAt, powerups, player1, player2, tournamentId FROM games WHERE id = ?', [id]);
    if (row.player1 === null && row.player2 === null)
    {
      const b : boolean = await destroyGame(db, id);
      if (b)
        return row as Game;
      return null;
    }
    return updated as Game;
  }
  catch (error)
  {
    console.error('[ERROR]: LeaveGame failed:', error);
    return null;
  }
}

export async function destroyGame(db: any, id: number) : Promise<boolean>
{
  try
  {
    await db.run('DELETE FROM games WHERE id = ?', [id]);
    return true;
  }
  catch (error)
  {
    console.error('[ERROR]: Destroy game failed:', error);
    return false;
  }
}

export async function isPlayerInGame(db:any, playerid: string) : Promise<number | 0>
{
  try
  {
    const row = await db.get(`SELECT * from games WHERE player1 = $playerid OR player2 = $playerid LIMIT 1`, {$playerid : playerid});
    if (!row) 
      return 0;
    return row.id;
  }
  catch (error)
  {
    console.error('[ERROR]: isPlayerInGame failed:', error);
    return 0;
  }
}

// ----------- TOURNAMENTS FUNCTIONS -----------

export async function createTournament(db: Database, maxPlayers: number, powerUps: boolean, creatorID: number): Promise<Tournament | null> {
  try {
    const now = new Date().toISOString();
    const powerUpsInt = powerUps ? 1 : 0;
    const initialPlayers = JSON.stringify([creatorID]);
    
    const result = await db.run(
      `INSERT INTO tournaments (maxPlayers, powerUps, currentRound, bracket, players, creator, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      maxPlayers, powerUpsInt, 0, '{}', initialPlayers, creatorID, now, now
    );
    
    const tournament: Tournament = {
      id: result.lastID! ,
      powerUps,
      maxPlayers,
      status: 'pending',
      winnerId: null,
      currentRound: 0,
      bracket: '{}',
      players: initialPlayers,
	  creator: creatorID,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    
    console. log("[INFO]: Created new tournament in matchmaking-service:", tournament);
    return tournament;
  } catch (error) {
    console. error('[ERROR]: createTournament failed:', error);
    return null;
  }
}


export async function getTournamentById(db: any, id: number): Promise<Tournament | null> {
	try {
		const row = await db.get('SELECT id, maxPlayers, powerUps, status, winnerId, currentRound, bracket, players, creator, createdAt, updatedAt, completedAt FROM tournaments WHERE id = ?', [id]);
    
    if (!row)
      return null;
    
    const tournament: Tournament = {
      ... row,
      powerUps: row.powerUps === 1
    };
    
    console.log("[INFO]: getting tournament:", row);
    return tournament;
	}
	catch (error) {
		console.error('[ERROR]: getTournamentById failed:', error);
		return null;
	}
}

// Maybe change return values to correctly inform client
export async function addPlayerToTournament(db: Database, tournamentId: number, playerId: number): Promise<Tournament | null> {
  try {
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) {
      console.error('[ERROR]: tournament not found');
      return null;
    }

    const players: number[] = JSON.parse(tournament.players);

    if (players.includes(playerId)) {
      console.error('[ERROR]: player already in tournament');
      return null;
    }

    if (tournament.status !== 'pending') {
      console.error('[ERROR]: Cannot join a tournament that already started');
      return null;
    }
    
    if (players.length >= tournament.maxPlayers) {
      console.error('[ERROR]: tournament full');
      return null;
    }

    players.push(playerId);
    const updatedPlayers = JSON.stringify(players);

    const now = new Date().toISOString();
    await db.run('UPDATE tournaments SET players = ?, updatedAt = ? WHERE id = ?',
      updatedPlayers, now, tournamentId);
    
    const updatedTournament: Tournament = {
      ...tournament,
      players: updatedPlayers,
      updatedAt: now
    };

    console.log(`[INFO]: Added player ${playerId} to tournament ${tournamentId}`);
    return updatedTournament;
  } catch (error) {
    console.error('[ERROR]: addPlayerToTournament failed:', error);
    return null;
  }
}

export async function removePlayerFromTournament(db: Database, tournamentId: number, playerId: number): Promise<Tournament | null> {
  try {
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) {
      console.error('[ERROR]: Tournament not found');
      return null;
    }

    if (tournament.status !== 'pending') {
      console.error('[ERROR]: Cannot remove players from a tournament that has already started');
      return null;
    }

    const players: number[] = JSON.parse(tournament.players);

    const playerIndex = players.indexOf(playerId);
    if (playerIndex === -1) {
      console. error('[ERROR]: Player not found in tournament');
      return null;
    }

    players.splice(playerIndex, 1);
    const updatedPlayers = JSON.stringify(players);

    const now = new Date(). toISOString();
    await db.run(
      'UPDATE tournaments SET players = ?, updatedAt = ? WHERE id = ?',
      updatedPlayers, now, tournamentId
    );

    if (players. length === 0) {
      console.log(`[INFO]: Tournament ${tournamentId} has no players left`);
      await destroyTournament(db, tournamentId);
    }

    const updatedTournament: Tournament = {
      ...tournament,
      players: updatedPlayers,
      updatedAt: now
    };

    console.log(`[INFO]: Removed player ${playerId} from tournament ${tournamentId}`);
    return updatedTournament;
  } catch (error) {
    console.error('[ERROR]: removePlayerFromTournament failed:', error);
    return null;
  }
}

export async function getTournamentPlayers(db: Database, tournamentId: number): Promise<number[] | null> {
  try {
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) {
      console.error('[ERROR]: tournament not found');
      return null;
    }

    const players: number[] = JSON.parse(tournament.players);
    console.log(`[INFO]: Tournament ${tournamentId} has ${players.length} players:`, players);
    return players;
  } catch (error) {
    console.error('[ERROR]: getTournamentPlayers failed:', error);
    return null;
  }
}

export async function isTournamentFull(db:Database, id: number): Promise<boolean> {
  try {
    const tournament = await getTournamentById(db, id);
    if (!tournament)
      return false;

    const players: number[] = JSON.parse(tournament.players);
    return players.length >= tournament.maxPlayers;
  } catch (error) {
    console.error('[ERROR]: isTournamentFull failed:', error);
    return false;
  }
}

export async function destroyTournament(db: Database, id: number, force: boolean = false): Promise<boolean> {
  try {
    if (!force) {
      const tournament = await getTournamentById(db, id);

      if (!tournament) {
        console.error('[ERROR]: could not get tournament');
        return false;
      }

      if (tournament.status !== 'pending') {
        console.error('[ERROR]: Cannot destroy a tournament that has started or finished');
        return false;
      }
    }

    await db.run('DELETE FROM tournaments WHERE id = ?', [id]);
    console.log(`[INFO]: Tournament ${id} destroyed successfully`);
    return true;
  } catch (error) {
    console.error('[ERROR]: destroyTournament failed:', error);
    return false;
  }
}

export async function getAvailableTournaments(db: Database): Promise<Tournament[] | null> {
  try {
    const rows = await db.all(
      `SELECT id, maxPlayers, powerUps, status, winnerId, currentRound, bracket, players, creator, createdAt, updatedAt, completedAt 
       FROM tournaments 
       WHERE status = 'pending' 
       ORDER BY createdAt DESC`
    );

    if (!rows || rows.length === 0)
      return [];

    const availableTournaments: Tournament[] = [];

    for (const row of rows) {
      const players: number[] = JSON.parse(row.players);

      if (players.length < row.maxPlayers) {
        availableTournaments.push({
          ...row,
          powerUps: row.powerUps === 1
        });
      }
    }

    console.log(`[INFO]: Found ${availableTournaments.length} available tournaments out of ${rows.length} pending`);
    return availableTournaments;
  } catch (error) {
    console.error('[ERROR]: getAvailableTournaments failed:', error);
    return null;
  }
}
export async function updateTournamentBracket(db: Database, tournamentId: number, bracket : number[][][]): Promise<boolean>
{
  try
  {
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) 
    {
      console.error('[ERROR]: Tournament not found');
      return false;
    }
    const resjson = JSON.stringify(bracket);
    const now = new Date().toISOString();
    await db.run('UPDATE tournaments SET bracket = ?, updatedAt = ? WHERE id = ?', resjson, now, tournamentId);
    return true;
  }
  catch (error)
  {
    console.error('[ERROR]: updateTournamentBracket failed:', error);
    return false;
  }
}

export async function updateTournamentStatus(db: Database, tournamentId: number, status: 'pending' | 'in_progress' | 'finished'): Promise<boolean> {
  try
  {
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) 
    {
      console.error('[ERROR]: Tournament not found');
      return false;
    }
    const now = new Date().toISOString();
    await db.run('UPDATE tournaments SET status = ?, updatedAt = ? WHERE id = ?', status, now, tournamentId);
    return true;
  }
  catch (error)
  {
    console.error('[ERROR]: updateTournamentBracket failed:', error);
    return false;
  }
}
