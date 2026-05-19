import { currentTournament, getCurrentPath, navigateTo, setCurrentGame, setCurrentTournament } from "../main";
import { getUserById, isPlayerInGame, updateUser} from "../utils/usersManagement";
import { Frame } from "./Frame"
import { Game } from "./Game";
import { Tournament } from "./Tournament";
// import { PowerUp, Speed, Slow , Strike } from "./PowerUp";

declare global {
	let gameSocket: WebSocket;
}

export class MyWebSocket {

	private socket: WebSocket;
	private player?: (position: { x: number, z: number }) => void;
	private ball?: (position: { x: number, z: number }) => void;
	private gamestate?: (msg: string) => void;
	private _cam?: (cam: number, otherPlayerID: number) => void;
	private _resetcam?: (cam: number, otherPlayerID: number, f: Frame) => void;
	private _score?: (player1Score: number, player2Score: number) => void;
	private _roomid: number = 0;
	private _id: number;
	private FrameArray: Frame[] = [];
	private _ready?: (ready: boolean) => void;
	private _disconection?: (state: boolean) => void;
	private _endcallback?: (winnerId: number) => void;
	private _powerUpProc?: (type: string, player: number) => void;
	private _resetBall?: () => void;
	private _tournamentCreated: boolean = false;
	private _tournamentJoined: boolean = false;
	private _tournamentLeft: boolean = false;
	private _requestPending: boolean = false;
	
	constructor(url: string, id: number) {
		// this._id = this.generateUniqueId();
		this._id = id;
		this.socket = new WebSocket(url);
		this.socket.onopen = () => {
			// console.log('Connected to the server');
		}
		this.socket.onclose = () => {
			// console.log('CLIENT SIDE : Disconnected from the server');
		}
		this.socket.onerror = (ev: Event | any) => {
			console.error('CLIENT SIDE: websocket error', ev);
		}
		this.socket.onmessage = (event: MessageEvent<any>) => {
			try {
				const message = JSON.parse(event.data);
				this.handleWebserverMessage(message);
			} catch (error) {
				console.error('JSON parsing error:', error);
			}
		}
	}

	public waitForConnection(callback: () => Promise<void>, interval: number = 100): Promise<void> 
	{
		return new Promise((resolve, reject) => {
			const check = async () => {
				if (this.socket.readyState === 1) {
					try {
						await callback();
						resolve();
					} catch (e) {
						reject(e);
					}
				} else {
					setTimeout(check, interval);
				}
			};
			check();
		});
	}

	public requestRoom(powerUpsActive: boolean, playerid: number): Promise<{ result: string, id?: number }> {
		return new Promise((resolve, reject) => {
			this.waitForConnection(async (): Promise<void> => {
				try {
					const res = await isPlayerInGame(playerid);
					if (res !== 0) {
						this._roomid = res;
						this.sendToJson("directconnection", { id: res, playerid: playerid});
						resolve({ result: "directconnection", id: res });
						return;
					}
					this.sendToJson("roomrequest", { id: this._id, powerUps: powerUpsActive });
					resolve({ result: "roomrequest", id: res});
				} catch (e) {
					reject(e);
				}
			}).catch(reject);
		});
	}

	public joinRoom(roomId: number, playerId: number): Promise<{ result: string, id: number }> {
		return new Promise((resolve, reject) => {
			this.waitForConnection(async (): Promise<void> => {
				try {
					const res = await isPlayerInGame(playerId);
					if (res !== 0 && !currentTournament) {
						reject('Player already in a room');
						return;
					}
					this.sendToJson("joinroom", {id: roomId, playerid: playerId});
					resolve({ result: "joinroom", id: res });
				} catch (error) {
					reject(error);
				}
			}).catch(reject);
		});
	}

	public requestTournamentCreation(playerId: number, powerUpsActive: boolean, capacity: number): void {
		if (this._requestPending)
			return;
		this._tournamentCreated = false;
		this.waitForConnection(async () => {
			this.sendToJson("createTournament", { playerId: playerId, maxPlayers: capacity, powerUps: powerUpsActive });
		})
	}

	public requestTournamentJoin(tournamentId: number, playerId: number): void {
		if (this._requestPending)
			return;
		this._tournamentJoined = false;
		this.waitForConnection(async () => {
			this.sendToJson("joinTournament", { tournamentId: tournamentId, playerId: playerId });
		});
	}

	public requestTournamentLeave(tournamentId: number, playerId: number): void {
		this._tournamentLeft = false;
		this.waitForConnection(async () => {
			this.sendToJson("leaveTournament", { tournamentId: tournamentId, playerId: playerId });
		});
	}

