import AbstractView from "../utils/AbstractView.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { AuthManager } from "../utils/AuthManager.ts";
import { navigateTo, player, socialOverlay } from "../main.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import { setPlayer } from "../main.ts";
import { show2faStep, handle2faVerify } from "../utils/2fa.ts";
import http from "../utils/http.ts";
import { getUser } from "../utils/usersManagement.ts";
import { displayQRCode } from "../utils/QrCode.ts";



const viewClasses = {
	signupButton: "p-3 text-4xl rounded-2xl border-4 border-solid border-white transition-colors hover:bg-white/20 w-full \
	transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer",
	loginButton: "p-2 m-2 text-3xl rounded-2xl border-3 border-solid border-white transition-colors hover:bg-white/20 \
	transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)]",
	textClass: "text-3xl",
	inputClass: "bg-white/20 border border-grey-500 text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5",
	input: "bg-white/20 border border-grey-500 text-lg md:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5",
	button: "p-3 text-4xl rounded-2xl border-4 border-solid border-white transition-colors hover:bg-white/20 w-full transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer"
}

export default class extends AbstractView {
	private challengeToken?: string;

	constructor() {
		super();
		this.setTitle("Transcendence - Signup");
	}

	async getHtml(): Promise<string> {
		toggleBlur(true);
		socialOverlay.hideOverlay();

		return (`
			<div class="absolute min-w-[80%] sm:min-w-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 grid columns-1 justify-center rounded-4xl border-8 border-solid border-white p-5 m-2 bg-black/10 animate-zoomin">
				<div id="signup-form-container">
					<form id="signup" class="flex flex-col justify-center"> 
						<div class="text-center m-3">
							<span class="${viewClasses.textClass}">Username</span>
							<br />
							<input type="text" name="username" placeholder="Your Username" class="${viewClasses.inputClass}" />
						</div>
						<div class="text-center m-3">
							<span class="${viewClasses.textClass}">Password</span>
							<br />
							<input type="password" name="password" placeholder="Your password" class="${viewClasses.inputClass}" />
							<br />
							<input type="password" name="password_confirmation" placeholder="Confirm your password" class="${viewClasses.inputClass}" />
						</div>
						<label class="flex items-center cursor-pointer space-x-2 mx-auto mt-2">
							<input type="checkbox" id="twoFAToggle" class="sr-only peer" checked>
							<div class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full \
								rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] \
								after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border \
								after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600">
							</div>
							<span class="${viewClasses.textClass}">2FA activated?</span>
						</label>
						<div class="text-center m-3">
							<button type="button" id="signupBtn" class="${viewClasses.signupButton}">Sign Up</button>
						</div>
					</form>

					<div id="signup-message" class="text-center mt-4 p-2 text-xl"></div>
					
					<!-- OAuth Options -->
					<div class="text-center my-4" id="OAuthButtons">
						<span class="text-2xl text-white/70">Or sign up with</span>
					</div>
					
					<div class="flex flex-col gap-3 px-3">
						<button id="google-signup-btn" class="flex items-center justify-center gap-3 p-3 text-2xl rounded-2xl border-2 border-white/50 bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
							<svg class="w-6 h-6" viewBox="0 0 24 24">
								<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
								<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
								<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
								<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
							</svg>
							<span>Google</span>
						</button>
						
						<button id="fortytwo-signup-btn" class="flex items-center justify-center gap-3 p-3 text-2xl rounded-2xl border-2 border-white/50 bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
							<span class="font-bold text-xl">42</span>
							<span>Intra</span>
						</button>
					</div>
					
					<div class="p-3 text-center">
						<span class="text-3xl">Already have an account?</span>
						<br />
						<a href="/login" class="nav__link" data-link><div class="${viewClasses.loginButton}">Login</div></a>
					</div>
				</div>

				<div id="twofa-container" class="text-center m-3 hidden">
					<span class="text-3xl">2FA Verification</span>
					<div id="qrcode-display" class="my-4 flex justify-center"></div>
					<form id="2fa-form">
						<input type="text" id="twofa-code" placeholder="Enter 6-digit code"
							class="${viewClasses.input}" maxlength="6" />
						<button type="submit" id="verify2faBtn"
							class="mt-3 ${viewClasses.button}}">
							Verify
						</button>
					</form>
				</div>

			</div>
		`);
	}

	afterRender() {
		// Handle OAuth callback errors/success
		this.handleOAuthCallback();

		const signupBtn = document.getElementById('signupBtn');
		if (signupBtn) {
			signupBtn.addEventListener('click', () => {
				this.handleSignup();
			});
		}

		// Google OAuth button
		const googleBtn = document.getElementById("google-signup-btn");
		if (googleBtn) {
			googleBtn.addEventListener("click", () => {
				window.location.href = "/auth/google";
			});
		}

		// 42 OAuth button
		const fortyTwoBtn = document.getElementById("fortytwo-signup-btn");
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
				'google_denied': 'Google sign up was cancelled',
				'google_failed': 'Google sign up failed. Please try again.',
				'42_denied': '42 sign up was cancelled',
				'42_failed': '42 sign up failed. Please try again.',
				'username_taken': 'This username is already taken. Please use a different account.',
				'no_code': 'Sign up failed: no authorization code received',
			};
			
			const message = errorMessages[error] || `Sign up error: ${error}`;
			AuthManager.showMessage(message, "error");
			showNotification(message, "error");
			
			// Clean URL params
			window.history.replaceState({}, document.title, window.location.pathname);
		}
	}

	async handleSignup() {
		const form = document.getElementById('signup') as HTMLFormElement;
		const formData = new FormData(form);

		const username = formData.get('username') as string;
		// const login = formData.get('login') as string;
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('password_confirmation') as string;
		const twoFAToggle = (document.getElementById('twoFAToggle') as HTMLInputElement).checked;

		// Send to server
		try {
			AuthManager.showMessage("Account creation in progress...", "success");

			const result = await http.post("/auth/signup", { username, password, confirmPassword, twofa: twoFAToggle });
			const data = result.data;

			if (data.success) {
				AuthManager.showMessage("Account created with sucess!", "success");
				showNotification("Account created with success.", "success");

				if (data.data?.user.twoFaRequired) {
					this.challengeToken = data.data.user.challengeToken;
					show2faStep(data.data.user.qrCodeUrl);
					displayQRCode(data.data.user.qrCodeUrl);
					AuthManager.showMessage("Scan the QR code and enter your 2FA code.", "success");
					return; // Wait for 2FA verification before navigating
				}
				else {
					AuthManager.showMessage("Logged in successfully!", "success");
					showNotification("Logged in successfully!", "success");
				}
				setPlayer(await getUser(true));
				socialOverlay.initializeChat();
				navigateTo("/home");
			}
			else {
				const errorMsg = data?.error || "Error during account creation.";
				AuthManager.showMessage(errorMsg, "error");
				showNotification(errorMsg, "error");
			}
		}
		catch (error) {
			AuthManager.showMessage(<string>error, "error");
			console.log('Error:', error);
		}
	}
}
