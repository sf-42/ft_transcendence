import { Gamelogic } from "./Gamelogic";
import {Room} from "./Room";
import { Player } from "./Player";
import { Messages } from "./Messages"
import { WebSocket } from "ws";
import { createGameinDb, joinGameinDb, leaveGameinDb} from "./matchmaking";
import { Tournament } from "./Tournament";

let checkId = 1;

export class Rooms extends Map<number, Room>
{
    private tournament? : Tournament;
	private id: number;
    public callbackRegisterSocket?: (ws: WebSocket, room: Room) => void;
    private callbackUnregisterSocket?: (ws: WebSocket) => void;
    constructor(tournament?: Tournament)
    {
        super();
		this.id = checkId;
		checkId++;
        if (tournament)
            this.tournament = tournament;
    }

    public setRegisterSocketCallback(c: (ws: WebSocket, room: Room) => void)
    {
        this.callbackRegisterSocket = c;
    }

    public setUnregisterSocketCallback(c: (ws: WebSocket) => void)
    {
        this.callbackUnregisterSocket = c;
    }

    public addRoom(key: number, value : Room, ws: WebSocket) : void
    {
		console.log(`Adding room ${value.getId()} to Rooms ${this.id} map with key:`, key);
        this.set(key, value);
        value.setRegisterSocketCallback((ws: WebSocket, room: Room) => {this.callbackRegisterSocket?.(ws, room)});
        value.setUnregisterSocketCallback((ws:WebSocket) => {this.callbackUnregisterSocket?.(ws)});
        value.setDestroyCallback((winnerId: number) => {
            this.sendEndGameToPlayers(value, winnerId, this.tournament).then(() => {
                this.destroyRoom(value);
            }).catch((err) => {
                console.error("Error in sendEndGameToPlayers:", err);
            });
        });
        if (this.callbackRegisterSocket)
            this.callbackRegisterSocket(ws, value);
    }

    public async createRoom(Player1: Player, powerUpsActive: boolean) : Promise<Room | null>
    {
        const powerup = +!!powerUpsActive as 0 | 1;
        let res = await createGameinDb(powerup, Player1.getId(), this.tournament?.getId());
        if (res === null)
        {
            console.error("Server error when Promess returned in createGameinDb call");
            return res;
        }
        const tournamentId = this.tournament?.getId();
        const room:Room = Room.create(Player1, res!, powerUpsActive, tournamentId);
        this.addRoom((this.size + 1), room, Player1.Websocket);
        this.sendRoomIdtoClient(room, Player1.Websocket, Player1.getId());
        return room;
    }

    public getRoom(key : number) : Room | undefined
    {
        return (this.get(key));
    }

    public joinRoom(Player: Player, powerup: boolean, roomId?: number) : boolean
    {
        for (const [, room] of this.entries())
        {
            if (roomId)
            {
                if (room.getId() === roomId && room['callbackSecondPlayer'])
                {
                    Player.pos.z = 28;
                    room.addSecondPlayer(Player);
                    const roomid = String(room.getId());
                    console.log(`Player ${Player.getId()} joins the room ${roomId}`);
                    joinGameinDb(roomid, Player.getId()).then((result) => {
                        if (result === null)
                            console.error("Server error when Promess returned in joinGameinDb call");
                        this.sendRoomIdtoClient(room, Player.Websocket, Player.getId());
                    });
                    if (this.callbackRegisterSocket)
                        this.callbackRegisterSocket(Player.Websocket, room);
                    return true;
                }
            }
            else if (room['callbackSecondPlayer'] && room.powerUps === powerup)
            {
                Player.pos.z = 28;
                room.addSecondPlayer(Player);
                const roomid = String(room.getId());
                joinGameinDb(roomid, Player.getId()).then((result) => {
                    if (result === null)
                        console.error("Server error when Promess returned in joinGameinDb call");
                    this.sendRoomIdtoClient(room, Player.Websocket, Player.getId());
                });
                if (this.callbackRegisterSocket)
                    this.callbackRegisterSocket(Player.Websocket, room);
                return true;
            }
        }
        return false;
    }


    public leaveRoom(roomid: number, clientsocket: WebSocket, playerid: string) {
        for (const [, r] of this.entries())
        {
            if (r.getId() === roomid)
            {
                if (r.isPlayerinGame(clientsocket)) {
                    r.removePlayer(playerid);
                }
                return;
            }
        }
    }

    public directconnection(roomid: number, clientsocket: WebSocket, playerid: string)
    {
        for (const [, r] of this.entries())
        {
            if (r.getId() === roomid)
            {
                r.resetPlayerSocket(clientsocket, playerid);
                if (this.callbackRegisterSocket)
                    this.callbackRegisterSocket(clientsocket, r);
            }
        }
    }

    private sendRoomIdtoClient(room: Room, clientsocket: WebSocket, playerId: string )
    {
        const roomid = Number(room.getId());
        if (!isFinite(roomid))
        {
            console.error("Problem getter roomid");
            return ;
        }
        const msg : Messages = new Messages("room",{roomid: roomid, playerid: playerId});
        room.sendJson(msg, clientsocket);
    }

    public setPlayerReady(roomid: number, playerid: string) : void
    {
		console.log(`Searching room ${roomid} in Rooms`, this.id);
		console.log('Rooms size:', this.size);
        for (const [, room] of this.entries())
        {
			console.log('Checking room', room.getId());
            if (room.getId() === roomid)
            {
                const players = room.getPlayers();
                if (!players)
                {
                    console.log("Players getter method didnt find map players");
                    return ;
                }
                let player : Player | undefined; 
                players.forEach((p, id) => {
                    if (p.getId() === playerid)
                        player = p;
                });
                if (!player)
                    console.log("player not found with id :", playerid);
                else
                {
                    player.ready = true;
                    console.log("player found with id: ", playerid);
                    room.checkReadyState();
                }
				return;
            }
        }
		console.log('Did not find room', roomid);
    } 

    public destroy() : void
    {
        for (const [key ,room] of this.entries())    
            this.destroyRoom(room);
        this.clear();
    }

    public destroyRoom(room: Room) : void
    {
        for (const [key, destroom] of this.entries())
        {
            if (destroom === room)
            {
                destroom.delete();
                this.delete(key);
                break;
            }
        }
    }

    private async sendEndGameToPlayers(room: Room, winnerId: number, tournament?: Tournament) : Promise <void>
    {
        if (tournament !== undefined)
        {
            const res = await this.tournament?.updateTournamentWinnerinDb(this, winnerId, room);
            if (!res)
                console.error("sendEndGameToPlayers : updateTournamentWinnerinDb failed");
        }
        else
            await room.sendResultToDB(winnerId);
        const Players = room.getPlayers();
        const msg : Messages = new Messages("gamestate", {state: "end", winnerId: winnerId});
        const msg2 : Messages = new Messages("updateTournament", {update: "gameResult"});
        if (Players)
        {
            for (const [key, p] of Players)
            {
                room.sendJson(msg, p.Websocket);
            }
            if (tournament)
            {
                this.tournament?.broadCasttoPlayers(msg2);
            }
        }
    }
}