import AbstractView from "../utils/AbstractView.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { navigateTo, player, socialOverlay } from "../main.ts";
import { setPreviousPage, showHeader } from "../header.ts";
import { binds } from "../main.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import { updateUser } from "../utils/usersManagement.ts";
import { html } from "../utils/html.ts";
import { AuthManager } from "../utils/AuthManager.ts";
import http from "../utils/http.ts";
// import type { PartialUserUpdate } from "../utils/usersManagement.ts";

interface ProfilePictureResponse {
	success: boolean;
	profilePicture: string;
}

function getBindSymbol(bind: string): string {
	var	symbol = "";
	
	if (bind === "arrowright")
		symbol = "🡺";
	else if (bind === "arrowleft")
		symbol = "🡸";
	else if (bind === "arrowup")
		symbol = "🡹";
	else if (bind === "arrowdown")
		symbol = "🡻";
	// check the real values
	else if (bind === "enter")
		symbol = "↵";
	else if (bind === "tab")
		symbol = "⭾";
	else if (bind === "control")
		symbol = "Ctrl";
	else if (bind === "delete")
		symbol = "Del";
	else if (bind === " ")
		symbol = "SPACE";
	// add shift, caps lock, alt, backspace
	else
		symbol = bind.toUpperCase();
	return (symbol);
}

export default class extends AbstractView {
	constructor() {
		super();
		this.setTitle("Transcendence - Settings");
	}

