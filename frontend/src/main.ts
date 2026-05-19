import './style.css';
// import { html } from './utils/html.ts';
import MainPage from "./views/MainPage.ts";
import Settings from "./views/Settings.ts";
import Play from "./views/Play.ts";
import Login from "./views/LoginPage.ts";
import Signup from "./views/SignupPage.ts";
import SimpleGame from "./views/SimpleGame.ts";
import TournamentView from "./views/TournamentView.ts";
import { CreateTournament, TournamentOverview } from "./views/TournamentView.ts";
import { Tournament } from './classes/Tournament.ts';
import GameView from "./views/GameView.ts";
import { Game } from "./classes/Game.ts";
import Statistics from './views/Statistics.ts';
import Profile from './views/Profile.ts';
import { Player } from './classes/Player.ts';
import type { KeyBinds } from './classes/KeyBinds.ts';
import { HomePageMovement } from './classes/HomePageMovement.ts';
import { SocialOverlay } from './Social.ts';
import { AuthManager } from './utils/AuthManager.ts';
import 'toastify-js/src/toastify.css';
import { showNotification } from './utils/ToastifyNotification.ts';
import { babylonInit, scene, resetCameraAndLight } from './utils/babylonInit.ts';
import { getCurrentTournament, getToken, getUser, isPlayerInGame, updateUser } from './utils/usersManagement.ts';
import { renderHeader, resetHeaderButtons } from './header.ts';
import { MyWebSocket } from "./classes/Network.ts";

function isHTMLElement(element: Element | null): element is HTMLElement {
	return element instanceof HTMLElement;
}

let previousPath: string = location.pathname;
let currentPath: string = location.pathname;
export let player: Player | null = null;
export let clientWs: MyWebSocket | null = null;
export const binds: KeyBinds = { left: 'a', right: 'd' };
export const socialOverlay = new SocialOverlay();
let currentGame: Game | null = null;
export let currentTournament: Tournament | null = null;
let playerMovement: HomePageMovement | null = null;

export function setCurrentGame(game: Game | null): void {
	if (playerMovement)
		playerMovement.cleanup();
	currentGame = game;
}

export function setCurrentTournament(tournament: Tournament | null): void {
	currentTournament = tournament;
}

export function setPlayer(newPlayer: Player | null) {
	if (player)
		player.destroy();
	player = newPlayer;
}

export function setBinds(newBinds: Partial<KeyBinds>) {
	if (newBinds.left)
		binds.left = newBinds.left;
	if (newBinds.right)
		binds.right = newBinds.right;
}

function renderBackground(): void {
	const body = document.getElementById('body');

	if (body) {
		body.className = "bg-blue-300";
		// maybe add dark mode
	}
}

export async function setClientWebSocket(): Promise<MyWebSocket | null> {
	if (player) {
		// Use secure WebSocket through nginx proxy
		// Cookie is sent automatically with the WebSocket handshake
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${wsProtocol}//${window.location.host}/game-ws`;
		clientWs = new MyWebSocket(wsUrl, player.getAccountID());
		return clientWs;
	}
	return null;
}

export function resetClientWebSocket() {
	clientWs?.close();
	clientWs = null;
}

