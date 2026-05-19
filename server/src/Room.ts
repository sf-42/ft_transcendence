import { Gamelogic } from "./Gamelogic";
import { Player } from "./Player";
import { Messages } from "./Messages";
import { WebSocket } from "ws";
import { leaveGameinDb } from "./matchmaking";
import { userHttp } from "./utils/http";
import { Tournament } from "./Tournament";
import { putTournamentBracketinDb } from "./matchmaking";

export class Room
{
    private roomId : number;
    private gameLogic?: Gamelogic;
    private players : Map<number ,Player> = new Map<number, Player>();
    private callbackSecondPlayer?: (player2 : Player) => void;
    private callbackReadyState?: () => void;
    private callbackDestroyRoom?: (winnerId: number) => void;
    private callbackRegisterSocket?: (ws: WebSocket, room: Room) => void;
    private callbackUnregisterSocket?: (ws: WebSocket) => void;
    public  destroying : boolean = false;
    private tournamentId: number | undefined;
    private tournamentmode: boolean = false;
    public powerUps: boolean;

    private constructor(Player1 : Player, roomid : number, tournamentId: number | undefined, powerUps: boolean)
    {
        this.roomId = roomid;
        this.players.set(1, Player1);
        this.powerUps = powerUps;
        if (tournamentId)
        {
            this.tournamentmode = true;
            this.tournamentId = tournamentId;
        }
    }

    public setRegisterSocketCallback(c: (ws: WebSocket, room: Room) => void)
    {
        this.callbackRegisterSocket = c;
    }

    public setUnregisterSocketCallback(c: (ws: WebSocket) => void)
    {
        this.callbackUnregisterSocket = c;
    }


    public setDestroyCallback(callback : (winnerId: number) => void)
    {
        this.callbackDestroyRoom = callback;
    }

    static create(player1: Player, roomid: number, powerUpsActive: boolean, tournamentId?: number): Room {
        const room = new Room(player1, roomid, tournamentId, powerUpsActive);
		console.log(`Creating game ${roomid} with player ${player1.getId()} and tournament ${tournamentId}, waiting for second player...`);
        room.waitingSecondPlayer().then(() => {
			console.log('Game ready, setting callbacks and else...');
            room.sendCameraPov();
            room.waitingReadyState(false).then(() =>
            {
                room.gameLogic = new Gamelogic(room.players, powerUpsActive);
                room.gameLogic.setUpdateScoreCallback(() => {
                    const message = new Messages("score", {player1Score: room.players.get(1)?.score, player2Score: room.players.get(2)?.score});
                    room.players.forEach((player) => {
                        room.sendJson(message, player.Websocket);
                    });
                });
                room.gameLogic.setSendPowerUpProcCallback((type: string, player: number) => {
                    const message = new Messages("powerUpProc", { type: type, player: player });
                    room.players.forEach((player) => {
                        room.sendJson(message, player.Websocket);
                    });
                });
                room.gameLogic.setResetBallCallback(() => {
                    const message = new Messages("resetBall", {});
                    room.players.forEach((player) => {
                        room.sendJson(message, player.Websocket);
                    })
                })
                if (room.callbackDestroyRoom != undefined)
                    room.gameLogic.setEndGameCallback((winnerId: number) => {
                        if (room.callbackDestroyRoom)
                            room.callbackDestroyRoom(winnerId);
                    });
            }).catch((error) => {
                // Timeout waiting for ready - determine winner based on who was ready
                console.log(`Room ${roomid}: ${error.message}`);
                const p1 = room.players.get(1);
                const p2 = room.players.get(2);
                let winnerId: number = -1;
                
                if (p1?.ready && !p2?.ready) {
                    winnerId = Number(p1.getId());
                    console.log(`Room ${roomid}: Player ${p1.getId()} wins by forfeit (opponent not ready)`);
                } else if (p2?.ready && !p1?.ready) {
                    winnerId = Number(p2.getId());
                    console.log(`Room ${roomid}: Player ${p2.getId()} wins by forfeit (opponent not ready)`);
                } else if (!p1?.ready && !p2?.ready) {
                    // Both not ready - give win to player1 by default
                    winnerId = Number(p1?.getId() || -1);
                    console.log(`Room ${roomid}: Neither player ready, defaulting win to ${winnerId}`);
                }
                
                // Send end game message to connected player(s) before destroying room
                const endMsg = new Messages("gamestate", { state: "end", winnerId: winnerId });
                if (p1?.Websocket.readyState == WebSocket.OPEN) {
                    room.sendJson(endMsg, p1.Websocket);
                }
                if (p2?.Websocket.readyState == WebSocket.OPEN) {
                    room.sendJson(endMsg, p2.Websocket);
                }
                
                if (room.callbackDestroyRoom && winnerId !== -1) {
                    room.callbackDestroyRoom(winnerId);
                }
            });
        });
        return room;
    }