	displayBinds(): string {
		const txtClass = "text-center text-3xl xl:text-4xl";
		const bindCellClass = "rounded-2xl border-4 border-solid border-white transition-colors hover:bg-white/20 min-w-1/3 px-2 h-full \
		transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)]";
		const bindTxt = "text-center text-5xl";
		
		let str = "";

		Object.entries(binds).forEach(([key, value]) => {
			str += `
			<div class="${txtClass}">
				<p>${key.toUpperCase()}</p>
		 	</div>
			`;
			str += `
			<button class="${bindCellClass}" data-actionBind-id="${key}">
			`;
			const	bind = getBindSymbol(value);
			str += `
			<p class="${bindTxt}" id="${key + "-display"}">${bind}</p>
			`;
			str += `
			</button>
			`;
		});

		return (str);
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		showHeader();
		setPreviousPage("/home");

		const colClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 w-[80%] sm:w-1/2 xl:w-[30%] bg-black/10 animate-zoomin backdrop-blur-sm";
		const skinCellClass = "object-fill rounded-2xl border-4 border-solid border-white transition-colors hover:bg-white/20 w-full h-[90px] \
			transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer";
		const titleClass = "text-center text-4xl xl:text-5xl mb-3"
		const imgClass = "w-full h-full object-contain mx-auto mb-3";
		const txtClass = "text-center text-3xl xl:text-5xl";
		const bikeTxtClass = "text-center text-2xl md:text-3xl xl:text-5xl";
		
		const bindsDisplay = this.displayBinds();

		return (`
			<div class="min-h-screen top-0 flex flex-col justify-center items-center p-4">
				<div class="w-full">
					<h2 class="text-center text-7xl mt-10 text-shadow-subtitle text-shadow-[#C16630]">Settings</h2>
					<div class="flex flex-wrap items-center justify-center gap-4">
						<div class="${colClass}">
							<h3 class="${titleClass}">Account management</h3>
							<div class="flex flex-1 items-center gap-2">
								<p class="text-xl xl:text-3xl flex-grow">Change your profile picture</p>
								<button type="button" id="updateProfilePicBtn" class="p-1 rounded-lg border-4 border-solid border-white transition-colors hover:bg-white/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer items-center justify-center">
									<img src="/assets/icons/upload.png" class="max-h-6 xl:max-h-8" title="Upload" />
								</button>
								<button type="button" id="deleteProfilePicBtn" class="p-1 rounded-lg border-4 border-solid border-white transition-colors hover:bg-white/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer items-center justify-center">
									<img src="/assets/icons/cross.png" class="max-h-6 xl:max-h-8" title="Delete" />
								</button>
							</div>
							<form id="passwordChange" class="flex flex-col gap-1">
								<p class="text-xl xl:text-3xl">Change your password</p>
										<input type="password" id="old-password-input" name="old_password" placeholder="Current password" class="bg-white/20 border border-grey-500 text-md xl:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5" />
										<input type="password" id="new-password-input" name="password" placeholder="New password" class="bg-white/20 border border-grey-500 text-md xl:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5" />
										<input type="password" id="confirm-password-input" name="password_confirmation" placeholder="Confirm new password" class="bg-white/20 border border-grey-500 text-md xl:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5" />
												<input type="text" id="password-2fa-input" placeholder="Enter 2FA code (if enabled)" class="hidden bg-white/20 border border-grey-500 text-md xl:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5 mt-2" maxlength="6" />
												<p id="password-message" class="hidden text-sm mt-1"></p>
								<button type="button" id="changePasswordBtn" class="p-1 text-lg xl:text-xl rounded-lg border-4 border-solid border-white transition-colors hover:bg-white/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer items-center justify-center">
									Confirm change
								</button>
							</form>
						</div>
						<div class="w-[80%] sm:w-1/2 xl:w-[30%]">
							<div class="rounded-4xl border-8 border-solid border-white p-4 m-2 mt-8 xl:mt-2 bg-black/10 animate-zoomin backdrop-blur-sm">
								<h3 class="${titleClass}">Change key binds</h3>
								<div class="grid grid-cols-2 gap-3 justify-items-center">
									<div class="${txtClass}">
										<p>Action</p>
									</div>
									<div class="${txtClass}">
										<p>Bind</p>
									</div>
									${bindsDisplay}
								</div>
							</div>
							<div class="rounded-4xl border-8 border-solid border-white p-4 m-2 mt-8 xl:mt-2 bg-black/10 animate-zoomin backdrop-blur-sm">
								<h3 class="${titleClass}">Change player skin</h3>
								<div class="grid grid-cols-2 gap-3">
									<button class="${skinCellClass}" data-playerSkin-id="0">
										<img src="/assets/characters/Character-0/Icon.png" class="${imgClass}" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="1">
										<img src="/assets/characters/Character-1/Icon.png" class="${imgClass}" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="2">
										<img src="/assets/characters/Character-2/Icon.png" class="${imgClass}" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="3">
										<img src="/assets/characters/Character-3/Icon.png" class="${imgClass}" />
									</button>
									<!-- <button class="${skinCellClass}" data-playerSkin-id="4">
										<img src="/assets/characters/Character-4/Icon.png" class="${imgClass} grayscale opacity-50" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="5">
										<img src="/assets/characters/Character-5/Icon.png" class="${imgClass} grayscale opacity-50" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="6">
									<img src="/assets/characters/Character-6/Icon.png" class="${imgClass} grayscale opacity-50" />
									</button>
									<button class="${skinCellClass}" data-playerSkin-id="7">
										<img src="/assets/characters/Ninja/Icon.png" class="${imgClass} grayscale opacity-50" />
									</button> -->
								</div>
							</div>
						</div>
						<div class="${colClass}">
							<h3 class="${titleClass}">Change bike skin</h3>
							<div class="grid grid-cols-2 gap-3">
								<button class="${skinCellClass}" data-bikeSkin-id="0">
									<p class="${bikeTxtClass}">Chopper</p>
								</button>
								<button class="${skinCellClass}" data-bikeSkin-id="1">
									<p class="${bikeTxtClass}">Cross</p>
								</button>
								<button class="${skinCellClass}" data-bikeSkin-id="2">
									<p class="${bikeTxtClass}">GunBike</p>
								</button>
								<button class="${skinCellClass}" data-bikeSkin-id="3">
									<p class="${bikeTxtClass}">Scooter</p>
								</button>
								<button class="${skinCellClass}" data-bikeSkin-id="4">
									<p class="${bikeTxtClass}">Tracer</p>
								</button>
							</div>
						</div>

						<button
							type="button"
							id="delete-account"
							class="rounded-4xl border-8 border-solid border-white hover:border-red-500 p-5 m-2 w-1/2 xl:w-[30%] bg-red-500/20 animate-zoomin backdrop-blur-sm cursos-pointer \
								text-center text-3xl xl:text-5xl transition-shadow transition-colors hover:bg-red-500/50 hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] hover:scale-110"
						>
							Delete your account
						</button>
					</div>
				</div>
				<div class="hidden" id="confirmation-window"></div>
			</div>
		`);
	}

