import AbstractView from "../utils/AbstractView.ts";
import { player, setCurrentGame, setPlayer, socialOverlay } from "../main.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { AuthManager } from "../utils/AuthManager.ts";
import { navigateTo, setCurrentTournament } from "../main.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import http from "../utils/http.ts"; // axios instance avec { withCredentials: true }
import { show2faStep, handle2faVerify } from "../utils/2fa.ts";
import { getUser, getCurrentTournament, isPlayerInGame } from "../utils/usersManagement.ts";
import { Tournament } from "../classes/Tournament.ts";
import { Game } from "../classes/Game.ts";

// Constants for CSS classes to keep the HTML template clean
const viewClasses = {
	button: "p-3 text-4xl rounded-2xl border-4 border-solid border-white transition-colors hover:bg-white/20 w-full transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer",
	oauthButton: "p-3 text-2xl rounded-2xl border-2 border-solid border-white transition-colors hover:bg-white/20 w-full transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer flex items-center justify-center gap-3",
	formDiv: "text-center m-3",
	text: "text-4xl",
	input: "bg-white/20 border border-grey-500 text-lg md:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5",
};

export default class extends AbstractView {
	private challengeToken?: string;
	private pendingUsername?: string;
	private pendingPassword?: string;

	constructor() {
		super();
		this.setTitle("Transcendence - Login");
	}

	async getHtml(): Promise<string> {
		toggleBlur(true);
		socialOverlay.hideOverlay();
		
		return `
        <div class="absolute min-w-[80%] sm:min-w-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex-col justify-center rounded-4xl border-8 border-solid border-white p-2 md:p-5 m-2 bg-black/10 animate-zoomin">
            <form id="login-form">
                <div class="${viewClasses.formDiv}">
                    <label for="username" class="${viewClasses.text}">Username</label><br />
                    <input type="text" id="username" name="username" placeholder="Your username"
                        class="${viewClasses.input}" required />
                </div>
                <div class="${viewClasses.formDiv}">
                    <label for="password" class="${viewClasses.text}">Password</label><br />
                    <input type="password" id="password" name="password" placeholder="Your password"
                        class="${viewClasses.input}" required />
                </div>
                <div class="${viewClasses.formDiv}">
                    <button type="submit"
                        class="${viewClasses.button}">
                        Login
                    </button>
                </div>

				<div class="${viewClasses.formDiv}">
                    <label for="password" class="text-2xl sm:text-4xl">You don't have an account ?</label><br />
                    <button type="button" id="signup-btn"
                        class="${viewClasses.button}">
                        Signup
                    </button>
                </div>

            </form>

			<!-- OAuth Buttons -->
			<div class="${viewClasses.formDiv}" id="OAuthButtons">
				<div class="flex items-center my-4">
					<div class="flex-1 border-t border-white/50"></div>
					<span class="px-4 text-white/70 text-xl">or continue with</span>
					<div class="flex-1 border-t border-white/50"></div>
				</div>
				
				<div class="flex flex-col sm:flex-row gap-3">
					<button type="button" id="google-login-btn" class="${viewClasses.oauthButton}">
						<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
							<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
						Google
					</button>
					
					<button type="button" id="fortytwo-login-btn" class="${viewClasses.oauthButton}">
						<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
							<polygon points="12,2 2,22 12,17 22,22"/>
						</svg>
						42 Intra
					</button>
				</div>
			</div>

            <div id="login-message" class="text-center mt-4"></div>

            <!-- Force Login Modal -->
            <div id="force-login-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div class="bg-gray-900 border-4 border-white rounded-2xl p-6 m-4 max-w-md text-center">
                    <h3 class="text-2xl mb-4">⚠️ Already Connected</h3>
                    <p class="text-lg mb-6">You are already logged in on another device or browser. Do you want to disconnect the other session and login here?</p>
                    <div class="flex gap-4 justify-center">
                        <button id="force-login-cancel" class="px-6 py-2 text-xl rounded-xl border-2 border-white hover:bg-white/20 transition-colors">
                            Cancel
                        </button>
                        <button id="force-login-confirm" class="px-6 py-2 text-xl rounded-xl border-2 border-red-500 bg-red-500/20 hover:bg-red-500/40 transition-colors">
                            Force Login
                        </button>
                    </div>
                </div>
            </div>

            <div id="twofa-container" class="${viewClasses.formDiv} hidden">
                <span class="text-3xl">2FA Verification</span>
				<form id="2fa-form">
					<input type="text" id="twofa-code" placeholder="Enter 6-digit code"
						class="${viewClasses.input}" maxlength="6" />
					<button type="submit" id="verify2faBtn"
						class="mt-3 ${viewClasses.button}}">
						Verify
					</button>
				</form>
            </div>
        </div>`;
	}

