import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from "bcrypt";
import { dbPromise, getUserById } from './services/db.service';
import { generate2FASecret } from './2fa';
import { JwtUserPayload, sign2FAChallengeJwt } from './services/jwt.service';


const ROUNDS = 10;




export async function createUser(db: any, username: string , password: string, twoFa: boolean) {
	try {
		const check = await checkInfos(username, password);
		if (check) {
			console.log("[ERROR]: checkInfos failed: ", check); return;
		}
		
		const hashedPassword = await bcrypt.hash(password, ROUNDS);
		const createdAt = new Date().toISOString();

		const result = await db.run(
			"INSERT INTO users (username, hashedPassword, createdAt, twofa) VALUES (?, ?, ?, ?)",
			username.trim(),
			hashedPassword,
			createdAt,
			twoFa
		);
	
		if (!result)
			throw new Error("Failed to create user");
		
		return result;
	}
	catch (error) {
		console.error("[ERROR]: createUser failed: ", error);
		return null;
	}
}



// ========== Utils functions: connection ==========
async function checkInfos(username: string, password: string) : Promise<string> {
	if (!username || !password )
		return ("Missing information (username, password)");
	
	if (username.length < 3 || username.length > 254)
		return ("Username should be between 3 and 254 characters ");

	// Allow email addresses or regular usernames (letters, numbers, underscores, dashes, @, .)
	if (!/^[a-zA-Z0-9_\-.@]{3,254}$/.test(username))
    	return ("Username can only contain letters, numbers, underscores (_), dashes (-), dots (.), and @ symbol.");

	if (password.length < 8) {
		return ("Password should have 8 characters or more "); 
	}
	return (null as any);
}



// ========== 2FA Challenge ==========
export async function start2FAChallenge(db: any, userId: number) {
	try {
		const userRow = await getUserById(db, userId);
		if (!userRow) { console.log("[ERROR]: Can get the User datas"); return; }
		
		const basePayload: JwtUserPayload = {
			userId: userRow.id,
			username: userRow.username
		};
		
		let qrCodeImageUrl: string;
		if (userRow?.qrCodeUrl) {
			qrCodeImageUrl = userRow.qrCodeUrl;
		} else {
			const result = await generate2FASecret(userRow, db);
			if (!result?.qrCodeImageUrl) { console.log("[ERROR]: QrCodeUrl do not exist"); return; }
			qrCodeImageUrl = result.qrCodeImageUrl;
		}
		
		const challengeToken = sign2FAChallengeJwt(basePayload);
		
		return {challengeToken, qrCodeUrl: qrCodeImageUrl};
	}
	catch (error) {
		console.error("[ERROR]: start2FAChallenge error: ", error);
		return null;
	}
}