	private async displayAccountDeletionConfirmation(): Promise<void> {
		const confirmationDiv = document.getElementById('confirmation-window');

		if (confirmationDiv) {
			const btnClass = "rounded-2xl border-4 border-solid border-white w-full h-[90px] \
				transition-all hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer duration-300 ease-in-out";

			confirmationDiv.className = "absolute left-0 top-0 h-full w-full backdrop-blur-sm";
			
			// Check if user is OAuth (no password required)
			let isOAuth = false;
			try {
				const response = await http.get('/auth/status');
				isOAuth = !!response.data?.oauthProvider;
			} catch (e) {
				console.error('Failed to get auth status:', e);
			}
			
			// Different dialog for OAuth users (no password required)
			if (isOAuth) {
				confirmationDiv.appendChild(html `
					<div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-4xl border-8 border-solid border-white \
						p-5 m-2 w-[80%] sm:w-1/2 xl:w-[30%] bg-black/10 animate-zoomin backdrop-blur-sm text-center text-3xl xl:text-5xl">
						<p>Are you sure you want to delete your account?<br />
						This action is irreversible.</p>
						<p id="delete-message" class="hidden text-red-400 text-xl mt-2"></p>
						<div class="flex gap-2 mt-4">
							<button id="confirmation-yes" class="${btnClass} hover:border-green-800 hover:text-green-800 hover:bg-green-800/20" type="button">Yes</button>
							<button id="confirmation-no" class="${btnClass} hover:border-red-500 hover:text-red-500 hover:bg-red-500/20" type="button">No</button>
						</div>
					</div>
				`);
			} else {
				// Classic account: require password
				confirmationDiv.appendChild(html `
					<div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-4xl border-8 border-solid border-white \
						p-5 m-2 w-[80%] sm:w-1/2 xl:w-[30%] bg-black/10 animate-zoomin backdrop-blur-sm text-center text-3xl xl:text-5xl">
						<p>Are you sure you want to delete your account?<br />
						This action is irreversible.</p>
						<input type="password"
							   id="delete-password"
							   placeholder="Enter your password"
							   class="w-full p-3 mt-4 rounded-xl border-2 border-white bg-black/30 text-white text-xl text-center"
						/>
						<input type="text"
							   id="delete-2fa-code"
							   placeholder="Enter 2FA code (if enabled)"
							   class="hidden w-full p-3 mt-4 rounded-xl border-2 border-white bg-black/30 text-white text-xl text-center"
							   maxlength="6"
						/>
						<p id="delete-message" class="hidden text-red-400 text-xl mt-2"></p>
						<div class="flex gap-2 mt-4">
							<button id="confirmation-yes" class="${btnClass} hover:border-green-800 hover:text-green-800 hover:bg-green-800/20" type="button">Yes</button>
							<button id="confirmation-no" class="${btnClass} hover:border-red-500 hover:text-red-500 hover:bg-red-500/20" type="button">No</button>
						</div>
					</div>
				`);
			}

			const confirmBtn = document.getElementById('confirmation-yes');
			if (confirmBtn) {
				confirmBtn.addEventListener('click', async () => {
					const passwordInput = document.getElementById('delete-password') as HTMLInputElement;
					const twoFaInput = document.getElementById('delete-2fa-code') as HTMLInputElement;
					const messageEl = document.getElementById('delete-message');
					const password = passwordInput?.value;
					const twoFaCode = twoFaInput?.value;
					
					try {
						await http.delete('/auth/remove', { password, twoFaCode });
						await AuthManager.logout();
						socialOverlay.disconnect();
						navigateTo("/login");
						showNotification("Account successfully deleted.", "success");
					} catch (error: any) {
						// Check if 2FA is required
						if (error.data?.requires2FA) {
							if (twoFaInput) {
								twoFaInput.classList.remove('hidden');
								twoFaInput.focus();
							}
							if (messageEl) {
								messageEl.classList.remove('hidden');
								messageEl.textContent = "Please enter your 2FA code to confirm deletion.";
							}
							return;
						}
						// Check if 2FA code was invalid
						if (error.data?.error === "Invalid 2FA code") {
							if (messageEl) {
								messageEl.classList.remove('hidden');
								messageEl.textContent = "Invalid 2FA code. Please try again.";
							}
							return;
						}
						// Check if password was invalid
						if (error.data?.error === "Invalid password") {
							if (messageEl) {
								messageEl.classList.remove('hidden');
								messageEl.textContent = "Invalid password. Please try again.";
							}
							return;
						}
						// Check if password is invalid
						if (error.data?.error === "Password is empty") {
							if (messageEl) {
								messageEl.classList.remove('hidden');
								messageEl.textContent = "Empty password. Please try again.";
							}
						}
						showNotification("Account deletion failed.", "error");
					}
				});
			}

			const cancelBtn = document.getElementById('confirmation-no');
			if (cancelBtn) {
				cancelBtn.addEventListener('click', () => {
					confirmationDiv.className = 'hidden';
					confirmationDiv.innerHTML = '';
				});
			}
		}
	}