	public requestTournamentReconnect(playerId: number): void {
		this.waitForConnection(async () => {
			// console.log(`Attempting to reconnect player ${playerId} to tournament`);
			this.sendToJson("reconnectTournament", { playerId: playerId });
		});
	}

	public setPlayerCallback(callback: (position: { x: number, z: number }) => void) {
		this.player = callback;
	}

	public setBallCallback(callback: (position: { x: number, z: number }) => void) {
		this.ball = callback;
	}

	public setReadyCallback(callback: (ready: boolean) => void) {
		this._ready = callback;
	}

	public setEndCallback(callback : (winnerId: number) => void)
	{
		this._endcallback = callback;
	}

	public setCamCallback(callback: (cam: number, otherPlayerID: number) => void) {
		this._cam = callback;
	}
	
	public resetCamCallback(callback: (cam: number, otherPlayerID: number, f: Frame) => void) {
		this._resetcam = callback;
	}

	public setDisconectionCallback(callback : (state : boolean) => void)
	{
		this._disconection = callback;
	}

	public setScoreCallback(callback: (player1Score: number, player2Score: number) => void) {
		this._score = callback;
	}

	public setPowerUpProcCallback(callback: (type: string, player: number) => void) {
		this._powerUpProc = callback;
	}

	public setResetBallCallback(callback: () => void) {
		this._resetBall = callback;
	}

