import { Player } from "../classes/Player";
import { setBinds } from "../main.ts";
import type { KeyBinds } from "../classes/KeyBinds.ts";
import http from "./http.ts";


export interface Stats {
	gamesPlayed: number;
	gamesWon: number;
	tournamentPlayed: number;
	tournamentWon: number;
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
	// status?: 'ONLINE' | 'OFFLINE';
}

export async function getToken(): Promise<string | null> {
	let token: string | null = null;

	const cookies = document.cookie.split(';');
	const tokenCookie = cookies.find(cookie =>
		cookie.trim().startsWith('access_token=')
	);
	if (tokenCookie) {
		token = tokenCookie.split('=')[1];
		return token;
	}
	else {
		try {
			const res = await http.get("/auth/token");
			token = res.data?.access_token;
		} catch (error) {
			if ((error as any).message)
				console.error("Failed to get token from /auth/token:", (error as any).message);
			else
				console.error("Failed to get token from /auth/token:", error);
		}
	}

	return token;
}

export async function getUserById(id: number, setKeyBinds: boolean = false): Promise<User | null> {
	try {
		const response = await http.get(`/users/${id}`, {});
		const result = response.data;
		const username: string = result.username;
		const accountid: number = result.id;
		let skinID: number, bikeID: number;
		if (result.avatar !== undefined && result.avatar !== null)
			skinID = result.avatar;
		else
			skinID = 2;
		if (result.bike !== undefined && result.bike !== null)
			bikeID = result.bike;
		else
			bikeID = 3;
		if (setKeyBinds === true) {
			setBinds(result.keyBinds);
		}
		const user: User = 
		{
			id: accountid,
			username,
			createdAt: result.createdAt ?? new Date().toISOString(),
			updatedAt: result.updatedAt ?? new Date().toISOString(),
			avatar: skinID,
			bike: bikeID,
			stats: result.stats ?? { gamesPlayed: 0, gamesWon: 0, tournamentPlayed: 0, tournamentWon: 0 },
			keyBinds: result.keyBinds ?? { left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' },
			currentGameID: result.currentGameID ?? 0,
			currentTournamentID: result.currentTournamentID ?? null,
			profilePicture: result.profilePicture
		};
		return (user);
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting user by id:', (error as any).message);
		else
			console.error('Error while getting user by id:', error);
		return (null);
	}
}

export async function getUser(setKeyBinds: boolean = false): Promise<Player | null> {
	try {
		const response = await http.get('/users/me', {});

		const result = response.data;

		const username = result.username;
		if (!username)
			throw new Error("Empty response.");
		let skinID: number, bikeID: number;
		if (result.avatar !== undefined && result.avatar !== null)
			skinID = result.avatar;
		else
			skinID = 2;
		if (result.bike !== undefined && result.bike !== null)
			bikeID = result.bike;
		else
			bikeID = 3;

		if (setKeyBinds === true)
			setBinds(result.keyBinds);

		return (new Player(result.id, skinID, bikeID, username));
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting connected user:', (error as any).message);
		else
			console.error('Error while getting connected user:', error);
		return (null);
	}
}

export async function getUserByUsername(username: string): Promise<User | null> {
	try {
		const response = await http.get(`/users/search?username=${username}`, {});

		const result = response.data;

		return (result as User);
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting user by username:', (error as any).message);
		else
			console.error('Error while getting user by username:', error);
		return (null);
	}
}

export async function getConnectedUserID(): Promise<number | null> {
	try {
		const response = await http.get('/users/me', {});

		const result = response.data;
		return result.id;
	} catch (error) {
		if ((error as any).message)
			console.error('Error while getting connected user id:', (error as any).message);
		else
			console.error('Error while getting connected user id:', error);
		return null;
	}
}

export async function getUsernameByID(id: number): Promise<string | undefined> {
	try {
		const response = await http.get(`/users/${id}`, {});

		const result = response.data;
		return result.username;
	} catch (error) {
		if ((error as any).message)
			console.error('Error while getting username by id:', (error as any).message);
		else
			console.error('Error while getting username by id:', error);
		return undefined;
	}
}

export async function getUserStatsByID(id: number): Promise<Stats | null> {
	try {
		const response = await http.get(`/users/${id}`, {});

		const result = response.data;
		return (result.stats as Stats);
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting stats by id:', (error as any).message);
		else
			console.error('Error while getting stats by id:', error);
		return (null);
	}
}

export async function getStatsByUsername(username: string): Promise<Stats | null> {
	try {
		const response = await http.get(`/users/search?username=${username}`, {});

		const result = response.data;

		return (result.stats as Stats);
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting stats by username:', (error as any).message);
		else
			console.error('Error while getting stats by username:', error);
		return (null);
	}
}

export async function getUserStats(): Promise<Stats | null> {
	try {
		const response = await http.get(`/users/me`, {});

		const result = response.data;

		return (result.stats as Stats);
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting connected user stats:', (error as any).message);
		else
			console.error('Error while getting connected user stats:', error);
		return (null);
	}
}

export async function updateUser(params: Partial<User>): Promise<boolean> {
	try {
		const response = await http.put(`/users/me`, { params }, {
		});
		return response.data.success;
	} catch (error) {
		if ((error as any).message)
			console.error('Error while updating user:', (error as any).message);
		else
			console.error('Error while updating user:', error);
		return false;
	}
}

export async function getAllStats(): Promise<Record<string, Stats> | null> {
	try {
		const response = await http.get(`/users/stats`, {});
		return response.data;
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting every stats:', (error as any).message);
		else
			console.error('Error while getting every stats:', error);
		return (null);
	}
}


export async function isPlayerInGame(playerid: number): Promise<number | 0> {
	try {
		const response = await http.get(`/matchmaking/isingame?playerid=${encodeURIComponent(playerid)}`, {});
		return response.data;
	}
	catch (error) {
		if ((error as any).message)
			console.error('Error while getting current user game:', (error as any).message);
		else
			console.error('Error while getting current user game:', error);
		return (0);
	}
}

export async function getCurrentTournament(): Promise<number | null> {
	try {
		const response = await http.get('/users/me', {});

		const result = response.data;

		return (result.currentTournamentID || null);
	} catch (error) {
		if ((error as any).message)
			console.error('Error while getting current user tournament:', (error as any).message);
		else
			console.error('Error while getting current user tournament:', error);
		return null;
	}
}