	private async changePassword(): Promise<void> {
		const oldPassword = document.getElementById('old-password-input') as HTMLInputElement;
		const newPassword = document.getElementById('new-password-input') as HTMLInputElement;
		const confirmPassword = document.getElementById('confirm-password-input') as HTMLInputElement;

		if (!oldPassword) showNotification("Old password input not found", "error");
		if (!newPassword) showNotification("New password input not found", "error");
		if (!confirmPassword) showNotification("Confirm password input not found", "error");

		try {
			// basic client-side checks
			if (newPassword.value !== confirmPassword.value) {
				showNotification("New password and confirmation do not match.", "error");
				return;
			}

			const twoFaInput = document.getElementById('password-2fa-input') as HTMLInputElement | null;
			const twoFaCode = twoFaInput?.value?.trim() || undefined;
			await http.put('/auth/password', {
				old: oldPassword.value,
				new: newPassword.value,
				newConfirm: confirmPassword.value,
				twoFaCode
			});
			showNotification("Password changed successfully!", "success");
			oldPassword.value = '';
			newPassword.value = '';
			confirmPassword.value = '';
		} catch (error: any) {
			// If server requires 2FA, show the 2FA input and prompt user
			if (error?.data?.requires2FA) {
				const twoFaInput = document.getElementById('password-2fa-input') as HTMLInputElement | null;
				const msg = document.getElementById('password-message');
				if (twoFaInput) {
					twoFaInput.classList.remove('hidden');
					twoFaInput.focus();
				}
				if (msg) {
					msg.classList.remove('hidden');
					msg.textContent = 'This account has 2FA enabled — please enter your 2FA code and confirm again.';
				}
				return; // don't show generic error toast
			}

			const message = error.data?.error || error.message || "Failed to change password";
			showNotification(message, "error");
		}
	}