    public resetPlayerSocket(newsocket: WebSocket, playerid: string)
    {
        this.players.forEach((player, id) => {
            if (player.getId() === playerid)
            {     
                const prevAddr = ((player.Websocket as any)?._socket)?.remoteAddress + ":" + ((player.Websocket as any)?._socket)?.remotePort;
                const newAddr = (((newsocket as any)?._socket)?.remoteAddress || 'unknown') + ":" + (((newsocket as any)?._socket)?.remotePort || 'unknown');
                console.log(`Room ${this.roomId} - reset socket for player ${playerid} - prev=${prevAddr} new=${newAddr}`);
                player.Websocket = newsocket;
                this.gameLogic?.resetPlayersocket(player, newsocket);
                this.sendCameraToPlayer(player);
            }
            else
            {
                const msg = new Messages("resume", " ");
                this.sendJson(msg, player.Websocket);
            }
        });
    }

    private async waitingSecondPlayer(): Promise<void> {

        return new Promise((resolve) => {
            this.callbackSecondPlayer = (player2: Player) => {
				console.log('Setting second player in callback');
                this.players.set(2, player2);  
                resolve();
            }
        })
    }

    private async waitingReadyState(mode: boolean): Promise<void>
    {
        if (mode)
        {
            return new Promise((resolve, reject) => 
            {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout: Le joueur ne s'est pas reconnecté"));
                }, 30000);

				console.log('Waiting for the ready state in room', this.roomId);

                this.callbackReadyState = () => {
                    if (this.players.get(1)?.ready && this.players.get(2)?.ready)
                    {
                        clearTimeout(timeout);
                        resolve();
                    }
                }
            });
        }
        else
        {
            return new Promise((resolve, reject) => 
            {
                const READY_TIMEOUT = 60000; // 60 seconds
                const NOTIFY_AFTER = 10000;  // Notify after 10 seconds if one player ready
                let notificationSent = false;
                
                // Add timeout for initial ready state too - 60 seconds for players to click ready
                const timeout = setTimeout(() => {
                    console.log(`Room ${this.roomId}: Timeout waiting for players to be ready`);
                    reject(new Error("Timeout: Players did not get ready in time"));
                }, READY_TIMEOUT);

                // Check after 10 seconds if only one player is ready, notify them
                const notifyTimeout = setTimeout(() => {
                    const p1 = this.players.get(1);
                    const p2 = this.players.get(2);
                    
                    if (p1?.ready && !p2?.ready && !notificationSent) {
                        notificationSent = true;
                        const remainingTime = Math.floor((READY_TIMEOUT - NOTIFY_AFTER) / 1000);
                        const msg = new Messages("waitingForOpponent", { 
                            opponentId: Number(p2?.getId()),
                            timeoutSeconds: remainingTime
                        });
                        this.sendJson(msg, p1.Websocket);
                        console.log(`Room ${this.roomId}: Notifying player ${p1.getId()} to wait for opponent ${p2?.getId()}`);
                    } else if (p2?.ready && !p1?.ready && !notificationSent) {
                        notificationSent = true;
                        const remainingTime = Math.floor((READY_TIMEOUT - NOTIFY_AFTER) / 1000);
                        const msg = new Messages("waitingForOpponent", { 
                            opponentId: Number(p1?.getId()),
                            timeoutSeconds: remainingTime
                        });
                        this.sendJson(msg, p2.Websocket);
                        console.log(`Room ${this.roomId}: Notifying player ${p2.getId()} to wait for opponent ${p1?.getId()}`);
                    }
                }, NOTIFY_AFTER);

                this.callbackReadyState = () => {
                    if (this.players.get(1)?.ready && this.players.get(2)?.ready)
                    {
                        clearTimeout(timeout);
                        clearTimeout(notifyTimeout);
                        
                        // If we sent a notification, tell them opponent is ready now
                        if (notificationSent) {
                            const p1 = this.players.get(1);
                            const p2 = this.players.get(2);
                            const hideMsg = new Messages("hideWaitingForOpponent", {});
                            if (p1) this.sendJson(hideMsg, p1.Websocket);
                            if (p2) this.sendJson(hideMsg, p2.Websocket);
                        }
                        
                        resolve();
                    }
                }
            });
        }
    }

    public checkReadyState() : void
    {
        if (this.callbackReadyState)
        {
            console.log("call back de ready state called");
            this.callbackReadyState();
        }
    }

    public addSecondPlayer(player2: Player)
    {
        if (this.players.size == 1 && this.callbackSecondPlayer)
        {
            this.callbackSecondPlayer(player2);
        }
		else
			console.error(`addSecondPlayer error: ${this.players.size === 1 ? 'Only 1 player' : 'Callback not set'}`);
    }

    private sendCameraPov()
    {
        let message : Messages;
        let message2 : Messages;
        const player1 = this.players.get(1);
        const player2 = this.players.get(2);
        if (!player1 || !player2)
            return ;
        try 
        {
            message = new Messages("camera", { cam: "1", otherPlayer: player2.getId() });
            message2 = new Messages("camera", { cam: "2", otherPlayer: player1.getId() });
            this.sendJson(message, player1.Websocket);
            this.sendJson(message2, player2.Websocket);
        }
        catch (e)
        {
            console.error("error problem while sending camera pov message :", e);
        }
        
    }

    private sendCameraToPlayer(player: Player)
    {
        let message : Messages;
        let player1 : Player | undefined;
        let player2 : Player | undefined;
        console.log("sending camera to player with particular func");
        if (!player)
            return;
        this.players.forEach((p,k) => {
            if (p.pos.z < 0)
                player1 = p;
            else
                player2 = p;
        });
        try
        {
            if (!player1 || !player2)
                throw ("player not found");
            const str : string = player.pos.z < 0 ? "1" : "2";
            if (!this.gameLogic)
                throw ("gamelogic undefined");
            const frame = this.gameLogic.gameStateFrameMsg();
            if (!frame)
                throw ("");
            const playerid = str === "1" ? player2.getId() : player1.getId();
            const playeridtonum : number = Number(playerid); 
            message = new Messages("resetcamera", { cam: str, otherPlayerID: playeridtonum, frame: frame});
            this.sendJson(message, player.Websocket);
        }
        catch (e)
        {
            console.error("error problem while sending camera pov to player :", e);
        }
    }

    public pingDisconnection() : void
    {
        const msg = new Messages("warn", " ");
        this.getPlayers().forEach((player, id) => {
            if (player.Websocket.readyState == WebSocket.OPEN)
                this.sendJson(msg, player.Websocket);
        });
        if (this.gameLogic)
            this.gameLogic.pause();
        this.waitingReadyState(true).then(() => {this.resume();}).catch((error) => {
            console.log(error.message);
            let winner : number = -1; 
            this.getPlayers().forEach((player, id) => {
                if (player.Websocket.readyState == WebSocket.OPEN)
                    winner = Number(player.getId());
            });
            
            // Send end game message to connected player(s) before destroying room
            const endMsg = new Messages("gamestate", { state: "end", winnerId: winner });
            this.getPlayers().forEach((player, id) => {
                if (player.Websocket.readyState == WebSocket.OPEN) {
                    this.sendJson(endMsg, player.Websocket);
                }
            });
            
            if (this.callbackDestroyRoom)
                this.callbackDestroyRoom(winner);
        });
    }

    public resume(): void
    {
        if (this.gameLogic)
            this.gameLogic.resume();
    }

    public sendJson(message : Messages, player: WebSocket) : void
    {
            const msg = {
            type: message.getType(),
            data: message.getData(),
            timestamp: Date.now()
        };
        try {
            player.send(JSON.stringify(msg));
        } catch (e) {
            console.error(`Room ${this.roomId} - error sending message to player socket:`, e);
        }
    }

    public async sendResultToDB(winnerId: number): Promise<boolean> {
        const player1 : number = Number(this.players.get(1)?.getId());
        const player2 : number = Number(this.players.get(2)?.getId());

        if (!player1 || !player2)
            return false;

        const winner = winnerId;
        const loser = winner === player1 ? player2 : player1;

        try {
            await userHttp.put(`/${winner}/game`, { win: true }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
        } catch (error) {
            console.error("Error: sendResultToDb failed:", (error as any).message);
        }
        try {
            await userHttp.put(`/${loser}/game`, { win: false }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
        } catch (error) {
            console.error("Error: sendResultToDb for user-service failed:", (error as any).message);
        }
        return (true);
    }

    public getPlayers() : Map<number, Player>
    {
        return this.players;
    }

    public getId(): number
    {
        return this.roomId;
    }

    public isPlayerinGame(ws : WebSocket) : boolean
    {
        return (this.players.get(1)?.Websocket === ws || this.players.get(2)?.Websocket === ws);
    }

    public async removePlayer(playerid: string) {
        for (const [key, p] of this.players) {
            if (p.getId() === playerid) 
            {
                const res = await leaveGameinDb(String(this.roomId), key, p.getId());
                if (res === null)
                    console.error("Server error when Promess returned in leaveGameinDb call");
                this.players.delete(key);
                if (this.callbackUnregisterSocket)
                    this.callbackUnregisterSocket(p.Websocket);
                if (this.players.size === 0)
                    this.delete();
                return;
            }
        }
    }
    
    private async updateTournamentWinnerinDb(tournamentId: number, winnerId: number, bracket: number[][][]) : Promise<boolean>
    {
        try
        {
            console.log(`Updating tournament ${tournamentId} with winner ${winnerId}`);
            if (bracket) {
                const res = await putTournamentBracketinDb(tournamentId, bracket);
                return res !== null;
            }
            return true;
        }
        catch (e)
        {
            console.error('updateTournamentWinnerinDb failed:', e);
            return false;
        }
    }

    public delete()
    {
        this.destroying = true;
        if (this.gameLogic)
            this.gameLogic.delete();
        if (this.players.size > 0)
        {
            for (const [key, p] of this.players)
            {
                const roomid = String(this.roomId);
                leaveGameinDb(roomid, key, p.getId()).catch(err =>  console.error("Server error when Promess returned in leaveGameinDb call", err));
            }
        }
        if (this.players.size > 0)
            this.players.clear();
        this.callbackSecondPlayer = undefined;
        for (const [,p] of this.players)
        {
            if (this.callbackUnregisterSocket)
                this.callbackUnregisterSocket(p.Websocket);
        }
        this.callbackUnregisterSocket = undefined;
    }
}