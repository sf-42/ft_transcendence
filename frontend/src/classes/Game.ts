import { html } from "../utils/html";
import { Player } from "./Player";
import { Ball } from "./Ball";
import { navigateTo, setCurrentGame, socialOverlay, player, currentTournament, getCurrentPath } from "../main";
import { scene, light, resetCameraAndLight, setGameCamera, updateCameraRadius } from "../utils/babylonInit";
import { MyWebSocket } from "./Network";
import { PlayerInput, mobileInputs } from "./PlayerInput";
import { Frame } from "./Frame";
import { Scene, Vector3, MeshBuilder, Color4, GlowLayer, StandardMaterial, Color3, TransformNode, AbstractMesh, ImportMeshAsync, Animation, Observer } from "@babylonjs/core";
import { getUserById, getUsernameByID, isPlayerInGame } from "../utils/usersManagement";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import { PowerUp, Strike, Slow, Speed} from "./PowerUp";
import { clientWs } from "../main";
import http from "../utils/http";
import { showNotification } from "../utils/ToastifyNotification";

/* 
	What should be inside:
		- Score - Find a way to store the score ✅
		- Loading screen ✅
		- Starting screen (countdown) ✅
		- Pause button?

	What should be in DB:
		gameID: string;
		player1ID: string | null;
		player2ID: string | null;
		score: number[]; // check how to correctly store it
		powerUps: boolean;
		tournament: boolean;

	Also in DB, maybe have a queue of games or directly find the first game which is missing a player
*/

const EPSILON = 1e-2;

enum GameState { WAITING = 'waiting', STARTING = 'starting', INPROGRESS = 'in progress', END = 'end' }

interface powerUpsTimers {
	player1Speed: number,
	player1Slow: number,
	player2Speed: number,
	player2Slow: number
}

export class Game {
	private _gameID: number = 0;
	private _state: GameState;
	private _score: number[] = [0, 0];
	private _gameParentElement: HTMLElement | null = null;
	private _scoreBox: HTMLElement;
	private _loadingScreen: HTMLElement;
	private _startingScreen: HTMLElement;
	private _endGameScreen: HTMLElement;
	private _mobileControls: HTMLElement;
	private _invitesDiv: HTMLElement;
	private _client: Player;
	private _player1: Player | null = null;
	private _player2: Player | null = null;
	private _ball: Ball;
	private _powerups: PowerUp[] = new Array<PowerUp>();
	private _webSocket: MyWebSocket | null;
	private _socketsetup: boolean = false;
	private _playerInput: PlayerInput | null = null;
	private _field: TransformNode | null = null;
	private _winnerTrophy: AbstractMesh | null = null;
	private _powerUpsActive: boolean;
	private _powerUpsTimers: powerUpsTimers = { player1Speed: 0, player1Slow: 0, player2Speed: 0, player2Slow: 0 };
	private _gameObserver: Observer<Scene> | null = null;
	private _tournament: boolean;

	constructor(gameCreator: Player, powerUpsActive: boolean, tournament: boolean = false) {
		this._state = GameState.WAITING;
		this._tournament = tournament;
		this._client = gameCreator;
		this._powerUpsActive = powerUpsActive;
		this._ball = new Ball(scene, false);
		
		this._scoreBox = document.createElement('div');
		this._scoreBox.id = "scoreBox";
		this._loadingScreen = document.createElement('div');
		this._loadingScreen.id = "loadingScreen";
		this._startingScreen = document.createElement('div');
		this._startingScreen.id = "startingScreen";
		this._endGameScreen = document.createElement('div');
		this._endGameScreen.id = "endGameScreen";
		this._mobileControls = document.createElement('div');
		this._mobileControls.id = "mobileControls";
		this._invitesDiv = document.createElement('div');
		this._invitesDiv.id = "inviteFriends";
		
		this._webSocket = clientWs;
		if (!this._webSocket) {
			console.error('No web socket connected');
			navigateTo('/home');
			return;
		}

		isPlayerInGame(player!.getAccountID()).then((gameId) => {
			this._gameID = gameId;
		});
	}