	private uploadPicture(uploadBtn: HTMLElement) {
		const fileInput = document.createElement('input');
			fileInput.type = 'file';
			fileInput.accept = 'image/png, image/jpeg, image/webp';
			fileInput.style.display = 'none';
			document.body.appendChild(fileInput);
			uploadBtn.addEventListener('click', (/* e */) => {
				// e.preventDefault();
				fileInput.click();
			});
			fileInput.addEventListener('change', async (/* e */) => {
				// e.preventDefault();
				if (fileInput.files && fileInput.files.length > 0) {
					const file = fileInput.files[0];
					if (file.size > 5 * 1024 * 1024) { // 5MB limit
						showNotification("File size must be less than 5MB", "error");
						fileInput.value = '';
						return;
					}
					const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
					if (!allowedTypes.includes(file.type)) {
						showNotification("Only JPEG, PNG and WebP images are allowed", "error");
						fileInput.value = '';
						return;
					}
					const formData = new FormData();
					formData.append('file', file);
					try {
						const result = await http.put<ProfilePictureResponse>('/users/picture', formData);
						if (result.ok && result.data.success) {
							showNotification("Profile picture updated successfully", "success");
							player?.setProfilePicture(result.data.profilePicture);
						} else {
							showNotification("Failed to upload picture", "error");
						}
					} catch (error: any) {
						console.error("Upload error:", error);
						showNotification(error.message || "An error occurred during upload", "error");
					} finally {
						fileInput.value = '';
					}
				}
			});
	}

	private async deleteProfilePicture() {
		try {
			const response = await http.delete('/users/picture');

			if (response.data.success)
				showNotification('Profile picture removed successfully', 'success');
			else
				showNotification('Failed to remove your profile picture', 'error');
		} catch (error) {
			showNotification((error as any).message || "An error occurred during removal", "error");
		}
	}

	afterRender() {
		const uploadBtn = document.getElementById('updateProfilePicBtn');
		if (uploadBtn)
			this.uploadPicture(uploadBtn);

		const deletePictureBtn = document.getElementById('deleteProfilePicBtn');
		if (deletePictureBtn) {
			deletePictureBtn.addEventListener('click', () => {
				this.deleteProfilePicture();
			});
		}

		const changePasswordBtn = document.getElementById('changePasswordBtn');
		if (changePasswordBtn) {
			changePasswordBtn.addEventListener('click', async () => {
				this.changePassword();
			});
		}

		let waitingKeyPress: string | null = null;

		// change key bind
		document.querySelectorAll('button[data-actionBind-id]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const mouseEvent = e as MouseEvent;
				if (mouseEvent.detail === 0)
					return;

				waitingKeyPress = (e.currentTarget as HTMLElement).getAttribute('data-actionBind-id');
				btn.classList.add("opacity-50", "shadow-[0px_0px_10px_3px_rgba(255,255,255,1)]");
			});
		});
		document.addEventListener('keydown', (e: KeyboardEvent) => {
			if (waitingKeyPress) {
				if (e.key.toLowerCase() !== "escape") {
					if (waitingKeyPress === "left") {
						binds.left = e.key.toLowerCase();
						const leftKey = document.querySelector('#left-display');
						if (leftKey)
							leftKey.textContent = getBindSymbol(binds.left);
					}
					else if (waitingKeyPress === "right") {
						binds.right = e.key.toLowerCase();
						const rightKey = document.querySelector('#right-display');
						if (rightKey)
							rightKey.textContent = getBindSymbol(binds.right);
					}
					if (player)
						updateUser({keyBinds: binds});
				}
				waitingKeyPress = null;
				document.querySelectorAll('button[data-actionBind-id]').forEach(btn => {
					btn.classList.remove("opacity-50", "shadow-[0px_0px_10px_3px_rgba(255,255,255,1)]");
				});
			}
		});

		// change player skin
		document.querySelectorAll('button[data-playerSkin-id]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const id = Number((e.currentTarget as HTMLElement).getAttribute('data-playerSkin-id'));
				if (id < 0 || id > 3) // delete this when all models are finished
					showNotification("This skin is not available for the moment.", "error");
				else
					player?.changeSkin(id);
			});
		});

		// change bike skin
		document.querySelectorAll('button[data-bikeSkin-id]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const id = Number((e.currentTarget as HTMLElement).getAttribute('data-bikeSkin-id'));
				player?.changeBikeSkin(id);
			});
		});

		// Delete account 
		const deleteAccountBtn = document.getElementById('delete-account');
		if (deleteAccountBtn) {
			deleteAccountBtn.addEventListener('click', () => {
				this.displayAccountDeletionConfirmation();
			});
		}

	}
}
