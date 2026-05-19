import { Rooms } from "./Rooms";
import { Room } from "./Room";
import { Player } from "./Player";
import { WebSocket } from "ws";
import { Messages } from "./Messages";
import http, { userHttp } from "./utils/http"; // axios instance avec { withCredentials: true }
import { sendJson } from "./server";
import { destroyTournamentinDb, putTournamentBracketinDb, putTournamentStatusinDb} from "./matchmaking"

const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

interface TournamentInterface {
    id: number;
    maxPlayers: number; // (4 or 8)
    status: 'pending' | 'in_progress' | 'finished';
    currentRound: number;
    powerUps: boolean;
    players: string;
    bracket: string;
    winnerId: number | null;
    
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

/*
    Bracket: 
        - round -> Rooms

    4 joueurs
        Round 0:
            Game 0
            Game 1
        Round 1:
            Game 0

    8 joueurs:
        Round 0:
            Game 0
            Game 1
            Game 2
     
            Game 3
        Round 1:
            Game 0
            Game 1
        Round 2:
            Game 0

    gagnant de round[x][y] -> round[x + 1][y / 2]
*/

export class Tournament {
    private _id: number;
    private _powerUps: boolean;
    private _maxPlayers: 4 | 8;
    private _status: 'pending' | 'in_progress' | 'finished' = 'pending';
    private _currentRound: number = 0;
    private _numberOfrounds : number = 1; 
    private _players: Player[] = [];
    private _bracket: Rooms[] = [];
    private _bracketids: number[][][] = [];
    private _winnerId: number | undefined = undefined;
	private _ranking: number[] = [];
    private _connectedplayers : number = 1;
    private _roundInitialized: boolean = false;
    public callbackRegisterSocket?: (ws: WebSocket, room: Room) => void;
    private callbackUnregisterSocket?: (ws: WebSocket) => void;
    
    private constructor (creatorId: number, creatorws : WebSocket, maxPlayers: 4 | 8, powerUps: boolean, id: number) {
        this._id = id;
        this._powerUps = powerUps;
        this._maxPlayers = maxPlayers;
        this._players.push(new Player(String(creatorId), {x:0, z:-28}, creatorws));
        this.initGamesBracket();
        this.waitingPlayers().then(() => 
        {
            this.sendTournamentBracketInfo();
            setTimeout(() => {
                this.changeState('in_progress', 0);
            }, 3000);
        });
    }
    public setRegisterSocketCallback(c: (ws: WebSocket, room: Room) => void)
    {
        this.callbackRegisterSocket = c;
    }

    public setUnregisterSocketCallback(c: (ws: WebSocket) => void)
    {
        this.callbackUnregisterSocket = c;
    }

    static async create(creatorId: number, creatorws : WebSocket , maxPlayers: 4 | 8, powerUps: boolean): Promise<Tournament | null> {
        try {
            const response = await http.post('/tournaments', { creatorId, maxPlayers, powerUps }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });

            if (response.data.success) {
                const result = response.data.tournament;
                const tournament: TournamentInterface = JSON.parse(result);
                return new Tournament(creatorId, creatorws, maxPlayers, powerUps, tournament.id);
            }
            else
                console.error('Failed to create tournament in DB');
        } catch (error) {
            console.error('Failed to create tournament in DB:', (error as any).message);
        }
        return null;
    }