	afterRender() {
		// Handle OAuth callback params (error or success)
		this.handleOAuthCallback();

		const form = document.getElementById("login-form");
		if (form) {
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				this.handleAuthAttempt();
			});
		}

		const signupBtn = document.getElementById("signup-btn");
		if (signupBtn) {
			signupBtn.addEventListener("click", () => {
				navigateTo("/signup");
			});
		}

		// OAuth buttons
		const googleBtn = document.getElementById("google-login-btn");
		if (googleBtn) {
			googleBtn.addEventListener("click", () => {
				window.location.href = "/auth/google";
			});
		}

		const fortyTwoBtn = document.getElementById("fortytwo-login-btn");
		if (fortyTwoBtn) {
			fortyTwoBtn.addEventListener("click", () => {
				window.location.href = "/auth/42";
			});
		}

		const twofaForm = document.getElementById("2fa-form");
		if (twofaForm) {
			twofaForm.addEventListener("submit", (e) => {
				e.preventDefault();
				handle2faVerify((this.challengeToken ? this.challengeToken : ''));
			});
		}

		// Force login modal buttons
		const forceLoginCancel = document.getElementById("force-login-cancel");
		if (forceLoginCancel) {
			forceLoginCancel.addEventListener("click", () => {
				this.hideForceLoginModal();
			});
		}

		const forceLoginConfirm = document.getElementById("force-login-confirm");
		if (forceLoginConfirm) {
			forceLoginConfirm.addEventListener("click", () => {
				this.hideForceLoginModal();
				this.handleAuthAttempt(true); // Force login
			});
		}

	}

	private showForceLoginModal() {
		const modal = document.getElementById("force-login-modal");
		if (modal) modal.classList.remove("hidden");
	}

	private hideForceLoginModal() {
		const modal = document.getElementById("force-login-modal");
		if (modal) modal.classList.add("hidden");
	}

	private async handleAuthAttempt(forceLogin: boolean = false) {
		// Use stored credentials for force login, or get from form
		const username = forceLogin && this.pendingUsername 
			? this.pendingUsername 
			: (document.getElementById("username") as HTMLInputElement).value;
		const password = forceLogin && this.pendingPassword 
			? this.pendingPassword 
			: (document.getElementById("password") as HTMLInputElement).value;

		if (!username || !password) {
			showNotification("Please fill all fields.", "error");
			return AuthManager.showMessage("Please fill all fields.", "error");
		}

		// Store credentials for potential force login
		this.pendingUsername = username;
		this.pendingPassword = password;

		try {
			AuthManager.showMessage("Connecting...", "info");
			const res = await http.post("/auth/login", { username, password, forceLogin });
			const data = res.data;
			
			if (!data.success) {
				// Check if it's an "already connected" error with force login option
				if (data.canForceLogin) {
					this.showForceLoginModal();
					return;
				}
				return AuthManager.showMessage(data.error || "Login failed", "error");
			}
			
			// Clear stored credentials on success
			this.pendingUsername = undefined;
			this.pendingPassword = undefined;

			if (data.data?.user?.twoFaRequired) {
				this.challengeToken = data.data.user.challengeToken;
				show2faStep(data.data.user.qrCodeUrl);
				return; // Wait for 2FA verification
			}
			else {
				AuthManager.showMessage("Logged in successfully!", "success");
				showNotification("Logged in successfully!", "success");
				setPlayer(await getUser(true));
				await socialOverlay.initializeChat();
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
			}
		} catch (err: any) {
			// Handle 409 Conflict (already connected) from axios error
			if (err.response?.status === 409 && err.response?.data?.canForceLogin) {
				this.showForceLoginModal();
				return;
			}
			console.log(err.message || err);
			AuthManager.showMessage(err.response?.data?.error || err.message || "Login failed", "error");
		}
	}

	/**
	 * Handle OAuth callback URL parameters
	 * Called after redirect from Google/42 OAuth
	 */
	private handleOAuthCallback() {
		const urlParams = new URLSearchParams(window.location.search);
		const error = urlParams.get('error');
		
		if (error) {
			// Map error codes to user-friendly messages
			const errorMessages: Record<string, string> = {
				'google_denied': 'Google authentication was cancelled',
				'google_failed': 'Google authentication failed. Please try again.',
				'42_denied': '42 authentication was cancelled',
				'42_failed': '42 authentication failed. Please try again.',
				'username_taken': 'This username is already taken. Please use a different account or login with password.',
				'no_code': 'Authentication failed: no authorization code received',
			};
			
			const message = errorMessages[error] || `Authentication error: ${error}`;
			AuthManager.showMessage(message, "error");
			showNotification(message, "error");
			
			// Clean URL params
			window.history.replaceState({}, document.title, window.location.pathname);
		}
	}
}