	renderLoadingScreen(): void {
		this._gameParentElement = document.getElementById('gameDiv');
		if (!this._gameParentElement)
			console.error('Could not get gameDiv element.');

		this._loadingScreen.innerHTML = '';

		this._loadingScreen.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-4xl border-8 \
		border-solid border-white p-8 bg-black/10 animate-zoomin backdrop-blur-sm";
		this._loadingScreen.appendChild(
			html `
			<div>
				<p class="text-5xl lg:text-6xl xl:text-8xl 2xl:text-9xl text-center">Waiting for your opponent...</p>
				<img src="/assets/icons/loading.gif" class="mx-auto max-h-10 md:max-h-16 lg:max-h-20 xl:max-h-30" />
			</div>
			`
		);

		const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-5 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
		transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl cursor-pointer";

		this._loadingScreen.appendChild(
			html `
			<div class="flex flex-col items-center">
				<button type="button" id="invite-friends" class="${btnClass}">Invite friends</button>
				<button type="button" id="cancel" class="${btnClass}">Cancel</button>
			</div>
			`
		);

		if (!this._gameParentElement) {
			this._gameParentElement = document.getElementById('gameDiv');
			if (!this._gameParentElement) {
				const root = document.getElementById('root');
				this._gameParentElement = document.createElement('div');
				this._gameParentElement.id = "gameDiv";
				root?.appendChild(this._gameParentElement);
			}
		}
		this._gameParentElement.appendChild(this._loadingScreen);

		const inviteBtn = document.getElementById('invite-friends');
		if (inviteBtn) {
			inviteBtn.addEventListener('click', () => {
				this.displayFriendsList();
			});
		}

		const cancelBtn = document.getElementById('cancel');
		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				this.destroy();
				setCurrentGame(null);
				this.removeGameFromQueue();
				navigateTo("/simplegame");
			});
		}
		else
			console.error("Could not get cancel button.");
		if (this._socketsetup === false)
			this.setUpSocket();
		if (this._socketsetup === true)
			this._webSocket?.sendToJson("test", this._webSocket.getId());
	}

	private async removeGameFromQueue() {
		if (player) {
			if (!this._gameID) {
				this._gameID = await isPlayerInGame(player.getAccountID());
			}

			this._webSocket?.sendToJson("leavegame", { id: this._gameID, playerid: player.getAccountID() });
		}
	}

	private async displayFriendsList() {
		try {
			const response = await http.get('/chat/friends', {});

			if (!this._gameID)
				this._gameID = await isPlayerInGame(player!.getAccountID());
			
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
			});

			if (friends.length === 0) {
				friendsList.innerText = "You do not have any friend to invite :(";
			}
			else {
				const chatWs = socialOverlay.getWs();
				friends.forEach(async (friend: any) => {
					const friendId = friend.id;
					const username = await getUsernameByID(friendId);
					const friendEl = document.createElement('div');
					friendEl.className = "p-2 my-1 bg-white/10 rounded-lg transition flex items-center";
					
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
								type: 'game-invite',
								to: friendId,
								message: 'You have a been invited to a game!',
								content: this._gameID
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
			this._gameParentElement?.appendChild(this._invitesDiv);
		} catch (error) {
			console.error('displayFriendsList failed:', error);
		}
	}

	private async resetCam(cam: number, otherPlayerID: number, f: Frame)
	{
		const player1pos = f.getPlayer1pos();
		const player2pos = f.getPlayer2pos();
		cam === 1 ? this._player1 = this._client : this._player2 = this._client;
		let playerpos1or2 = cam === 1 ? player1pos : player2pos;
		const otherPos = cam === 1 ? player2pos : player1pos;
		let zpos1or2 = cam === 1 ? -32 : 32;
		setGameCamera(cam);
		if (cam === 1) {
			light.position.z = -5;
			light.direction.z = 1;
		}
		this._client.setYPosition(11.5);
		this._client.setXPosition(playerpos1or2.x);
		if (cam === 2)
			this._client.setYRotation(Math.PI);
		const ballPos = f.getBallpos();
		this._ball.setPosition(ballPos.x, ballPos.z);
		if (!this._player1 || !this._player2) {
			getUserById(otherPlayerID).then((otherPlayer) => {
				if (otherPlayer) 
				{
					const newPlayer = Player.createPlayerFromUser(otherPlayer);
					if (cam === 1)
						this._player2 = newPlayer;
					else 
						this._player1 = newPlayer;
				}
				else 
				{
					console.error("Could not get the other player infos.");
					if (cam === 1) 
						this._player2 = new Player(-1, 2, 3, "Player 2", true);
					else 
						this._player1 = new Player(-1, 1, 3, "Player 1", true);
				}
				const other = cam === 1 ? this._player2 : this._player1;
				setTimeout(() => {
					this._client.setZPosition(zpos1or2);
					other?.setState("onBike");
					other?.setYPosition(11.5);
					other?.setYRotation(cam === 1 ? Math.PI : 0);
					other?.setZPosition(cam === 1 ? 32 : -32)
					other?.setXPosition(otherPos.x);
					this.changeState(GameState.STARTING);
				}, 1000);
			}).catch((e) => {
				console.error('Error fetching other player:', e);
			});
		}
	}

	private async setUpSocket(join: boolean = false): Promise<void> {
		this._webSocket?.resetCamCallback((cam: number, otherPlayerID: number, f: Frame) => {
			this.resetCam(cam, otherPlayerID, f);
		});
		this._webSocket?.setEndCallback((winnerId: number) => {
			this.changeState(GameState.END, winnerId);
		});
		this._webSocket?.setPlayerCallback((position: { x: number, z: number }) => {
			if (this._state !== GameState.END)
				this.updatePlayerPos(position.x, position.z);
		});
		this._webSocket?.setBallCallback((position: { x: number, z: number }) => {
			if (this._state !== GameState.END)
				this.updateBallPos(position.x, position.z);
		});

		let success: boolean = false;
		if (this._tournament)
			success = true;
		else if (join) {
			const res = await clientWs?.joinRoom(this._gameID, player!.getAccountID());

			if (res?.result === "error") {
				this.destroy();
				setCurrentGame(null);
				navigateTo("/home");
				return;
			}
			else if (res?.result === "joinroom")
				success = true;
		}
		else {
			const res = await this._webSocket?.requestRoom(this._powerUpsActive, this._client.getAccountID());
			
			if (res?.result === "error")
			{
				this.destroy();
				setCurrentGame(null);
				navigateTo("/home");
				return;
			}
			else if (res?.result === "roomrequest") {
				success = true;
				this._gameID = res.id!;
			}
		}

		if (success) {
			this._webSocket?.setCamCallback((cam: number, otherPlayerID: number) => {
				if (cam === 1)
				{
					this._player1 = this._client;
					setGameCamera(1);
					light.position.z = -5;
					light.direction.z = 1;
					this._client.setState("onBike");
					this._client.setZPosition(-32);
					this._client.setYPosition(11.5);
					getUserById(otherPlayerID).then((newPlayer) => {
						if (newPlayer)
							this._player2 = Player.createPlayerFromUser(newPlayer, true);
						else {
							console.error("Could not get the other player infos.");
							this._player2 = new Player(-1, 2, 3, "Player 2", true);
						}
						setTimeout(() => {
							this._player2?.setState("onBike");
							this._player2?.setZPosition(32);
							this._player2?.setYPosition(11.5);
							this._player2?.setYRotation(Math.PI);
							this.changeState(GameState.STARTING);
						}, 1000);
					});
				}
				else if (cam === 2)
				{
					this._player2 = this._client;
					setGameCamera(2);
					this._client.setState("onBike");
					this._client.setZPosition(32);
					this._client.setYPosition(11.5);
					this._client.setYRotation(Math.PI);
					getUserById(otherPlayerID).then((newPlayer) => {
						if (newPlayer)
							this._player1 = Player.createPlayerFromUser(newPlayer, true);
						else {
							console.error("Could not get the other player infos.");
							this._player1 = new Player(-1, 2, 3, "Player 1", true);
						}
						setTimeout(() => {
							this._player1?.setState("onBike");
							this._player1?.setZPosition(-32);
							this._player1?.setYPosition(11.5);
							this.changeState(GameState.STARTING);
						}, 1000);
					});
				}
				window.addEventListener('resize', updateCameraRadius);
			});	
		}
		
		this._webSocket?.setScoreCallback((player1Score: number, player2Score: number) => {
			if (this._score[0] !== player1Score || this._score[1] !== player2Score) {
				if (this._score[0] !== player1Score)
					this._score[0] = player1Score;
				if (this._score[1] !== player2Score)
					this._score[1] = player2Score;
				this.updateScore();
			}
		});

		// this._webSocket?.setReadyCallback(() => {
		// 	this.changeState(GameState.STARTING);
		// });

		this._webSocket?.setDisconectionCallback((state: boolean) => {
			if (state)
				this.changeState(GameState.WAITING);
			else {
				setTimeout(() => {
					this.changeState(GameState.STARTING);
				}, 1000);
			}
		});

		this._webSocket?.setPowerUpProcCallback((type: string, player: number) => {
			switch (player) {
				case 1: {
					if (type === "speed") {
						this._powerUpsTimers.player1Speed = Date.now() + 10000;
						const powerUpIcon = document.getElementById('speedPlayer1');
						if (powerUpIcon) {
							powerUpIcon.classList.remove("hidden");
							void powerUpIcon.offsetWidth;
							powerUpIcon.classList.add("animate-zoomin");
						}
						else
							console.error("Could not get power up icon.");
					}
					else if (type === "slow") {
						this._powerUpsTimers.player1Slow = Date.now() + 5000;
						const powerUpIcon = document.getElementById('slowPlayer1');
						if (powerUpIcon) {
							powerUpIcon.classList.remove("hidden");
							void powerUpIcon.offsetWidth;
							powerUpIcon.classList.add("animate-zoomin");
						}
						else
							console.error("Could not get power up icon.");
					}
					else
						console.error("Invalid power type received:", type);
					break;
				}
				case 2: {
					if (type === "speed") {
						this._powerUpsTimers.player2Speed = Date.now() + 10000;
						const powerUpIcon = document.getElementById('speedPlayer2');
						if (powerUpIcon) {
							powerUpIcon.classList.remove("hidden");
							void powerUpIcon.offsetWidth;
							powerUpIcon.classList.add("animate-zoomin");
						}
						else
							console.error("Could not get power up icon.");
					}
					else if (type === "slow") {
						this._powerUpsTimers.player2Slow = Date.now() + 5000;
						const powerUpIcon = document.getElementById('slowPlayer2');
						if (powerUpIcon) {
							powerUpIcon.classList.remove("hidden");
							void powerUpIcon.offsetWidth;
							powerUpIcon.classList.add("animate-zoomin");
						}
						else
							console.error("Could not get power up icon.");
					}
					else
						console.error("Invalid power type received:", type);
					break;
				}
				default: {
					console.error("Invalid player in power up proc:", player);
					break;
				}
			}
		});
		
		this._webSocket?.setResetBallCallback(() => {
			this._ball.resetPosition();
			// destroy power ups
			this._powerups.forEach((powerUp) => {
				powerUp.destroy();
			});
			// reset players tilt
			this._player1?.onBikeIdle();
			this._player1?.setXPosition(0);
			this._player1?.rotateOnBikeModel();
			this._player2?.onBikeIdle();
			this._player2?.setXPosition(0);
			this._player2?.rotateOnBikeModel();
		});

		this._playerInput = new PlayerInput(scene, this._webSocket!);

		this._gameObserver = scene.onBeforeRenderObservable.add(() => {
			this._updateGameLogic();
		});
		// boolean in case of disconnection socket is not setted up again after rendering loading screen
		this._socketsetup = true;
	}

	private renderCountdown(): void {
		const txtClass = "text-5xl lg:text-6xl xl:text-8xl 2xl:text-9xl text-center"
		this._startingScreen.innerHTML = '';

		this._startingScreen.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2";
		this._startingScreen.appendChild(
			html `
			<div class="flex flex-col items-center">
				<p class="${txtClass}">The game begins in</p>
				<span class="${txtClass} animate-zoomin" id="countdown"><br /></span>
			</div>
			`
		);

		if (!this._gameParentElement) {
			this._gameParentElement = document.getElementById('gameDiv');
			if (!this._gameParentElement) {
				const root = document.getElementById('root');
				this._gameParentElement = document.createElement('div');
				this._gameParentElement.id = "gameDiv";
				root?.appendChild(this._gameParentElement);
			}
		}

		this._gameParentElement.appendChild(this._startingScreen);

		if (!this._playerInput)
			this.setUpSocket();

		let num = 3;
		const countdownNumber = this._startingScreen.querySelector('#countdown') as HTMLElement;

		if (countdownNumber) {
			const interval = setInterval(() => {
				countdownNumber.classList.remove("animate-zoomin");
				void countdownNumber.offsetWidth;

				if (num > 0)
					countdownNumber.textContent = num.toString();
				else if (num === 0)
					countdownNumber.textContent = "GO!";
				else {
					clearInterval(interval);
					this.changeState(GameState.INPROGRESS);
				}
				num--;
				countdownNumber.classList.add("animate-zoomin");
			}, 1000);
		}
	}

	private renderScore(): void {
		const usernameClass = "text-center text-xl sm:text-3xl lg:text-4xl xl:text-5xl mx-5";
		const scoreClass = "text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl";
		const imgClass = "max-w-10 md:max-w-14 lg:max-w-16 2xl:max-w-24 rounded-full";

		let player1Username = this._player1 ? this._player1.getUsername() : "Player 1";
		if (player1Username.length > 10)
			player1Username = player1Username.substring(0, 9) + '...';
		let player2Username = this._player2 ? this._player2.getUsername() : "Player 2";
		if (player2Username.length > 10)
			player2Username = player2Username.substring(0, 9) + '...';

		this._scoreBox.className = "absolute top-10 left-1/2 transform -translate-x-1/2 xl:w-1/2 min-h-20 animate-zoomin";

		this._scoreBox.innerHTML = '';

		this._scoreBox.appendChild(
			html `
			<div class="rounded-xl sm:rounded-4xl border-4 sm:border-8 border-solid border-white p-2 md:p-4 lg:p-6 xl:p-8 bg-black/10 backdrop-blur-sm flex items-center justify-between">
				<div class="flex items-center space-x-1 lg:space-x-4 flex-1 justify-start">
					<img src="${this._player1?.getIconPath()}" class="${imgClass}" />
					<p class="${usernameClass}">${player1Username}</p>
				</div>
				<div class="flex items-center flex-shrink-0">
					<div class="w-12 xl:w-16 text-center">
						<p class="${scoreClass}" id="player1Points"></p>
					</div>
					<div class="w-1 bg-white self-stretch mx-2 xl:mx-4"></div>
					<div class="w-12 xl:w-16 text-center">
						<p class="${scoreClass}" id="player2Points"></p>
					</div>
				</div>
				<div class="flex items-center space-x-1 lg:space-x-4 flex-1 justify-end">
					<p class="${usernameClass}">${player2Username}</p>
					<img src="${this._player2?.getIconPath()}" class="${imgClass}" />
				</div>
			</div>
			`
		);

		this.updateScore();

		if (this._powerUpsActive) {
			const powerUpIconsClass = "hidden " + imgClass;
	
			this._scoreBox.appendChild(
				html `
				<div id="powerUpsIcons" class="absolute top-full left-0 w-full mt-2 flex justify-between px-8">
					<div id="player1PowerUps" class="flex space-x-1">
						<img src="/assets/icons/flash.png" id="speedPlayer1" class="${powerUpIconsClass}" />
						<img src="/assets/icons/slow.png" id="slowPlayer1" class="${powerUpIconsClass}" />
					</div>
					<div id="player2PowerUps" class="flex space-x-1">
						<img src="/assets/icons/flash.png" id="speedPlayer2" class="${powerUpIconsClass}" />
						<img src="/assets/icons/slow.png" id="slowPlayer2" class="${powerUpIconsClass}" />
					</div>
				</div>
				`
			);
		}

		if (!this._gameParentElement) {
			this._gameParentElement = document.getElementById('gameDiv');
			if (!this._gameParentElement) {
				const root = document.getElementById('root');
				this._gameParentElement = document.createElement('div');
				this._gameParentElement.id = "gameDiv";
				root?.appendChild(this._gameParentElement);
			}
		}

		this._gameParentElement.appendChild(this._scoreBox);
	}

	private renderMobileControls(): void {
		const btnClass = "rounded-4xl bg-white/20 p-5 m-2 w-1/2 flex items-center justify-center border-2 border-transparent active:border-white active:inset-shadow-md"; // add active properties
		const iconClass = "max-h-24 opacity-80";

		this._mobileControls.innerHTML = '';

		this._mobileControls.className = "absolute bottom-4 sm:hidden flex w-full gap-2";
		this._mobileControls.appendChild(html `
			<button id="leftBtn" class="${btnClass}">
				<img class="${iconClass}" src="/assets/icons/left-arrow.png" />
			</button>
		`);
		this._mobileControls.appendChild(html `
			<button id="rightBtn" class="${btnClass}">
				<img class="${iconClass}" src="/assets/icons/right-arrow.png" />
			</button>
		`);

		if (!this._gameParentElement) {
			this._gameParentElement = document.getElementById('gameDiv');
			if (!this._gameParentElement) {
				const root = document.getElementById('root');
				this._gameParentElement = document.createElement('div');
				this._gameParentElement.id = "gameDiv";
				root?.appendChild(this._gameParentElement);
			}
		}

		this._gameParentElement.appendChild(this._mobileControls);

		const leftBtn = document.getElementById('leftBtn');
		if (leftBtn) {
			leftBtn.addEventListener('touchstart', (e) => {
				e.preventDefault();
				mobileInputs.left = true;
				leftBtn.classList.remove('border-transparent');
				leftBtn.classList.add('inset-shadow-lg', 'inset-shadow-black', 'border-white');
			});
			leftBtn.addEventListener('touchend', (e) => {
				e.preventDefault();
				mobileInputs.left = false;
				leftBtn.classList.remove('inset-shadow-lg', 'inset-shadow-black', 'border-white');
				leftBtn.classList.add('border-transparent');
			});
		}
		const rightBtn = document.getElementById('rightBtn');
		if (rightBtn) {
			rightBtn.addEventListener('touchstart', (e) => {
				e.preventDefault();
				mobileInputs.right = true;
				rightBtn.classList.remove('border-transparent');
				rightBtn.classList.add('inset-shadow-lg', 'inset-shadow-black', 'border-white');
			});
			rightBtn.addEventListener('touchend', (e) => {
				e.preventDefault();
				mobileInputs.right = false;
				rightBtn.classList.remove('inset-shadow-lg', 'inset-shadow-black', 'border-white');
				rightBtn.classList.add('border-transparent');
			});
		}
	}

	updateScore(): void {
		const player1Score = this._scoreBox.querySelector('#player1Points') as HTMLElement;
		if (player1Score) {
			const newScore = this._score[0].toString().trim();
			if (player1Score.textContent !== newScore) {
				player1Score.classList.remove('animate-zoomin');
				void player1Score.offsetWidth;
				player1Score.textContent = newScore;
				player1Score.classList.add('animate-zoomin');
			}
		}
		const player2Score = this._scoreBox.querySelector('#player2Points') as HTMLElement;
		if (player2Score) {
			const newScore = this._score[1].toString().trim();
			if (player2Score.textContent !== newScore) {
				player2Score.classList.remove('animate-zoomin');
				void player2Score.offsetWidth;
				player2Score.textContent = newScore;
				player2Score.classList.add('animate-zoomin');
			}
		}
	}

	private renderEndGameScreen(winnerId: number): void {
		const btnClass = "rounded-4xl border-8 border-solid border-white p-5 m-5 bg-black/10 backdrop-blur-sm transition-colors hover:bg-black/20 \
			transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(0,0,0,0.5)] hover:scale-110 animate-zoomin text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl cursor-pointer";
		let winner = winnerId === this._player1?.getAccountID() ? this._player1 : this._player2;
		let winnerUsername = winner?.getUsername();
		if (!winnerUsername) {
			if (this._player1 === winner)
				winnerUsername = "Player 1";
			else
				winnerUsername = "Player 2";
		}

		const trophyPositionAnimation = new Animation(
			"position",
			"position.y",
			60,
			Animation.ANIMATIONTYPE_FLOAT,
			Animation.ANIMATIONLOOPMODE_CYCLE
		);
		const posKeys = [
			{ frame: 0, value: 12.3 },
			{ frame: 30, value: 12.5 },
			{ frame: 60, value: 12.3 }
		];
		trophyPositionAnimation.setKeys(posKeys);

		const trophyRotationAnimation = new Animation(
			"rotation",
			"rotation.y",
			60,
			Animation.ANIMATIONTYPE_FLOAT,
			Animation.ANIMATIONLOOPMODE_CYCLE
		);
		const rotationKeys = [
			{ frame: 0, value: 0 },
			{ frame: 20, value: 2 * Math.PI / 3 },
			{ frame: 40, value: 4 * Math.PI / 3 },
			{ frame: 60, value: 2 * Math.PI }
		];
		trophyRotationAnimation.setKeys(rotationKeys);

		ImportMeshAsync("/assets/trophies/gold.obj", scene).then((result: any) => {
			this._winnerTrophy = result.meshes[0];
			if (this._winnerTrophy) {
				this._winnerTrophy.setEnabled(false);
				this._winnerTrophy.scaling.set(0.5, 0.5, 0.5);
				this._winnerTrophy.position = new Vector3(0, 12.3, 0);
				this._winnerTrophy.animations = [trophyPositionAnimation, trophyRotationAnimation];
			}
			resetCameraAndLight();
			this._player1?.setState("idle");
			this._player2?.setState("idle");
			this._player1?.faceCamera();
			this._player2?.faceCamera();
			if (this._player1 === winner) {
				this._player1?.setIdlePosition(new Vector3(0, 9, 0));
				this._player2?.setIdlePosition(new Vector3(-2, 9, -2));
			}
			else {
				this._player1?.setIdlePosition(new Vector3(-2, 9, -2));
				this._player2?.setIdlePosition(new Vector3(0, 9, 0));
			}
			if (this._client === this._player1) {
				this._player2?.bike.hide();
			}
			else {
				this._player1?.bike.hide();
			}
			this._winnerTrophy?.setEnabled(true);
			scene.beginAnimation(this._winnerTrophy, 0, 60, true);
		});
		
		this._endGameScreen.appendChild(html `
			<div class="z-40">
				<p class="absolute top-10 left-1/2 transform -translate-x-1/2 text-center text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl">${winnerUsername} won!</p>
				<button id="leaveGame" type="button" class="absolute bottom-10 left-1/2 transform -translate-x-1/2 ${btnClass}">
					Leave Game
				</button>
			</div>
		`);

		if (!this._gameParentElement) {
			this._gameParentElement = document.getElementById('gameDiv');
			if (!this._gameParentElement) {
				const root = document.getElementById('root');
				this._gameParentElement = document.createElement('div');
				this._gameParentElement.id = "gameDiv";
				root?.appendChild(this._gameParentElement);
			}
		}
		this._gameParentElement.appendChild(this._endGameScreen);

		let alreadyLeft = false;

		const leaveBtn = document.getElementById('leaveGame');
		if (leaveBtn) {
			leaveBtn.addEventListener('click', () => {
				alreadyLeft = true;
				scene.stopAnimation(this._winnerTrophy);
				this.destroy();
				setCurrentGame(null);
				this._client.resetPosition();
				if (this._tournament)
					navigateTo("/tournament-overview");
				else
					navigateTo("/home");
			});
		}
		else {
			setTimeout(() => {
				scene.stopAnimation(this._winnerTrophy);
				this.destroy();
				setCurrentGame(null);
				this._client.resetPosition();
				if (this._tournament)
					navigateTo("/tournament-overview");
				else
					navigateTo("/home");
			}, 5000);
		}

		if (this._tournament) {
			setTimeout(() => {
				if (!alreadyLeft) {
					scene.stopAnimation(this._winnerTrophy);
					this.destroy();
					setCurrentGame(null);
					this._client.resetPosition();
					navigateTo("/tournament-overview");
				}
			}, 5000);
		}
	}

	showBall(): void {
		this._ball.show();
	}

	hideBall(): void {
		this._ball.hide();
	}

	changeState(newState: GameState, winnerId?: number): void {
		if (!this._webSocket || getCurrentPath() !== "/game")
			return;
		this._state = newState;

		if (this._state === GameState.WAITING) {
			this.hideBall();
			this.renderLoadingScreen();
		}
		else if (this._state === GameState.STARTING) {
			this._loadingScreen.remove();
			this._invitesDiv.remove();
			this.showBall();
			this.renderScore();
			this.renderField();
			this.renderCountdown();
			this.renderMobileControls();
		}
		else if (this._state === GameState.INPROGRESS) {
			this._webSocket.sendToJson("test", this._webSocket.getId());
			this._loadingScreen.remove();
			this._invitesDiv.remove();
			this._startingScreen.remove();
			this.showBall();
			const msg = {roomid: this._webSocket.getRoomId(), playerid : this._webSocket.getId()};
			this._webSocket.sendToJson("ready", msg);
		}
		else if (this._state === GameState.END) {
			scene.onBeforeRenderObservable.remove(this._gameObserver);
			this._loadingScreen.remove();
			this._startingScreen.remove();
			this._scoreBox.remove();
			this._mobileControls.remove();
			for (const powerUp of this._powerups)
				powerUp.destroy();
			this.hideBall();
			this.hideField();
			if (winnerId)
				this.renderEndGameScreen(winnerId);
			else
				console.error("renderEndGameScreen : no winnerId");
		}
	}

	private renderField(): void {
		if (!this._field) {
			this._field = new TransformNode("field", scene);

			const edgesWidth = 10.0;
			const edgesColor = new Color4(1, 0.3, 0, 1);

			const fieldMaterial = new StandardMaterial("fieldMaterial", scene);
			fieldMaterial.alpha = 0.5;
			fieldMaterial.diffuseColor = new Color3(1, 0.3, 0);

			const leftSide = MeshBuilder.CreateBox("leftSide", {
				depth: 65,
				height: 5,
				width: 1
			});
			leftSide.parent = this._field;
			leftSide.material = fieldMaterial;
			leftSide.enableEdgesRendering();
			leftSide.edgesWidth = edgesWidth;
			leftSide.edgesColor = edgesColor;
			leftSide.position.x = -20.5;
			
			const rightSide = MeshBuilder.CreateBox("rightSide", {
				depth: 65,
				height: 5,
				width: 1
			});
			rightSide.parent = this._field;
			rightSide.material = fieldMaterial;
			rightSide.enableEdgesRendering();
			rightSide.edgesWidth = edgesWidth;
			rightSide.edgesColor = edgesColor;
			rightSide.position.x = 20.5;

			const base = MeshBuilder.CreateBox("base", {
				depth: 65,
				height: 5,
				width: 40
			});
			base.parent = this._field;
			base.material = fieldMaterial;
			base.enableEdgesRendering();
			base.edgesWidth = edgesWidth;
			base.edgesColor = edgesColor;
			base.position.y = -3;

			const glowLayer = new GlowLayer("glow", scene);
			glowLayer.addIncludedOnlyMesh(leftSide);
			glowLayer.addIncludedOnlyMesh(rightSide);
			glowLayer.addIncludedOnlyMesh(base);
			glowLayer.intensity = 1.5;
		}

		this._field.position = new Vector3(0, 12, 0);
		this._field.setEnabled(true);
	}

	hideField(): void {
		if (this._field)
			this._field.setEnabled(false);
	}

	addPlayer(newPlayer: Player): boolean {
		if (!this._player1) {
			this._player1 = newPlayer;
			return (true);
		}
		if (this._player2) {
			return (false);
		}
		this._player2 = newPlayer;
		this.changeState(GameState.STARTING);
		return (true);
	}

	public updatePlayerPos(x: number, z: number) {
		const xnum = Number(x), znum = Number(z);
		const tiltThershold = 0.1;
		const tiltSpeed = 0.08;

		if (!isFinite(xnum) || !isFinite(znum))
		{
			return;
		}

		if (z > 0) {
			const oldXPos = this._player2?.getPosition()?.x;
			this._player2?.setXPosition(x);
			if (this._player2) {
				if (oldXPos) {
					if (oldXPos > x + tiltThershold)
						this._player2?.tiltLeft();
					else if (oldXPos < x - tiltThershold)
						this._player2?.tiltRight();
					else
						this._player2?.onBikeIdle();
				}
				const current = this._player2.getOnBikeRotation();
				const target = this._player2.getTiltTarget();
				
				if (Math.abs(current - target) > 0.005)
					this._player2.rotateOnBikeModel(tiltSpeed);
				else
					this._player2.rotateOnBikeModel();
			}
		}
		else {
			const oldXPos = this._player1?.getPosition()?.x;
			this._player1?.setXPosition(x);
			if (this._player1) {
				if (oldXPos) {
					if (oldXPos > x + tiltThershold)
						this._player1.tiltRight();
					else if (oldXPos < x - tiltThershold)
						this._player1.tiltLeft();
					else
						this._player1.onBikeIdle();
				}
				const current = this._player1.getOnBikeRotation();
				const target = this._player1.getTiltTarget();
				
				if (Math.abs(current - target) > 0.005)
					this._player1.rotateOnBikeModel(tiltSpeed);
				else
					this._player1.rotateOnBikeModel();
			}
		}
	}

	public updateBallPos(x: number, z: number) {
		this._ball.setPosition(x, z);
	}

	public updatePowerUpPos(index: number, x:number, z:number)
	{
		if (this._powerups.length !== 0)
			this._powerups[index].setPosition(x, z);
	}

	public updatePowerUpArray(PowerUps: Array<{x: number, z: number, type: string}>) : void
	{
		let index: number  = 0;
		for (let i : number  = this._powerups.length - 1; i >= 0 && i < PowerUps.length; i--)
		{
			if (i > PowerUp.length - 1)
			{
				this._powerups[i].destroy();
				this._powerups.slice(i, 1);
			}
		}
		for (const elem of PowerUps)
		{
			if (!this._powerups[index])
			{
				if (elem.type === "Strike")
					this._powerups[index] = new Strike(elem.x, elem.z, scene);
				else if (elem.type === "Slow")
					this._powerups[index] = new Slow(elem.x, elem.z, scene);
				else if (elem.type === "Speed")
					this._powerups[index] = new Speed(elem.x, elem.z, scene);
			}
			else if (this._powerups[index].constructor.name !== elem.type)
			{
				this._powerups[index].destroy();
				if (elem.type === "Strike")
				{
					this._powerups[index] = new Strike(elem.x, elem.z, scene);
				}
				else if (elem.type === "Slow")
				{
					this._powerups[index] = new Slow(elem.x, elem.z, scene);
				}
				else if (elem.type === "Speed")
				{
					this._powerups[index] = new Speed(elem.x, elem.z, scene);
				}
			}
			index++;
		}
	}

	public updatePowerUpArrayPos(PowerUps: Array<{x: number, z: number, type: string}>) : void
	{
		for (let i = 0; i < PowerUps.length ; i++)
			this.updatePowerUpPos(i, PowerUps[i].x, PowerUps[i].z);	
	}

	private updatePowerUpsDisplay(): void {
		const actualTime = Date.now();

		this.updatePowerUpIcon('speedPlayer1', this._powerUpsTimers.player1Speed, actualTime);
		this.updatePowerUpIcon('slowPlayer1', this._powerUpsTimers.player1Slow, actualTime);
		this.updatePowerUpIcon('speedPlayer2', this._powerUpsTimers.player2Speed, actualTime);
		this.updatePowerUpIcon('slowPlayer2', this._powerUpsTimers.player2Slow, actualTime);
	}

	private updatePowerUpIcon(iconId: string, timerValue: number, actualTime: number): void {
		if (timerValue <= 0)
			return;

		const icon = document.getElementById(iconId);
		if (!icon)
			return;

		const timeRemaining = timerValue - actualTime;
		const pulseClasses = [
			"animate-pulse-100",
			"animate-pulse-200",
			"animate-pulse-500"
		];

		if (timeRemaining <= 0) {
			this.clearTimerByIconId(iconId);
			icon.classList.remove(...pulseClasses);
			icon.classList.add("hidden");
			return;
		}
		
		if (timeRemaining < 500) {
			if (!icon.classList.contains(pulseClasses[0])) {
				icon.classList.remove(...pulseClasses);
				icon.classList.add(pulseClasses[0]);
			}
		} else if (timeRemaining < 1000) {
			if (!icon.classList.contains(pulseClasses[1])) {
				icon.classList.remove(...pulseClasses);
				icon.classList.add(pulseClasses[1]);
			}
		} else if (timeRemaining < 2000) {
			if (!icon.classList.contains(pulseClasses[2])) {
				icon.classList.remove("animate-zoomin");
				icon.classList.remove(...pulseClasses);
				icon.classList.add(pulseClasses[2]);
			}
		}
	}

	private clearTimerByIconId(iconId: string): void {
		switch (iconId) {
			case 'speedPlayer1':
				this._powerUpsTimers.player1Speed = 0;
				break;
			case 'slowPlayer1':
				this._powerUpsTimers.player1Slow = 0;
				break;
			case 'speedPlayer2':
				this._powerUpsTimers.player2Speed = 0;
				break;
			case 'slowPlayer2':
				this._powerUpsTimers.player2Slow = 0;
				break;
		}
	}

	private _updateGameLogic(): void 
	{
		if (!this._webSocket)
			return;

		const FrameArray: Frame[] = this._webSocket.getFrames();
		if (!FrameArray || FrameArray.length < 2) {
			return;
		}
		const timestamp = Date.now() - 75;
		const prevtime = FrameArray[0].getTimeStamp();
		const nexttime = FrameArray[1].getTimeStamp();
		const prevReset = FrameArray[0].isBallReset();
		const nextReset = FrameArray[1].isBallReset();
		
		if (prevReset || nextReset) 
		{
			this.updateFrame(FrameArray[1]);
			return;
		}
			
		if (timestamp <= prevtime || timestamp >= nexttime) {
			(timestamp <= prevtime) ? this.updateFrame(FrameArray[0]) : this.updateFrame(FrameArray[1]);
			return;
		}
		const nextpowerUpArray = FrameArray[1].getPowerUps();
		if (nextpowerUpArray !== null)
			this.updatePowerUpArray(nextpowerUpArray);
		else
		{
			this._powerups.forEach((powerup) => powerup.destroy());
			this._powerups.length = 0;
		}
		this.interpol(timestamp, FrameArray, prevtime, nexttime);
	}

	private updateFrame(frame: Frame): void {
		if (!frame) return;
		const player1pos = frame.getPlayer1pos();
		const player2pos = frame.getPlayer2pos();
		const ballpos = frame.getBallpos();
		if (!player1pos || !player2pos || !ballpos) {
			return;
		}
		this.updatePlayerPos(player1pos.x, -28 );
		this.updatePlayerPos(player2pos.x, 28 );
		this.updateBallPos(ballpos.x, ballpos.z );
		this.updatePowerUpsDisplay();
		const nextpowerUpArray = frame.getPowerUps();
		if (nextpowerUpArray !== null)
			this.updatePowerUpArrayPos(nextpowerUpArray);
	}

	private interpol(timestamp: number, frames: Frame[], prevtime: number, nexttime: number): void {
		if (!frames || frames.length < 2 || !prevtime || !nexttime) {
			return;
		}
		const prevplayer1pos = frames[0].getPlayer1pos();
		const prevplayer2pos = frames[0].getPlayer2pos();
		const nextplayer1pos = frames[1].getPlayer1pos();
		const nextplayer2pos = frames[1].getPlayer2pos();
		const prevballpos = frames[0].getBallpos();
		const nextballpos = frames[1].getBallpos();
		if (!prevplayer1pos || !prevplayer2pos || !nextplayer1pos || !nextplayer2pos || !prevballpos || !nextballpos) {
			return;
		}
		
		if (Math.abs(prevplayer1pos.x - nextplayer1pos.x) <= EPSILON)
			this.updateFrame(frames[0]);

		const alpha = (timestamp - prevtime) / (nexttime - prevtime);
		const newposplayer1x : number = (Math.abs(prevplayer1pos.x - nextplayer1pos.x) <= EPSILON) ? prevplayer1pos.x : prevplayer1pos.x + (nextplayer1pos.x - prevplayer1pos.x) * alpha;
		const newposplayer2x : number = (Math.abs(prevplayer2pos.x - nextplayer2pos.x) <= EPSILON) ? prevplayer2pos.x : prevplayer2pos.x + (nextplayer2pos.x - prevplayer2pos.x) * alpha;
		this.updatePlayerPos(newposplayer1x, -28);
		this.updatePlayerPos(newposplayer2x, 28);
		const newballposx : number = (Math.abs(prevballpos.x - nextballpos.x) <= EPSILON) ? prevballpos.x : prevballpos.x + (nextballpos.x - prevballpos.x) * alpha;
		const newballposz : number = (Math.abs(prevballpos.z - nextballpos.z) <= EPSILON) ? prevballpos.z : prevballpos.z + (nextballpos.z - prevballpos.z) * alpha;
		this.updateBallPos(newballposx, newballposz);
		this.interpolPowerUpArray(frames, alpha);
	}

	private interpolPowerUpArray(frames: Frame[], alpha : number) : void
	{
		const prevpowerUpArray : Array<{x: number, z: number, type: string}> | null = frames[0].getPowerUps();
		const nextpowerUpArray : Array<{x: number, z: number, type: string}>  | null = frames[1].getPowerUps();

		if (prevpowerUpArray === null || nextpowerUpArray === null)
			return;
		for (let i = 0; i < prevpowerUpArray.length; i++)
		{
			const newPowerUpPosz : number = Math.abs(prevpowerUpArray[i].z - nextpowerUpArray[i].z) <= EPSILON ? prevpowerUpArray[i].z : prevpowerUpArray[i].z + (nextpowerUpArray[i].z - prevpowerUpArray[i].z) * alpha;
			const newPowerUpPosx : number = Math.abs(prevpowerUpArray[i].x - nextpowerUpArray[i].x) <= EPSILON ? prevpowerUpArray[i].x : prevpowerUpArray[i].x + (nextpowerUpArray[i].x - prevpowerUpArray[i].x) * alpha;
			this.updatePowerUpPos(i, newPowerUpPosx, newPowerUpPosz);
		}
	}

	destroy(): void 
	{
		if (this._client === this._player1)
			this._player2?.destroy();
		else
			this._player1?.destroy();
		if (this._powerups.length > 0) 
		{
			this._powerups.forEach((powerup) => powerup.destroy());
			this._powerups.length = 0;
		}
		if (this._playerInput)
			this._playerInput.destroy();
		this._field?.getChildMeshes().forEach((mesh) => {
			mesh.dispose();
		});
		this._field?.dispose();
		this._winnerTrophy?.dispose(); // if added to shadowCaster => remove from it
		this._ball.destroy();
		this._loadingScreen.remove();
		this._startingScreen.remove();
		this._scoreBox.remove();
		this._endGameScreen.remove();
		this._mobileControls.remove();
		clientWs?.destroyCamCallback();
	}

	static async joinRoom(roomId: number) {
		if (!player) {
			console.error('Player not set');
			return;
		}

		if (roomId === 0) {
			console.error('Invalid room id');
			return;
		}

		if (await isPlayerInGame(player.getAccountID()) === roomId && !currentTournament) {
			showNotification('You are already in the game.', 'error');
			return;
		}
		
		try {
			const result = await http.get(`/matchmaking/games/${roomId}`, {});

			if (result) {
				if (result.data.player1 && result.data.player2 && result.data.player1 !== player.getAccountID().toString() && result.data.player2 !== player.getAccountID().toString()) {
					showNotification('The room is already full', 'error');
					return;
				}
				const powerUps: boolean = result.data.powerups;
				const tournament: boolean = result.data.tournamentId ? true : false;
				const game = new Game(player, powerUps, tournament);
				game._gameID = roomId;
				game.setUpSocket(true);
				setCurrentGame(game);
				navigateTo('/game');
			}
			else {
				showNotification('The room does not exist anymore', 'error');
				// console.error("Failed to get room's info");
			}
		} catch (error) {
			if ((error as any).status === 404)
				showNotification('The room does not exist anymore', 'error');
			else
				console.error('Failed to join room:', error);
		}
	}

	static async rejoinGame(roomId: number) {
		if (!player) {
			console.error('Player not set');
			return;
		}

		if (roomId) {
			try {
				const result = await http.get(`/matchmaking/games/${roomId}`, {});

				if (result) {
					if (result.data.player1 && result.data.player2 && result.data.player1 !== player.getAccountID().toString() && result.data.player2 !== player.getAccountID().toString()) {
						showNotification('The room is already full', 'error');
						return;
					}
					const powerUps: boolean = result.data.powerups;
					let tournament: boolean = false;
					if (result.data.tournamentId)
						tournament = true;
					const game = new Game(player, powerUps, tournament);
					game._gameID = roomId;
					setCurrentGame(game);
					// Set the room ID in the websocket so getRoomId() works correctly
					clientWs?.setRoomId(roomId);
					// Send directconnection to reconnect to existing game session
					clientWs?.sendToJson("directconnection", { id: roomId, playerid: player.getAccountID() });
					game.setUpSocketForRejoin();
					navigateTo('/game');
				}
				else {
					showNotification('The room does not exist anymore', 'error');
				}
			} catch (error) {
				console.error('Failed to join room:', error);
			}
		}
	}

	// Setup socket callbacks specifically for rejoining an existing game
	private setUpSocketForRejoin(): void {
		this._socketsetup = true;
		
		this._webSocket?.resetCamCallback((cam: number, otherPlayerID: number, f: Frame) => {
			this.resetCam(cam, otherPlayerID, f);
		});
		
		this._webSocket?.setEndCallback(() => {
			this.changeState(GameState.END);
		});
		
		this._webSocket?.setPlayerCallback((position: { x: number, z: number }) => {
			if (this._state !== GameState.END)
				this.updatePlayerPos(position.x, position.z);
		});
		
		this._webSocket?.setBallCallback((position: { x: number, z: number }) => {
			if (this._state !== GameState.END)
				this.updateBallPos(position.x, position.z);
		});

		this._webSocket?.setScoreCallback((player1Score: number, player2Score: number) => {
			if (this._score[0] !== player1Score || this._score[1] !== player2Score) {
				if (this._score[0] !== player1Score)
					this._score[0] = player1Score;
				if (this._score[1] !== player2Score)
					this._score[1] = player2Score;
				this.updateScore();
			}
		});

		this._webSocket?.setReadyCallback(() => {
			this.changeState(GameState.STARTING);
		});

		this._webSocket?.setDisconectionCallback((state: boolean) => {
			if (state)
				this.changeState(GameState.WAITING);
			else
				this.changeState(GameState.INPROGRESS);
		});

		this._webSocket?.setPowerUpProcCallback((type: string, player: number) => {
			this.handlePowerUpProc(type, player);
		});
		
		this._webSocket?.setResetBallCallback(() => {
			this._ball.resetPosition();
			this._powerups.forEach((powerUp) => {
				powerUp.destroy();
			});
		});
	}

	// Extract power up handling to reusable method
	private handlePowerUpProc(type: string, playerNum: number): void {
		let iconId: string;
		
		if (playerNum === 1) {
			if (type === "speed") {
				iconId = 'speedPlayer1';
				this._powerUpsTimers.player1Speed = Date.now() + 10000;
			}
			else {
				iconId = 'slowPlayer1';
				this._powerUpsTimers.player1Slow = Date.now() + 5000;
			}
		}
		else {
			if (type === "speed") {
				iconId = 'speedPlayer2';
				this._powerUpsTimers.player2Speed = Date.now() + 10000;
			}
			else {
				iconId = 'slowPlayer2';
				this._powerUpsTimers.player2Slow = Date.now() + 5000;
			}
		}

		const powerUpIcon = document.getElementById(iconId);
		if (powerUpIcon) {
			powerUpIcon.classList.remove("hidden");
			void powerUpIcon.offsetWidth;
			powerUpIcon.classList.add("animate-zoomin");
		}
	}
}