    private async waitingPlayers() : Promise <void>
    {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (this._connectedplayers === this._maxPlayers)
                {
                    clearInterval(interval);
                    resolve();
                }    
            }, 300);
        });
    }

    public async addPlayer(playerid: number, ws: WebSocket) : Promise<void>
    {
        try {
            if (this._connectedplayers >= this._maxPlayers)
                throw (new Error("Tournament is full"));
			const reponse = await http.put(`/tournaments/${this._id}/join`, { id: this._id, player: playerid }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });

			if (reponse.data.success) {
				const pos = this._connectedplayers % 2 === 1 ? {x: 0, z: 28} : {x:0, z: -28};
				this._players.push(new Player(String(playerid), pos, ws));
				this._connectedplayers++;
			}
			else {
				console.error('Failed to add player to the tournament');
			}
		} catch (error) {
			console.error('addPlayer failed:', (error as any).message);
		}
    }

    public async removePlayer(playerid: number, ws: WebSocket): Promise<void>
    {
        try {
            const response = await http.put(`/tournaments/${this._id}/leave`, { id: this._id, player: playerid }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });

            if (response.data.success) {
                const newPlayers = this._players.filter(player => Number(player.getId()) !== playerid);
                const removedPlayers = this._players.length - newPlayers.length;
                this._players = newPlayers;
                this._connectedplayers -= removedPlayers;
                console.log(`Removed ${removedPlayers} from tournament ${this._id}`);
            }
            else
                console.error('Failed to remove player from the tournament');
        } catch (error) {
            console.error('removePlayer failed:', (error as any).message);
        } 
    }

    private async changeState(status: 'pending' | 'in_progress' | 'finished', roundnum? : number) : Promise<void>
    {
        this._status = status;

        if (this._status === 'in_progress')
        {    
            // this.initGamesBracket();
            // this._currentRound = roundnum !== undefined ? roundnum : 0;
            // Initialize the round if roundnum is provided
            if (roundnum !== undefined)
                this.initRound(roundnum);
        }
        else if (this._status === 'finished')
        {
            const res = await putTournamentStatusinDb(this._id, 'finished');
            if (!res)
                console.error("Changestate : error with putTournamentStatusinDb");
            const msg = new Messages("updateTournament", { update: "endTournament", ranking: this._ranking });
            this.broadCasttoPlayers(msg);
            for (const player of this._players) {
                try {
                    if (Number(player.getId()) === this._winnerId) {
                        await userHttp.put(`/${player.getId()}/tournament`, { win: true }, {
                            headers: {
                                'x-service-token': process.env.SERVICE_TOKEN || ''
                            }
                        });
                    }
                    else {
                        await userHttp.put(`/${player.getId()}/tournament`, { win: false }, {
                            headers: {
                                'x-service-token': process.env.SERVICE_TOKEN || ''
                            }
                        });
                    }
                } catch (error) {
                    console.error('Failed to send tournament result to DB:', (error as any).message);
                }
            }
            this.destroy(true);
        }
    }

    private async sendTournamentBracketInfo() : Promise<void>
    {
        let playerIds : number[] = [];
        this._players.forEach(element => {
            const id = Number(element.getId());
            playerIds.push(id);
        });
        try
        {
            let tournamentGames : number[][] = [];
            tournamentGames = makePairs(playerIds);
            let bracketids : number[][][] = [];
            bracketids.push(tournamentGames);
            const data =
            {
                bracket : bracketids 
            };
            this._bracketids = bracketids;
            this.initNextRoundIds();
            const res = await putTournamentBracketinDb(this._id, this._bracketids);
            if (!res)
                throw (new Error("sendTournamentBracketInfo failed"));
            const msg = new Messages("bracketready", data);
            console.log("sending to player bracket ready");
            this.broadCasttoPlayers(msg);
            const response = await putTournamentStatusinDb(this._id, 'in_progress');
            if (!res)
                console.error("Error: sendTournamentBrackterInfo failed: putTournamentStatusinDb call");
        }
        catch (e)
        {
            console.error("Error: sendTournamentBrackterInfo failed:", (e as any).message);
        }
    }

    private initGamesBracket()
    {
        let res: number = this._maxPlayers;
        while (res !== 2)
        {
            res /= 2;
            this._numberOfrounds++;
        }
        // Clear existing brackets
        // this._bracket = [];
        for (let i = 0; i < this._numberOfrounds; i++)
        {
            const r = new Rooms(this);
            r.setRegisterSocketCallback((ws: WebSocket, room: Room) => {this.callbackRegisterSocket?.(ws, room)});
            r.setUnregisterSocketCallback((ws: WebSocket) => {this.callbackUnregisterSocket?.(ws)});
            this._bracket.push(r);
        }
    }

    private initNextRoundIds() : void
    {
        for (let round = 1; round < this._numberOfrounds; round++)
            this._bracketids.push(this.generateRawBracketIdsbyRound(round));
    }

    private getPlayerIndexFromId(id: number): number {
        for (let i = 0; i < this._players.length; i++) {
            if (Number(this._players[i].getId()) === id)
                return i;
        }
        return -1;
    }

    private getPlayerFromId(id: number): Player | null {
        for (const player of this._players) {
            if (Number(player.getId()) === id)
                return player;
        }
        return null;
    }
    
    private extractPlayerFromBracketIds(room: number[]) : Player[]
    {
        let res : Player[] = [];
        const player1 = this.getPlayerIndexFromId(room[0]);
        const player2 = this.getPlayerIndexFromId(room[1]);
        if (player1 === -1 || player2 === -1)
        {
            console.log("Problem extracting player From bracket Ids p1 : p2 : ", player1, player2);
            return [];
        }
            res.push(this._players[player1]);
        res.push(this._players[player2]);

        return res;
    }

    public isRoundComplete() : boolean
    {
        for (const room of this._bracketids[this._currentRound])
        {
            if (room[2] === -1)
            {
                console.log("Round isnt complete room");
                return false;
            }
        }
        return true;
    }

    private generateRawBracketIdsbyRound(roundnum: number) : number[][]
    {
        let playerIds : number[] = [-1 , -1, -1];
        let res : number[][] = [];
        let numberofroooms : number = this._maxPlayers / (2 ** (roundnum + 1));
        for (let i = 0; i < numberofroooms; i++)
            res.push([...playerIds]);
        return res;
    }

    private resetPlayerinfos(player1 : Player, player2 : Player)
    {
        player1.ready = false;
        player2.ready = false;
        player1.pos.z = -28;
        player2.pos.z = 28;
        player1.pos.x = 0;
        player2.pos.x = 0;
        player1.score = 0;
        player2.score = 0;
    }

    private isPlayerConnected(player: Player): boolean {
        return player.Websocket && player.Websocket.readyState === WebSocket.OPEN;
    }

    private async waitForPlayerReconnection(player: Player, timeoutMs: number = 30000): Promise<boolean> {
        const playerId = player.getId();
        console.log(`Waiting for player ${playerId} to reconnect (timeout: ${timeoutMs}ms)...`);
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                // Check if player has reconnected (WebSocket is now OPEN)
                if (this.isPlayerConnected(player)) {
                    console.log(`Player ${playerId} reconnected!`);
                    clearInterval(checkInterval);
                    resolve(true);
                }
                // Check for timeout
                else if (Date.now() - startTime >= timeoutMs) {
                    console.log(`Timeout waiting for player ${playerId} to reconnect`);
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 500);
        });
    }

    private sendToPlayer(player: Player, msg: Messages): void {
        if (player.Websocket && player.Websocket.readyState === WebSocket.OPEN) {
            sendJson(msg, player.Websocket);
        }
    }

    private async handleMatchWithDisconnectedPlayer(roundnum: number, matchIndex: number, player1: Player, player2: Player): Promise<void> {
        const p1Connected = this.isPlayerConnected(player1);
        const p2Connected = this.isPlayerConnected(player2);
        
        console.log(`Match ${matchIndex}: Player ${player1.getId()} connected: ${p1Connected}, Player ${player2.getId()} connected: ${p2Connected}`);
        
        // Both players disconnected - wait for one to reconnect
        if (!p1Connected && !p2Connected) {
            console.log(`Both players disconnected, waiting for reconnection...`);
            
            // Wait for either player to reconnect (race condition)
            const reconnectPromise1 = this.waitForPlayerReconnection(player1, 30000);
            const reconnectPromise2 = this.waitForPlayerReconnection(player2, 30000);
            
            const results = await Promise.all([reconnectPromise1, reconnectPromise2]);
            const p1Reconnected = results[0];
            const p2Reconnected = results[1];
            
            if (!p1Reconnected && !p2Reconnected) {
                // Both failed to reconnect - mark both as losers and skip this match
                console.log(`Both players failed to reconnect, marking match as cancelled`);
                // For now, give win to player1 by default (could be improved)
                const winnerId = Number(player1.getId());
                const loserId = Number(player2.getId());
                
                // this._ranking.unshift(loserId);
                this._bracketids[roundnum][matchIndex][2] = winnerId;
                
                if (this._currentRound !== this._numberOfrounds - 1) {
                    this.updateBracketids(roundnum, matchIndex, winnerId);
                }
                
                await putTournamentBracketinDb(this._id, this._bracketids);
                
                // Notify all players about the forfeit result
                const forfeitMsg = new Messages("updateTournament", { 
                    update: "forfeit", 
                    winnerId: winnerId, 
                    loserId: loserId 
                });
                this.broadCasttoPlayers(forfeitMsg);
                
                this.checkRoundComplete(winnerId);
                return;
            }
            // At least one reconnected, continue with match creation
        }
        // One player disconnected - give forfait win to connected player
        else if (!p1Connected || !p2Connected) {
            const connectedPlayer = p1Connected ? player1 : player2;
            const disconnectedPlayer = p1Connected ? player2 : player1;
            
            console.log(`Player ${disconnectedPlayer.getId()} disconnected, waiting for reconnection before forfeit...`);
            
            // Notify only the connected player that we're waiting
            const waitMsg = new Messages("updateTournament", { 
                update: "waitingForPlayer", 
                disconnectedPlayerId: Number(disconnectedPlayer.getId())
            });
            this.sendToPlayer(connectedPlayer, waitMsg);
            
            // Give 30 seconds for disconnected player to reconnect
            const reconnected = await this.waitForPlayerReconnection(disconnectedPlayer, 30000);
            
            if (!reconnected) {
                console.log(`Player ${disconnectedPlayer.getId()} did not reconnect, forfeit win to ${connectedPlayer.getId()}`);
                
                // Give win to connected player
                const winnerId = Number(connectedPlayer.getId());
                const loserId = Number(disconnectedPlayer.getId());
                
               this._bracketids[roundnum][matchIndex][2] = winnerId;
                
                if (this._currentRound !== this._numberOfrounds - 1) {
                    this.updateBracketids(roundnum, matchIndex, winnerId);
                }
                
                await putTournamentBracketinDb(this._id, this._bracketids);
                
                // Notify all players about forfeit (to update bracket display)
                const forfeitMsg = new Messages("updateTournament", { 
                    update: "forfeit", 
                    winnerId: winnerId, 
                    loserId: loserId 
                });
                this.broadCasttoPlayers(forfeitMsg);
                
                // Send eliminated message to loser if they reconnect later
                const eliminatedMsg = new Messages("eliminated", { tournamentId: this._id });
                sendJson(eliminatedMsg, disconnectedPlayer.Websocket);
                
                this.checkRoundComplete(winnerId);
                return;
            }
            
            // Player reconnected, hide waiting overlay for connected player
            const hideWaitMsg = new Messages("updateTournament", { 
                update: "hideWaiting"
            });
            this.sendToPlayer(connectedPlayer, hideWaitMsg);
        }
        
        // Both players are now connected, create the match normally
        await this.createMatchForPlayers(roundnum, player1, player2);
    }

    private checkRoundComplete(lastWinnerId: number): void {
        if (this.isRoundComplete() && !this._roundInitialized) {
            this._roundInitialized = true;
            this._currentRound++;
            if (this._currentRound === this._numberOfrounds) {
                this._winnerId = lastWinnerId;
                this.changeState('finished');
                return;
            }
            setTimeout(() => {
                this._roundInitialized = false;
                this.initRound(this._currentRound);
            }, 3000);
        }
    }

    private async createMatchForPlayers(roundnum: number, player1: Player, player2: Player): Promise<void> {
        this.resetPlayerinfos(player1, player2);
        
        const roomId = await this._bracket[roundnum].createRoom(player1, this._powerUps);
        if (roomId === null) {
            console.error('Error while creating room for tournament');
            return;
        }
        this._bracket[roundnum].joinRoom(player2, false ,roomId.getId());
        console.log(`Player ${player1.getId()} creates the room ${roomId} and player ${player2.getId()} joins it`);
    }

    private async initRound(roundnum : number)
    {
        // Launch all matches in parallel - don't block other matches
        const matchPromises: Promise<void>[] = [];
        
        for (let i = 0; i < this._bracketids[roundnum].length; i++) {
            const Players: Player[] = this.extractPlayerFromBracketIds(this._bracketids[roundnum][i]);
            if (Players.length === 0) {
                console.error('Error while extracting players for match', i);
                continue;
            }
            
            // Check if both players are connected before creating the match
            const p1Connected = this.isPlayerConnected(Players[0]);
            const p2Connected = this.isPlayerConnected(Players[1]);
            
            if (!p1Connected || !p2Connected) {
                // Handle disconnected player scenario - this runs in parallel
                matchPromises.push(this.handleMatchWithDisconnectedPlayer(roundnum, i, Players[0], Players[1]));
            } else {
                // Both players connected, create match normally
                matchPromises.push(this.createMatchForPlayers(roundnum, Players[0], Players[1]));
            }
        }
        
        // Wait for all matches to be set up (but they run in parallel)
        await Promise.all(matchPromises);
    }

    public broadCasttoPlayers(msg : Messages)
    {
        this._players.forEach(element => {
            if (element.Websocket && element.Websocket.readyState === WebSocket.OPEN) {
                console.log("sending it to player : ", element.getId()); 
                sendJson(msg, element.Websocket);
            } else {
                console.log(`Skipping broadcast to disconnected player ${element.getId()}`);
            }
        });
    }


    public getId() : number {return this._id};
	public getPlayers(): Player[] {return this._players;}
    public getConnectedPlayers(): number {return this._connectedplayers;}
    public getBracketIds(): number[][][] {return this._bracketids;}

    public updatePlayerWebSocket(playerId: number, ws: WebSocket): boolean {
        for (const player of this._players) {
            if (Number(player.getId()) === playerId) {
                console.log(`Updating WebSocket for player ${playerId} in tournament ${this._id}`);
                player.Websocket = ws;
                return true;
            }
        }
        return false;
    }

    public async updateTournamentWinnerinDb(rooms: Rooms, winnerId: number, room: Room) : Promise <boolean>
    {
        let index1 : number = 0;
        let index2 : number = 0;
        this._bracket.forEach((element, index) =>
        {
            if (element === rooms)
            {    
                index1 = index;
                element.forEach((elem, key) =>
                {
                    if (elem === room)
                        index2 = key - 1;
                })
            }
        });
		const looserId: number = this._bracketids[index1][index2][0] === winnerId ? this._bracketids[index1][index2][1] : this._bracketids[index1][index2][0];
		this._ranking.unshift(looserId);
        const msg = new Messages("eliminated", { tournamentId: this._id });
        const loser = this.getPlayerFromId(looserId);
        if (loser)
            sendJson(msg, loser.Websocket);
        this._bracketids[index1][index2][2] = winnerId;
        if (this._currentRound !== this._numberOfrounds - 1)
        {
            this.updateBracketids(index1, index2, winnerId);
        }
        const res = await putTournamentBracketinDb(this._id, this._bracketids);
        if (this.isRoundComplete() && !this._roundInitialized)
        {
            this._roundInitialized = true;
            this._currentRound++;
            if (this._currentRound === this._numberOfrounds)
            {
				this._ranking.unshift(winnerId);
                this._winnerId = winnerId;
                setTimeout(() => {
                    this.changeState('finished')
                }, 4000);
                return res;
            }
            setTimeout(() => {
                this._roundInitialized = false;
                this.initRound(this._currentRound);
            }, 7000);
        }
        return res;
    }

	public isPlayerInTournament(playerId: number): boolean {
		for (const player of this._players) {
			if (Number(player.getId()) === playerId)
				return true;
		}
		return false;
	}

	public setPlayerReady(roomId: number, playerId: string) {
        if (!this._bracket[this._currentRound]) {
            console.log('Undefined room in Tournament.setPlayerReady, current bracket:', this._bracket);
        }
		this._bracket[this._currentRound].setPlayerReady(roomId, playerId);
	}

    public addCurrentRound(): void {
        this._currentRound++;
    }

    private updateBracketids(roundnum: number, roomnum: number, winnerId: number)
    {
        if(roundnum + 1 >= this._numberOfrounds || this._currentRound === this._numberOfrounds)   
            return;
		const nextRoomIndex = Math.floor(roomnum / 2);

		if (this._bracketids[roundnum + 1] === undefined || this._bracketids[roundnum + 1][nextRoomIndex] === undefined) {
			console.error(`Trying to access undefined bracket ids, roundnum: ${roundnum}, nextRoomIndex: ${nextRoomIndex}`);
			return;
		}

        if (this._bracketids[roundnum + 1][nextRoomIndex][0] === -1)
            this._bracketids[roundnum + 1][nextRoomIndex][0] = winnerId;
        else if (this._bracketids[roundnum + 1][nextRoomIndex][1] === -1 && this._bracketids[roundnum + 1][nextRoomIndex][0] != winnerId)
            this._bracketids[roundnum + 1][nextRoomIndex][1] = winnerId;
    }

    public directConnection(roomId: number, clientsocket: WebSocket, playerid: string) {
        const rooms = this._bracket[this._currentRound];
        if (rooms)
            rooms.directconnection(roomId, clientsocket, playerid);
        else
            console.error('Invalid current round');
    }

    public async destroy(forced: boolean)
    {
        this._players = [];
        const res = await destroyTournamentinDb(this._id, forced);
        if (!res)
        {
            console.error("Tournament api called failed");
            return;
        }
    }
}

function makePairs(ids: number[]): number[][] {
    if (ids.length % 2 !== 0) 
        throw new Error('playerIds length must be even to form pairs');
    const pairs: number[][] = [];
    for (let i = 0; i < ids.length; i += 2) 
        pairs.push([ids[i], ids[i + 1], -1]);
    return pairs;
}
