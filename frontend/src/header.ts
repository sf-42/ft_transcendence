import { html } from "./utils/html";
import { showClouds, hideClouds } from "./utils/babylonInit";
import { navigateTo, resetClientWebSocket, setCurrentGame, setCurrentTournament, setPlayer, socialOverlay } from "./main";
import { showNotification } from "./utils/ToastifyNotification";
import { AuthManager } from "./utils/AuthManager";

let previousPage: string = "/home";

export function renderHeader(): void {
	const title = document.getElementById('title');

	if (!title)
		return (console.error('Could not find title'));

	title.className = 'absolute top-1 object-center w-[100%]';
	const buttonClass = "hidden m-2 md:m-3 lg:m-4 xl:m-5 p-2 xl:p-3 text-2xl lg:text-3xl xl:text-4xl z-50 \
		rounded-2xl border-4 border-solid border-white cursor-pointer backdrop-blur-sm transition-colors bg-black/10 hover:bg-black/20 transition-all duration-300 hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 ease-in-out";

	title.appendChild(
		html`
        <div id="header" class="font-jersey text-white">
			<div class="absolute top-0 left-0 flex">
				<button type="button" id="backBtn" class="flex pr-5 ${buttonClass} items-center justif-center space-x-2">
					<img src="./assets/icons/white-arrow-left.png" class="max-h-8 lg:max-h-12 xl:max-h-30" />
					<p>Go back</p>
				</button>
				<button type="button" id="homeBtn" class="${buttonClass}">
					<img src="./assets/icons/home.png" class="max-h-8 lg:max-h-12 xl:max-h-16" />
				</button>
			</div>
            <button type="button" id="signOutBtn" class="absolute top-0 right-0 ${buttonClass}">
                Sign Out
            </button>
        </div>
        `
	);
}

export function showHeader(): void {
	const title = document.getElementById('title');

	if (title) {
		title.classList.remove('hidden');
	}
	showClouds();
}

export function hideHeader(): void {
	const title = document.getElementById('title');

	if (title) {
		title.classList.add('hidden');
	}
	hideClouds();
}

function removeOldEventListeners(element: HTMLElement | null): void {
	if (element) {
		const newElement = element.cloneNode(true);
		if (element.parentNode)
			element.parentNode.replaceChild(newElement, element);
	}
}

function animateButton(button: HTMLElement, shouldShow: boolean): void {
	const isHidden = button.classList.contains("hidden");
	const hasAnimation = button.classList.contains("animate-zoomin");

	if (shouldShow === !isHidden) {
		if (hasAnimation)
			button.classList.remove("animate-zoomin");
		return;
	}

	if (!shouldShow) {
		button.classList.add("hidden");
		button.classList.remove("animate-zoomin");
	}
	else {
		button.classList.remove("hidden");
		button.classList.remove("animate-zoomin");
		button.offsetHeight;
		button.classList.add("animate-zoomin");
	}
}

export function resetHeaderButtons(): void {
	const oldSignOutBtn = document.getElementById('signOutBtn');
	const oldBackBtn = document.getElementById('backBtn');
	const oldHomeBtn = document.getElementById('homeBtn');

	removeOldEventListeners(oldSignOutBtn);
	removeOldEventListeners(oldBackBtn);
	removeOldEventListeners(oldHomeBtn);

	AuthManager.isLoggedIn().then((loggedIn) => {
			// sign out
			const signOutBtn = document.getElementById('signOutBtn');
			if (signOutBtn) {
				animateButton(signOutBtn, loggedIn);
				signOutBtn.addEventListener('click', () => {
					AuthManager.logout().then(() => {
						socialOverlay.disconnect();
						setCurrentGame(null);
						setCurrentTournament(null);
						resetClientWebSocket();
						setPlayer(null);
						navigateTo("/login");
						showNotification("Successfully logged out.", "success");
					});
				});
			}
			// go back
			const backBtn = document.getElementById('backBtn');
			if (backBtn) {
				const shouldShow = loggedIn && location.pathname !== "/home";
				animateButton(backBtn, shouldShow);
				backBtn.addEventListener('click', () => {
					// history.back();
					navigateTo(previousPage);
				});
			}
			// go to home page
			const homeBtn = document.getElementById('homeBtn');
			if (homeBtn) {
				const shouldShow = loggedIn && location.pathname !== "/home";
				animateButton(homeBtn, shouldShow);
				homeBtn.addEventListener('click', () => {
					navigateTo("/home");
				});
			}
	});
}

export function setPreviousPage(url: string) {
	previousPage = url;
}