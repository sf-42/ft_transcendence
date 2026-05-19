import { AuthManager } from "./AuthManager";
import http from "../utils/http.ts";
import { setPlayer, socialOverlay, navigateTo, player, setCurrentTournament } from "../main.ts";
import { getUser, getCurrentTournament, isPlayerInGame } from "./usersManagement.ts";
import { Tournament } from "../classes/Tournament.ts";
import { Game } from "../classes/Game.ts";


export async function show2faStep(qrCodeUrl: string) {
	// Hide login form if exists (login page)
	const loginForm = document.getElementById("login-form") as HTMLElement;
	if (loginForm) loginForm.classList.add("hidden");
	
	// Hide signup form container if exists (signup page)
	const signupFormContainer = document.getElementById("signup-form-container") as HTMLElement;
	if (signupFormContainer) signupFormContainer.classList.add("hidden");

	// Hide OAuth Buttons
	const OAuthButtons = document.getElementById('OAuthButtons');
	if (OAuthButtons) OAuthButtons.classList.add('hidden');
	
	// Show 2FA container
	const twofa = document.getElementById("twofa-container")!;
	twofa.classList.remove("hidden");
}

export async function handle2faVerify(challengeToken: string) {
	if (challengeToken === '') {
		return AuthManager.showMessage("challengeToken is missing", "error");
	}
	const code = (document.getElementById("twofa-code") as HTMLInputElement).value.trim();
	if (code.length !== 6)
		return AuthManager.showMessage("Enter a valid 6-digit code", "error");

	try {
		const res = await http.post("/auth/2fa/verify", {
			twoFaCode: code,
			challengeToken: challengeToken,
		});

		const data = res.data;
		if (!data.success)
			return AuthManager.showMessage(data.error || "Invalid 2FA code", "error");

		AuthManager.showMessage("2FA verification successful!", "success");
		
		const user = await getUser(true);
		if (user) {
			setPlayer(user);
			socialOverlay.initializeChat();
			const tournamentId = await getCurrentTournament();
			let gameId: number = 0;
			if (player)
				gameId = await isPlayerInGame(player.getAccountID());
			if (gameId !== 0)
				await Game.rejoinGame(gameId);
			else if (tournamentId !== null) {
				setCurrentTournament(await Tournament.createTournament(tournamentId));
				navigateTo("/tournament-overview");
			}
			else
				navigateTo("/home");
		} else {
			AuthManager.showMessage("Error: No user data received", "error");
		}
	} catch (err: any) {
		AuthManager.showMessage(err.response?.data?.error || "Invalid 2FA code", "error");
	}
}