const router = async () => {
	// Handle OAuth callback success
	const urlParams = new URLSearchParams(window.location.search);
	if (urlParams.has('login') && urlParams.get('login') === 'success') {
		// Clean URL parameters
		const cleanUrl = window.location.pathname;
		window.history.replaceState({}, '', cleanUrl);

		// Show success notification after a short delay to ensure page is ready
		setTimeout(() => {
			showNotification("Successfully logged in!", "success");
		}, 500);
	}

	const routes = [
		{ path: "/home", view: MainPage },
		{ path: "/play", view: Play },
		{ path: "/settings", view: Settings },
		{ path: "/login", view: Login },
		{ path: "/signup", view: Signup },
		{ path: "/simplegame", view: SimpleGame },
		{ path: "/tournament", view: TournamentView },
		{ path: "/create-tournament", view: CreateTournament },
		{ path: "/tournament-overview", view: TournamentOverview },
		{ path: "/game", view: GameView },
		{ path: "/statistics", view: Statistics },
		{ path: "/profile", view: Profile }
	];

	const potentialMatches = routes.map(route => {
		return {
			route: route,
			isMatch: location.pathname === route.path
		};
	});

	let match = potentialMatches.find(potentialMatch => potentialMatch.isMatch);

	if (!match) {
		match = {
			route: routes[0],
			isMatch: true
		};
		location.pathname = "/home";
		showNotification("You have been redirected to the home page.", "info"); // doesn't show up
	}

	const loggedIn = await AuthManager.isLoggedIn();
	if (!loggedIn) {
		socialOverlay.disconnect();
		socialOverlay.hideOverlay();
	}
	else {
		socialOverlay.showOverlay();
		if (!player) {
			let newPlayer = await getUser(true);
			if (newPlayer instanceof Player) {
				player = newPlayer;
				await setClientWebSocket();
				if (player) {
					const tournamentId = await getCurrentTournament();
					const gameId = await isPlayerInGame(player.getAccountID());
					if (tournamentId !== null) {
						// Inform the server that this player is reconnecting to the tournament
						// This updates the player's WebSocket reference on the server
						clientWs?.requestTournamentReconnect(player.getAccountID());
						setCurrentTournament(await Tournament.createTournament(tournamentId));
						if (!gameId) {
							navigateTo("/tournament-overview");
							return;
						}
					}
					if (gameId !== 0) {
						Game.rejoinGame(gameId);
						return;
					}
				}
			}
			else {
				AuthManager.logout().then(() => {
					socialOverlay.disconnect();
					if (clientWs)
						resetClientWebSocket();
					navigateTo("/login");
					showNotification("Could not get user's info.", "error");
				});
			}
		}
		else if (!clientWs) {
			await setClientWebSocket();
		}
	}

	// automatically redirect to login page if not logged in
	if (!loggedIn && location.pathname !== "/login" && location.pathname !== "/signup") {
		showNotification("Please log in first.", "error");
		navigateTo("/login");
		return;
	}

	// automatically redirect to home page if already logged in
	if (loggedIn && (location.pathname === "/login" || location.pathname === "/signup")) {
		showNotification("You are already logged in.", "info");
		navigateTo("/home");
		return;
	}

	const view = new match.route.view;

	const mainTitle = document.getElementById('main-title');
	if (mainTitle && location.pathname !== "/home") {
		mainTitle.classList.add('fade-out-title');
		await new Promise(resolve => setTimeout(resolve, 300));
	}

	if (location.pathname === "/game") {
		if (!currentGame) {
			showNotification('You have no ongoing game', 'error');
			navigateTo("/home");
			return;
		}
		else
			socialOverlay.hideOverlay();
	}
	else {
		socialOverlay.showOverlay();
		if (currentGame) {
			currentGame.destroy();
			currentGame = null;
		}
		if (location.pathname !== "/simplegame") {
			player?.setState("idle");
			resetCameraAndLight();
		}
	}

	if (location.pathname === "/tournament-overview") {
		if (!currentTournament) {
			showNotification('You are not registered in a tournament', 'error');
			navigateTo("/home");
			return;
		}
	}
	else {
		const tournamentWaitingScreen = document.getElementById('waitingScreen');
		if (tournamentWaitingScreen)
			tournamentWaitingScreen.remove();
	}

	if (currentGame && location.pathname !== "/game") {
		navigateTo("/game");
		return;
	}

	if (currentTournament && location.pathname !== "/tournament-overview" && location.pathname !== "/game") {
		navigateTo("/tournament-overview");
		return;
	}

	const rootElement3 = document.querySelector("#root");
	if (isHTMLElement(rootElement3)) {
		rootElement3.classList.add('font-jersey', 'text-white');
		rootElement3.innerHTML = await view.getHtml();

		if (view instanceof GameView && currentGame) {
			view.linkGame(currentGame);
			player?.setState("onBike");
		}
		else if (view instanceof TournamentOverview && currentTournament) {
			view.linkTournament(currentTournament);
		}
		else if (view instanceof Profile) {
			const urlParams = new URLSearchParams(window.location.search);
			const username = urlParams.get('user');

			if (username)
				await view.loadProfile(username);
			else
				await view.loadProfile();
		}
		
		// call afterRender if function exist
		if (typeof (view as any).afterRender === 'function') {
			(view as any).afterRender();
		}

		resetHeaderButtons();

		// player movement
		if (location.pathname === "/home") {
			if (!playerMovement && player) {
				playerMovement = HomePageMovement.getInstance(scene, player);
				playerMovement.initialize();
			}
		}
		else {
			if (playerMovement) {
				playerMovement.cleanup();
				playerMovement = null;
			}
		}
	}
};

export function getCurrentPath(): string {
	return currentPath;
}

export function getPreviousPath(): string {
	return previousPath;
}

export const navigateTo = (url: string) => {
	previousPath = location.pathname;
	currentPath = url;
	history.pushState(null, "", url);

	// console.log(`Navigation: ${previousPath} → ${currentPath}`);

	router();
};

babylonInit();
renderHeader();
renderBackground();

window.addEventListener("popstate", () => {
	previousPath = currentPath;
	currentPath = location.pathname;
	// console.log(`Back/Forward: ${previousPath} → ${currentPath}`);

	if (previousPath === "/game" && clientWs) {
		clientWs.leftGame();
		resetCameraAndLight();
	}

	router();
});

document.addEventListener("DOMContentLoaded", () => {
	document.body.addEventListener("click", (e: MouseEvent) => {
		let target = e.target as HTMLElement | null;

		while (target && !target.hasAttribute("data-link")) {
			target = target.parentElement;
		}

		if (target && target.hasAttribute("data-link") && target instanceof HTMLAnchorElement) {
			e.preventDefault();
			navigateTo(target.pathname);
		}
	});
	router();
});