	public waitTournamentCreation(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._tournamentCreated) {
				this._requestPending = false;
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				this._requestPending = false;
				clearInterval(interval);
				reject(new Error('Tournament creation timeout'));
			}, 10000);

			const interval = setInterval(() => {
				if (this._tournamentCreated) {
					this._requestPending = false;
					clearInterval(interval);
					clearTimeout(timeout);
					resolve();
				}
			}, 100);
		});
	}

	public waitTournamentJoin(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._tournamentJoined) {
				this._requestPending = false;
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				this._requestPending = false;
				clearInterval(interval);
				reject(new Error('Tournament creation timeout'));
			}, 10000);

			const interval = setInterval(() => {
				if (this._tournamentJoined) {
					this._requestPending = false;
					clearInterval(interval);
					clearTimeout(timeout);
					resolve();
				}
			}, 100);
		});
	}

	public waitTournamentLeave(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._tournamentLeft) {
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				clearInterval(interval);
				reject(new Error('Leaving tournament timeout'));
			}, 10000);

			const interval = setInterval(() => {
				if (this._tournamentLeft) {
					clearInterval(interval);
					clearTimeout(timeout);
					resolve();
				}
			}, 100);
		});
	}

	private async waitForCamCallback(cam: number, otherPlayerID: number): Promise<void> {
		return new Promise((resolve) => {
			if (this._cam) {
				this._cam(cam, otherPlayerID);
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				clearInterval(interval);
				// reject(new Error('Camera callback timeout - callback was never set'));
				console.error('Camera callback timeout - callback was never set');
				return;
			}, 5000);
	
			const interval = setInterval(() => {
				if (this._cam) {
					clearInterval(interval);
					clearTimeout(timeout);
					this._cam(cam, otherPlayerID);
					resolve();
				}
			}, 100);
		});
	}

	private async handleWebserverMessage(message: any) {
		switch (message.type) {
			case "stateframe":
				{
					const frame = new Frame(message.data.player1, message.data.player2, message.data.ball, message.data.powerUps);
					if (!frame) {
						console.error("Error while generating frame");
						return;
					}
					this.addToQueue(frame);
					break;
				}
			case "gamestate":
				{
					// if (message.data.state === "ready")
					// 	this._ready?.(true);
					if (message.data.state === "end")
						this._endcallback?.(message.data.winnerId);
					break;
				}
			case "camera":
				{
					if (!this._cam)
						await this.waitForCamCallback(message.data.cam === "1" ? 1 : 2, message.data.otherPlayer);
					else if (message.data.cam === "1") 
					{
						this._cam?.(1, message.data.otherPlayer);
					}
					else if (message.data.cam === "2")
					{
						this._cam?.(2, message.data.otherPlayer);
					}
					break;
				}
			case "resetcamera":
				{
					const frame: Frame = new Frame(message.data.frame.player1, message.data.frame.player2, message.data.frame.ball, message.data.frame.powerUps);
					if (message.data.cam === "1")
						this._resetcam?.(1, message.data.otherPlayerID, frame);
					else if (message.data.cam === "2")
						this._resetcam?.(2, message.data.otherPlayerID, frame);
					break;
				}
			case "room":
				{
					this._roomid = message.data.roomid;
					if (currentTournament)
						Game.joinRoom(this._roomid);
					break;
				}
			case "warn":
				{
					if (this._disconection)
					{
						this._disconection(true);
						this.sendToJson("test", this._id);
					}
					else
						console.error("Warn received from server but disconection callback is undefined");
					break;
				}
			case "resume":
				{
					if (this._disconection)
						this._disconection(false);
					else
						console.error("Resume received from server but disconection callback is undefined");
					break;
				}
			case "score":
				{
					this._score?.(message.data.player1Score, message.data.player2Score);
					break;
				}
			case "powerUpProc":
				{
					this._powerUpProc?.(message.data.type, message.data.player);
					break;
				}
			case "resetBall":
				{
					this._resetBall?.();
					break;
				}
			case "tournamentCreated":
				{
					if (message.data !== "failed") {
						this._tournamentCreated = true;
						const tournamentId = Number(message.data.tournamentid);
						if (!Number.isNaN(tournamentId)) {
							setCurrentTournament(await Tournament.createTournament(tournamentId));
							updateUser({ currentTournamentID: tournamentId });
						}
					}
					break;
				}
			case "tournamentJoined":
				{
					if (message.data !== "failed") {
						this._tournamentJoined = true;
						const tournamentId = Number(message.data.tournamentid);
						if (!Number.isNaN(tournamentId)) {
							setCurrentTournament(await Tournament.createTournament(tournamentId));
							updateUser({ currentTournamentID: tournamentId });
						}
					}
					break;
				}
			case "tournamentLeft":
				{
					if (message.data !== "failed") {
						this._tournamentLeft = true;
						const tournamentId = Number(message.data.tournamentid);
						if (!Number.isNaN(tournamentId)) {
							currentTournament?.destroy();
							setCurrentTournament(null);
							updateUser({ currentTournamentID: null });
							navigateTo("/home");
						}
					}
					break;
				}
			case "updateTournament":
				{
					if (currentTournament)
						currentTournament.update(message.data);
					break;
				}
			case "bracketready":
				{
					const bracket: number[][][] = message.data.bracket;
					if (currentTournament && bracket) {
						currentTournament.generateBracket(bracket);
						currentTournament.changeState('in_progress');
					}
					break;
				}
			case "eliminated":
				{
					if (currentTournament && currentTournament.getId() === message.data.tournamentId) {
						currentTournament.setEliminated(true);
						// Re-display bracket so the leave button appears
						if (getCurrentPath() === "/tournament-overview")
							currentTournament.displayBracket();
					}
					break;
				}
			
			case "waitingForOpponent":
				{
					// Show waiting overlay to the player who is ready, waiting for opponent
					if (currentTournament) {
						currentTournament.showWaitingForOpponent(message.data.opponentId, message.data.timeoutSeconds);
					} else {
						// If not in tournament, show a generic notification
						console.log(`Waiting for opponent (ID: ${message.data.opponentId}) to be ready. Timeout: ${message.data.timeoutSeconds}s`);
					}
					break;
				}
			case "hideWaitingForOpponent":
				{
					if (currentTournament) {
						currentTournament.hideWaitingOverlay();
					}
					break;
				}
		}
	}
	
	public leftGame() {
		if (this._disconection)
			this._disconection(true);
		this.sendToJson("gameLeft", {});
	}

	public send(message: any) {
		try {
			if ((this.socket as any).readyState !== WebSocket.OPEN) {
				console.warn('CLIENT SIDE: sending on socket not OPEN, readyState=', (this.socket as any).readyState);
			}
			this.socket.send(message);
		} catch (e) {
			console.error('CLIENT SIDE: socket.send failed', e);
		}
	}

	public sendToJson(type: string, data: any) {
		const msg = {
			type: type,
			data: data,
			timestamp: Date.now()
		};
		this.send(JSON.stringify(msg));
	}

	public generateUniqueId(): number {
		return (Math.floor(Math.random() * 100 + 1));
	}

	private addToQueue(frame: Frame) {
		const maxSize: number = 2;
		if (this.FrameArray.length >= maxSize)
			this.FrameArray.shift();
		this.FrameArray.push(frame);
	}

	public destroyCamCallback() {
		this._cam = undefined;
	}

	public close() {
		this.socket.close();
	}

	public getFrames(): Frame[] {
		return this.FrameArray;
	}

	public getId(): number
	{
		return this._id;
	}

	public getRoomId(): number
	{
		return this._roomid;
	}

	public setRoomId(roomId: number): void
	{
		this._roomid = roomId;
	}
}