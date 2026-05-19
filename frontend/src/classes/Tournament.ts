import { clientWs, getCurrentPath, navigateTo, player, setCurrentTournament, socialOverlay } from "../main.ts";
import { html, escapeHtml, sanitizeUrl } from "../utils/html";
import http from "../utils/http.ts"; // axios instance avec { withCredentials: true }
import { showNotification } from "../utils/ToastifyNotification.ts";
import { getUserById, getUsernameByID, type User } from "../utils/usersManagement.ts";
import { Player } from "./Player.ts";


type Match = {
	player1: number | null;
	player2: number | null;
	winner?: number;
};

export interface TournamentInterface {
	id: number;
	maxPlayers: number; // (4 or 8)
	powerUps: boolean;
	status: 'pending' | 'in_progress' | 'finished';
	currentRound: number;
	creator: number;
	players: string;
	bracket: string;
	winnerId: number | null;

	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export class Tournament {
	private _id: number;
	private _capacity: number;
	private _players: User[] = [];
	private _overviewParentElement: HTMLElement | null = null;
	private _bracket: HTMLElement;
	private _waitingScreen: HTMLElement;
	private _invitesDiv: HTMLElement;
	private _endScreen: HTMLElement;
	private _state: 'pending' | 'in_progress' | 'finished';
	private _nbOfRounds: number;
	// private _currentRound: number;
	private _games: Match[][]; // tournament[round][matchID]
	private _ranking: number[] = [];
	private _eliminated: boolean = false;

	constructor(id: number, capacity: number) {
		this._id = id;
		this._capacity = capacity;
		this._nbOfRounds = 1;
		while (Math.pow(this._nbOfRounds, 2) < this._capacity)
			this._nbOfRounds++;
		// this._currentRound = 1;
		this._state = 'pending';
		this._games = [];

		this._bracket = document.createElement('div');
		this._bracket.id = "bracket";
		this._waitingScreen = document.createElement('div');
		this._waitingScreen.id = "waitingScreen";
		this._invitesDiv = document.createElement('div');
		this._invitesDiv.id = "inviteFriends";
		this._endScreen = document.createElement('div');
		this._endScreen.id = "endScreen";
	}

	async addPlayer(playerId: number): Promise<boolean> {
		if (this._players.length >= this._capacity)
			return (false);

		const player = await getUserById(playerId);

		if (!player || this._players.includes(player))
			return (false);

		this._players.push(player);
		const participants = document.getElementById('participants');
		if (participants) {
			participants.appendChild(
				html`
				<div id="player-${playerId}" class="flex m-2 items-center justify-center gap-2">
					<img src="${player.profilePicture || Player.getIconPathBySkinId(player.avatar)}" class="max-w-10 md:max-w-16 lg:max-w-20 rounded-full" />
					<p class="text-xl md:text-3xl">${player.username}</p>
				</div>
				`
			);
		}
		return (true);
	}

	removePlayer(playerId: number): boolean {
		const newPlayers = this._players.filter(player => player.id !== playerId);
		if (newPlayers === this._players) {
			console.error('Failed to remove player from the tournament');
			return false;
		}
		const playerCard = document.getElementById(`player-${playerId}`);
		playerCard?.remove();
		return true;
	}

	getPlayerById(id: number): User | null {
		for (const p of this._players) {
			if (p.id === id)
				return p;
		}
		return (null);
	}

	displayWaitingScreen(): void {
		this._waitingScreen.innerHTML = '';
		this._waitingScreen.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-[80%] rounded-4xl border-8 \
		border-solid border-white p-10 bg-black/10 animate-zoomin backdrop-blur-sm flex flex-col";

		const topContent = document.createElement('div');
		topContent.className = "flex-shrink-0";

		topContent.appendChild(
			html `
			<div>
				<p class="text-3xl md:text-5xl xl:text-7xl text-center">Waiting for players to join...</p>
				<img src="/assets/icons/loading.gif" class="mx-auto max-h-10 md:max-h-16 lg:max-h-20" />
			</div>
			`
		);

		this._waitingScreen.appendChild(topContent);

		const participants = document.createElement('div');
		participants.className = "flex-1 overflow-y-auto min-h-0 my-4";
		participants.appendChild(
			html `
				<p class="text-3xl md:text-5xl text-center">Participants:</p>
			`
		);
		
		const participantsContent = document.createElement('div');
		participantsContent.id = "participants";
		participantsContent.className = "grid grid-cols-2";

		this._players.forEach(player => {
			participantsContent.appendChild(
				html`
				<div class="flex m-2 items-center justify-center gap-2">
					<img src="${player.profilePicture || Player.getIconPathBySkinId(player.avatar)}" class="max-w-10 md:max-w-16 lg:max-w-20 rounded-full" />
					<p class="text-xl md:text-3xl">${player.username}</p>
				</div>
				`
			);
        });

		participants.appendChild(participantsContent);
		this._waitingScreen.appendChild(participants);

		
		const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
		transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin text-center text-2xl md:text-4xl cursor-pointer";
		
		const buttonsDiv = document.createElement('div');
		buttonsDiv.className = "flex-shrink-0";
		buttonsDiv.appendChild(
			html `
			<div class="flex flex-col items-center">
				<button type="button" id="invite-friends" class="${btnClass}">Invite friends</button>
				<button type="button" id="leave" class="${btnClass}">Leave</button>
			</div>
			`
		);

		this._waitingScreen.appendChild(buttonsDiv);

		if (!this._overviewParentElement) {
			this._overviewParentElement = document.getElementById('tournament');
			if (!this._overviewParentElement) {
				const root = document.getElementById('root');
				this._overviewParentElement = document.createElement('div');
				this._overviewParentElement.id = "tournament";
				root?.appendChild(this._overviewParentElement);
			}
		}
		this._overviewParentElement.appendChild(this._waitingScreen);

		const inviteBtn = document.getElementById('invite-friends');
		if (inviteBtn) {
			inviteBtn.addEventListener('click', () => {
				this.displayFriendsList();
			});
		}

		const leaveBtn = document.getElementById('leave');
		if (leaveBtn) {
			leaveBtn.addEventListener('click', () => {
				if (player)
					this.leaveTournament(player);
			});
		}
	}

	private async displayFriendsList() {
		try {
			const response = await http.get('/chat/friends', {});
			
			const data = response.data;
			const friends = data.data || [];

			const btnClass = "rounded-2xl border-4 border-solid border-white px-4 py-2 \
				transition-all hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer duration-300 ease-in-out";

			this._invitesDiv.innerHTML = '';

			this._invitesDiv.className = "absolute top-0 left-0 w-full h-full backdrop-blur-sm flex items-center justify-center";
			const inviteWindow = document.createElement('div');
			inviteWindow.className = "rounded-4xl border-8 border-solid border-white p-5 m-2 w-[80%] sm:w-1/2 xl:w-[30%] \
				bg-black/10 animate-zoomin backdrop-blur-sm text-center text-3xl xl:text-5xl"
			const friendsList = document.createElement('div');
			friendsList.className = "mb-2";
			const closeBtn = document.createElement('button');
			closeBtn.className = btnClass + " mt-2";
			closeBtn.textContent = "Close";
			closeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this._invitesDiv.remove();
			})

			if (friends.length === 0) {
				friendsList.innerText = "You do not have any friend to invite :(";
			}
			else {
				const chatWs = socialOverlay.getWs();
				friends.forEach(async (friend: any) => {
					const friendId = friend.id;
					const username = await getUsernameByID(friendId);
					const friendEl = document.createElement('div');
					friendEl.className = "p-2 my-1 bg-white/10 rounded-lg flex items-center";
					
					const nameBtn = document.createElement('div');
					nameBtn.className = "text-lg md:text-2xl xl:text-3xl overflow-hidden text-ellipsis whitespace-nowrap flex-grow";
					nameBtn.textContent = username || `User ${friendId}`;

					const inviteBtn = document.createElement('button');
					inviteBtn.textContent = "Invite";
					inviteBtn.className = btnClass;
					inviteBtn.addEventListener('click', (e) => {
						e.stopPropagation();
						if (chatWs && chatWs.readyState === WebSocket.OPEN) {
							chatWs.send(JSON.stringify({
								type: 'tournament-invite',
								to: friendId,
								message: 'You have a been invited to a tournament!',
								content: this._id
							}));
						}
					});
					
					friendEl.appendChild(nameBtn);
					friendEl.appendChild(inviteBtn);
					friendsList.appendChild(friendEl);
				});
			}

			inviteWindow.appendChild(friendsList);
			inviteWindow.appendChild(closeBtn);
			this._invitesDiv.appendChild(inviteWindow);
			this._overviewParentElement?.appendChild(this._invitesDiv);
		} catch (error) {
			console.error('displayFriendsList failed:', error);
		}
	}

	private async leaveTournament(player: Player) {
		if (clientWs) {
			clientWs?.requestTournamentLeave(this._id, player.getAccountID());
			try {
				await clientWs?.waitTournamentLeave();
			} catch (error) {
				showNotification('Leaving tournament timed out', 'error');
			}
		}
		else
			console.error('No web socket set');
	}

	private getRoundName(round: number): string {
		const roundsLeft = this._nbOfRounds - round - 1;
		switch (roundsLeft) {
			case 0:
				return ("Final");
			case 1:
				return ("Semi Finals");
			case 2:
				return ("Quarter Finals");
			default: // only if capacity >= 32
				return (`Round ${round + 1}`);
		}
	}

	private async renderMatchCard(match: Match): Promise<string> {
		const defaultTxtClass = "text-5xl";
		const winnerTxtClass = "text-green-500 text-5xl";
		const loserTxtClass = "text-gray-500/80 text-5xl";
		const defaultImgClass = "max-w-12 rounded-full";
		const loserImgClass = defaultImgClass + " grayscale";
		let player1: User | null = null, player2: User | null = null;
		if (match.player1 && match.player1 !== -1) {
			player1 = this.getPlayerById(match.player1);
			if (!player1)
				player1 = await getUserById(match.player1);
		}
		if (match.player2 && match.player2 !== -1) {
			player2 = this.getPlayerById(match.player2);
			if (!player2)
				player2 = await getUserById(match.player2);
		}

		return (
			`
			<div class="rounded-4xl border-8 border-solid border-white p-10 bg-black/10 animate-zoomin backdrop-blur-sm">
				<div class="flex items-center justify-center gap-2 border-0 border-b-1 border-white">
					${player1 
						? `<img src="${player1.profilePicture || Player.getIconPathBySkinId(player1.avatar)}" class="${match.winner && match.winner !== -1 && match.player1 !== match.winner ? loserImgClass : defaultImgClass}" />
						<p class="${match.winner && match.winner !== -1 ? (match.player1 === match.winner ? winnerTxtClass : loserTxtClass) : defaultTxtClass}">${player1.username}</p>`
						: `<p class="${defaultTxtClass}">TBD</p>`}
				</div>
				<div class="flex items-center justify-center gap-2">
					${player2 
						? `<img src="${player2.profilePicture || Player.getIconPathBySkinId(player2.avatar)}" class="${match.winner && match.winner !== -1 && match.player2 !== match.winner ? loserImgClass : defaultImgClass}" />
						<p class="${match.winner && match.winner !== -1 ? (match.player2 === match.winner ? winnerTxtClass : loserTxtClass) : defaultTxtClass}">${player2.username}</p>`
						: `<p class="${defaultTxtClass}">TBD</p>`}
				</div>
			</div>
			`
		);
	}

	async displayBracket(): Promise<void> {
		let htmlContent = `
		<div class="w-full min-h-screen p-8 overflow-auto flex items-center justify-center">
			<div class="max-w-7xl mx-auto">
				<div class="flex justify-center gap-12 items-center">
		`;

		// console.log('Displaying bracket');

		if (this._state !== 'in_progress')
			return ;

		let gamesCounter = 0;
				
		for (let round = 0; round < this._nbOfRounds; round++) {
			let matchCards: string = '';
			const lastRoundGames = gamesCounter;
			gamesCounter = 0;

			if (this._games[round]) {
				for (const match of this._games[round]) {
					matchCards += await this.renderMatchCard(match);
					gamesCounter++;
				}
			}
			else {
				for (let i = 0; i < lastRoundGames / 2; i++) {
					matchCards += await this.renderMatchCard({ player1: null, player2: null, winner: undefined });
					gamesCounter++;
				}
			}
			htmlContent += `
			<div class="flex flex-col items-center">
				<h3 class="text-7xl mb-4">
				${this.getRoundName(round)}
				</h3>
				<div class="flex flex-col justify-around h-full gap-8">
				${matchCards}
				</div>
			</div>
			`;
		}

		htmlContent += `
				</div>
			</div>
		</div>
		`;

		if (this._eliminated) {
			const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-5 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
				transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl cursor-pointer";

			htmlContent += `
				<div class="absolute bottom-10 flex w-full justify-center">
					<button id="leaveTournament" type="button" class="${btnClass}">
						Leave Tournament
					</button>
				</div>
			`;
		}

		this._bracket.innerHTML = htmlContent;

		if (!document.getElementById('bracket')) {	
			let parentElement = document.getElementById('tournament');
			if (!parentElement) {
				const root = document.getElementById('root');
				parentElement = document.createElement('div');
				parentElement.id = "tournament";
				root?.appendChild(parentElement);
			}
			parentElement.appendChild(this._bracket);
		}

		if (this._eliminated) {
			const leaveBtn = document.getElementById('leaveTournament');
			if (leaveBtn) {
				leaveBtn.addEventListener('click', () => {
					this.destroy();
					setCurrentTournament(null);
					player?.resetPosition();
					navigateTo("/home");
				});
			}
		}
	}

	generateBracket(bracket: number[][][]): void {
		let roundId = 0;

		bracket.forEach((round) => {
			this._games.push([]);
			round.forEach((game) => {
				const match: Match = {
					player1: game[0],
					player2: game[1]
				}
				this._games[roundId].push(match);
			});
			roundId++;
		});
	}

	async updateBracket() {
		try {
			const response = await http.get(`/matchmaking/tournaments/${this._id}`, {});

			if (!response.data.success) {
				console.error('Could not get info from backend');
				return;
			}

			const bracketData = response.data.tournament.bracket;
			let bracket: number[][][];

			if (typeof bracketData === 'string')
				bracket = JSON.parse(bracketData);
			else
				bracket = bracketData;

			if (!bracket || ! Array.isArray(bracket) || bracket.length === 0) {
				console.error('Empty bracket received');
				return;
			}

			let roundId = 0;

			if (this._state === 'finished')
				return;

			bracket.forEach((round) => {
				if (!this._games[roundId])
					this._games.push([]);
				let gameIndex = 0;
				round.forEach((game) => {
					if (this._games[roundId][gameIndex]) {
						// maybe check if player1 and player2 are good
						if (this._games[roundId][gameIndex].player1 === -1 || this._games[roundId][gameIndex].player1 === null)
							this._games[roundId][gameIndex].player1 = game[0];
						if (this._games[roundId][gameIndex].player2 === -1 || this._games[roundId][gameIndex].player2 === null)
							this._games[roundId][gameIndex].player2 = game[1];
						this._games[roundId][gameIndex].winner = game[2];
					}
					else {
						const match: Match = {
							player1: game[0],
							player2: game[1],
							winner: game[2] !== -1 ? game[2] : undefined
						}
						this._games[roundId].push(match);
					}
					gameIndex++;
				});
				roundId++;
			});
		} catch (error) {
			console.error('updateBracket failed:', error);
		}
	}

	async createEndScreen(): Promise<void> {
		const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-5 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
			transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl cursor-pointer";

		let winner: User | null = this.getPlayerById(this._ranking[0]);
		if (!winner)
			winner = await getUserById(this._ranking[0]);
		if (!winner) {
			console.error("Could not get tournament winner, final ranking:", this._ranking);
			return;
		}
		const winnerUsername = winner.username;
		
		this._endScreen.innerHTML = '';
		this._endScreen.className = "z-40 flex flex-col items-center";
		this._endScreen.appendChild(html `
			<p class="pt-10 text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl">${winnerUsername} won!</p>
		`);
			
		// display results
		const finalRanking = document.createElement('div');
		finalRanking.className = "max-h-[80%] rounded-4xl border-8 border-solid border-white p-5 m-5 bg-black/10 backdrop-blur-sm animate-zoomin w-auto";
		finalRanking.appendChild(html `
			<p class="text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl">Final Rankings</p>
		`);

		for (let i = 0; i < this._ranking.length; i++) {
			let txtColor = "";
			let user: Partial<User> | null = this.getPlayerById(this._ranking[i]);
			if (!user)
				await getUserById(this._ranking[i]);
			if (!user) {
				console.error("Error while getting user for final ranking");
				user = { id: -1, username: "unknown", avatar: 2 };
			}

			if (i === 0)
				txtColor = "text-gold";
			else if (i === 1)
				txtColor = "text-silver";
			else if (i === 2)
				txtColor = "text-bronze";

			if (user.id === player?.getAccountID())
				txtColor += " rounded-lg bg-white/10";

			finalRanking.appendChild(html `
				<div class="grid grid-cols-3 m-2 items-center text-md sm:text-xl md:text-4xl text-center ${txtColor}">
					<p>${(i + 1).toString()}.</p>
					<p>${user.username}</p>
					<img src="${user.profilePicture || Player.getIconPathBySkinId(user.avatar || 0)}" class="max-w-10 md:max-w-16 lg:max-w-20 mx-4 rounded-full" />
				</div>
			`);
		}

		this._endScreen.appendChild(finalRanking);

		this._endScreen.appendChild(html `
			<button id="leaveTournament" type="button" class="absolute bottom-10 ${btnClass}">
				Leave Tournament
			</button>
		`);

		let parentElement = document.getElementById('tournament');
		if (parentElement)
			this.displayEndScreen();
	}
	
	displayEndScreen(): void {
		let parentElement = document.getElementById('tournament');

		// console.log('Displaying tournament end screen');

		// console.log('Displaying tournament end screen');

		if (!parentElement) {
			const root = document.getElementById('root');
			parentElement = document.createElement('div');
			parentElement.id = "tournament";
			root?.appendChild(parentElement);
		}

		while (parentElement.firstChild) {
			parentElement.removeChild(parentElement.firstChild);
		}
		parentElement.innerHTML = '';

		const bracket = document.getElementById('bracket');
		if (bracket)
			bracket.remove();

		parentElement.appendChild(this._endScreen);

		const leaveBtn = document.getElementById('leaveTournament');
		if (leaveBtn) {
			leaveBtn.addEventListener('click', () => {
				this.destroy();
				setCurrentTournament(null);
				player?.resetPosition();
				navigateTo("/home");
			});
		}
		else {
			setTimeout(() => {
				this.destroy();
				setCurrentTournament(null);
				player?.resetPosition();
				navigateTo("/home");
			}, 5000);
		}
	}

	changeState(newState: typeof this._state): void {
		if (newState === this._state)
			return;

		this._waitingScreen.remove();
		this._bracket.remove();
		this._endScreen.remove();
		this._invitesDiv.remove();

		// console.log('Changing state to:', newState);
		const oldState = this._state;
		this._state = newState;

		switch (newState) {
			case 'pending':
				this.displayWaitingScreen();
				break;
			case 'in_progress':
				this.displayBracket();
				break;
			case 'finished':
				this.createEndScreen();
				break;
			default:
				console.error('Invalid new tournament state:', newState);
				this._state = oldState;
				return;
		}
	}

	displayActualState() {
		this._waitingScreen.remove();
		this._bracket.remove();
		this._endScreen.remove();
		this._invitesDiv.remove();

		switch (this._state) {
			case 'pending': {
				this.displayWaitingScreen();
				break;
			}
			case 'in_progress': {
				// this._waitingScreen.remove();
				this.displayBracket();
				break;
			}
			case 'finished': {
				// this._bracket.remove();
				this.displayEndScreen();
				break;
			}
		}
	}

	update(data: any) {
		if (!data || !data.update) {
			console.error("Unvalid data format received");
			return;
		}

		// console.log('Update msg received:', data);

		switch (data.update) {
			case ("playerJoined"):
				if (this._state === 'pending')
					this.addPlayer(data.playerid);
				break;
			case ("playerLeft"):
				this.removePlayer(data.playerid);
				break;
			case ("gameResult"):
				this.hideWaitingOverlay();
				this.updateBracket().then(() => {
					if (getCurrentPath() === "/tournament-overview")
						this.displayBracket();
				});
				break;
			case ("status"):
				this.changeState(data.status);
				break;
			case ("endTournament"):
				this._ranking = data.ranking;
				this.changeState("finished");
				break;
			case ("waitingForPlayer"):
				// Only shown to the connected player waiting for their opponent
				this.showWaitingForPlayerOverlay(data.disconnectedPlayerId);
				break;
			case ("forfeit"):
				this.hideWaitingOverlay();
				this.showForfeitNotification(data.winnerId, data.loserId);
				this.updateBracket().then(() => {
					if (getCurrentPath() === "/tournament-overview")
						this.displayBracket();
				});
				break;
			case ("hideWaiting"):
				this.hideWaitingOverlay();
				break;
			default:
				console.error("Unknown update type received:", data.update);
		}
	}

	getId(): number { return this._id; }

	setEliminated(value: boolean) { this._eliminated = value; }

	private _waitingOverlay: HTMLElement | null = null;

	private async showWaitingForPlayerOverlay(disconnectedPlayerId: number): Promise<void> {
		const username = await getUsernameByID(disconnectedPlayerId);
		this.showWaitingOverlay(`Waiting for ${username || `Player ${disconnectedPlayerId}`} to reconnect...`, 30);
	}

	public async showWaitingForOpponent(opponentId: number, timeoutSeconds: number): Promise<void> {
		const username = await getUsernameByID(opponentId);
		this.showWaitingOverlay(`Waiting for ${username || `Player ${opponentId}`} to be ready...`, timeoutSeconds);
	}

	private showWaitingOverlay(message: string, timeoutSeconds: number): void {
		this.hideWaitingOverlay();

		this._waitingOverlay = document.createElement('div');
		this._waitingOverlay.id = "waitingReconnectOverlay";
		this._waitingOverlay.className = "fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-zoomin";
		
		const content = document.createElement('div');
		content.className = "rounded-4xl border-8 border-solid border-white p-10 bg-black/50 backdrop-blur-sm text-center";
		
		const messageEl = document.createElement('p');
		messageEl.className = "text-2xl md:text-4xl text-white mb-4";
		messageEl.textContent = message;
		
		const loadingImg = document.createElement('img');
		loadingImg.src = "/assets/icons/loading.gif";
		loadingImg.className = "mx-auto max-h-10 md:max-h-16 mb-4";
		
		const timerEl = document.createElement('p');
		timerEl.id = "reconnectTimer";
		timerEl.className = "text-xl md:text-2xl text-gray-300";
		timerEl.textContent = `Time remaining: ${timeoutSeconds}s`;
		
		content.appendChild(messageEl);
		content.appendChild(loadingImg);
		content.appendChild(timerEl);
		this._waitingOverlay.appendChild(content);
		
		document.body.appendChild(this._waitingOverlay);
		
		// Start countdown
		let remaining = timeoutSeconds;
		const countdownInterval = setInterval(() => {
			remaining--;
			const timerElement = document.getElementById('reconnectTimer');
			if (timerElement) {
				timerElement.textContent = `Time remaining: ${remaining}s`;
			}
			if (remaining <= 0) {
				clearInterval(countdownInterval);
			}
		}, 1000);
	}

	public hideWaitingOverlay(): void {
		if (this._waitingOverlay) {
			this._waitingOverlay.remove();
			this._waitingOverlay = null;
		}
		const existingOverlay = document.getElementById('waitingReconnectOverlay');
		if (existingOverlay) {
			existingOverlay.remove();
		}
	}

	private async showForfeitNotification(winnerId: number, loserId: number): Promise<void> {
		const winnerName = await getUsernameByID(winnerId);
		const loserName = await getUsernameByID(loserId);
		const winner = winnerName || `Player ${winnerId}`;
		const loser = loserName || `Player ${loserId}`;
		showNotification(`${winner} wins by forfeit! ${loser} did not reconnect in time.`, 'info');
	}

	destroy() {
		this._bracket.remove();
		this._endScreen.remove();
		this._invitesDiv.remove();
		this._waitingScreen.remove();
		this.hideWaitingOverlay();
	}

	static async createTournament(id: number): Promise<Tournament | null> {
		try {
			const response = await http.get(`/matchmaking/tournaments/${id}`, {});

			const result = response.data;

			if (!result.success) {
				showNotification('Failed to create tournament', 'error');
				return null;
			}

			const t: TournamentInterface = response.data.tournament;

			const tournament = new Tournament(id, t.maxPlayers);

			const playersIDs: number[] = JSON.parse(t.players);

			for (const p of playersIDs) {
				tournament.addPlayer(Number(p));
			}

			tournament._state = t.status;

			if (tournament._state !== 'pending') {
				await tournament.updateBracket();
			}

			return tournament;
		} catch (error) {
			console.error('Failed to create tournament:', error);
			return null;
		}
	}
}