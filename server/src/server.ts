import WebSocket, { WebSocketServer, MessageEvent } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { Player } from "./Player";
import { Rooms } from "./Rooms";
import { Room } from './Room';
import { createGameinDb, joinGameinDb, leaveGameinDb } from "./matchmaking";
import { Tournaments } from './Tournaments';
import { Tournament } from './Tournament';
import { Messages } from './Messages';

// JWT configuration
const COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'access_token';
const JWT_SECRET = process.env.JWT_SECRET || '';

interface AccessTokenPayload {
    userId: number;
    username?: string;
    mfaVerified?: boolean;
}

// Extended WebSocket with custom properties
interface AuthenticatedWebSocket extends WebSocket {
    userId: number;
    _socket?: {
        remoteAddress?: string;
        remotePort?: number;
    };
}

class Server {
    private Rooms: Rooms;
    private Tournaments: Tournaments;
    private connectionCounter: number = 0;
    private socketToRoom: Map<WebSocket, Room> = new Map();
    constructor()
    {
        this.Rooms = new Rooms();
        this.Rooms.setRegisterSocketCallback((ws:WebSocket, room:Room) => {this.registerSocketInRoom(ws, room)});
        this.Rooms.setUnregisterSocketCallback((ws:WebSocket) => {this.unregisterSocket(ws)});
        this.Tournaments = new Tournaments();
        this.Tournaments.setRegisterSocketCallback((ws:WebSocket, room:Room) => {this.registerSocketInRoom(ws, room)});
        this.Tournaments.setUnregisterSocketCallback((ws:WebSocket) => {this.unregisterSocket(ws)});
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url || '', true);
            const pathname = parsedUrl.pathname || '/';

            process.on('SIGINT', async () => {
                console.log('Stopping server ...');
                this.Rooms.destroy();
                server.close(() => {
                    console.log('Server stopped.');
                    process.exit(0);
                });
            });
            if (pathname === '/' || pathname === '/index.html') {
                const htmlPath = path.join(__dirname, '../public/index.html');

                fs.readFile(htmlPath, 'utf8', (err, data) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Page non trouvée');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(data);
                });

            }
            else if (pathname.startsWith('/client/')) {
                const clientPath = path.join(__dirname, '../../', pathname);
                fs.readFile(clientPath, (err, data) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Fichier client non trouvé');
                        return;
                    }

                    let contentType = 'text/plain';
                    if (pathname.endsWith('.html'))
                        contentType = 'text/html';
                    else if (pathname.endsWith('.js'))
                        contentType = 'application/javascript';
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                });
            }
            else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Page non trouvée');
            }

        });
        const PORT = 3005;
        server.listen(PORT, () => {
            console.log(`game-server started`);
        });

        const wss = new WebSocketServer({ server });
        const clients = new Map<number, WebSocket>();


        wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
            console.log('[Game WS] Connection attempt');
            console.log('[Game WS] Headers:', req.headers);

            const cookies = parse(req.headers.cookie || '');
            const token = cookies[COOKIE_NAME];
            let userId: number | null = null;

            if (token && JWT_SECRET) {
                try {
                    const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
                    if (payload?.userId) {
                        userId = payload.userId;
                    }
                } catch (err: any) {
                    // console.error('[Game WS] Invalid JWT:', err.message);
                }
            }

            if (!userId) {
                console.log('[Game WS] No valid authentication, closing connection');
                ws.send(JSON.stringify({ type: "error", message: "Missing authentication" }));
                ws.close();
                return;
            }

            // Store userId on the websocket for later use
            const authWs = ws as AuthenticatedWebSocket;
            authWs.userId = userId;

            clients.set(authWs.userId, ws);
            const connId = ++this.connectionCounter;
            console.log(`Client connected #${connId} (userId: ${userId}) from ${authWs._socket?.remoteAddress}:${authWs._socket?.remotePort}`);

            // Automatically update WebSocket if player is in a tournament
            const tournament = this.Tournaments.isPlayerInATournament(userId);
            if (tournament) {
                console.log(`[Auto-reconnect] Player ${userId} is in tournament ${tournament.getId()}, updating WebSocket`);
                tournament.updatePlayerWebSocket(userId, ws);
            }

            ws.on('message', (data: WebSocket.Data) => {
                try {
                    const raw = data.toString();
                    console.log(`[conn ${connId}] on('message') raw: ${raw.slice(0, 200)}`);
                    const message = JSON.parse(raw);
                    // console.log(`[conn ${connId}] parsed message type=${message?.type} id=${message?.data?.id ?? message?.data?.playerid ?? ''}`);
                    const room = this.wasInRoom(ws);
                    console.log(`[conn ${connId}] wasInRoom -> ${room ? room.getId() : 'none'}`);
                    this.handleClientMessage(message, authWs);
                } catch (error) {
                    console.error('Json parsing error:', error);
                }
            });
            ws.on('close', () => {
                console.log(`[conn ${connId}] close event from ${authWs._socket?.remoteAddress}:${authWs._socket?.remotePort}`);
                let room: Room | undefined;
                room = this.wasInRoom(ws);
                if (room)
                {
                    room.getPlayers().forEach((p, k) => { p.ready = false; });
                    room.pingDisconnection();
                }
                clients.delete(authWs.userId);
                this.unregisterSocket(ws);
                console.log(`[conn ${connId}] Client disconnected and removed`);
            });
            ws.on('error', (err: any) => {
                console.error(`[conn ${connId}] websocket error:`, err);
            });

        });
    }

    async handleClientMessage(message: any, ws: AuthenticatedWebSocket): Promise<void> {
        if (message) {
            switch (message.type) {
                case "roomrequest":
                {
                    console.log("room requested by player with id :", ws.userId);
                    const player = new Player(String(ws.userId).trim(), {x:0, z:-28}, ws);
                    const joined = this.Rooms.joinRoom(player, message.data.powerUps);
                    if (!joined)
                    {
                        const res = await this.Rooms.createRoom(player, message.data.powerUps);
                        if (res && this.Rooms.callbackRegisterSocket)
                            this.Rooms.callbackRegisterSocket(ws, res);
                    }
                    break;
                }
				case "joinroom":
				{
					const roomid = Number(message.data.id);
                    if (Number.isNaN(roomid))
                    {    
                        console.error("joinroom didnt work : roomid is NaN");
                        return;
                    }
                    const playerid: string = String(ws.userId).trim();
                    if (!playerid)
                    {
                        console.error("joinroom didnt work : playerid is undefined");
                        return;
                    }
					const player = new Player(playerid, {x:0, z:28}, ws);
					this.Rooms.joinRoom(player, false, roomid);
					break;
				}
                case "directconnection":
                    {
                        console.log("Directconnection message received from client : ", ws.userId);
                        const roomid = Number(message.data.id);
                        if (Number.isNaN(roomid)) {
                            console.error("directconnection didnt work : roomid is NaN");
                            return;
                        }
                        const playerid: string = String(ws.userId).trim();
                        if (!playerid) {
                            console.error("directconnection didnt work : playerid is undefined");
                            return;
                        }
                        const tournament = this.Tournaments.isPlayerInATournament(ws.userId);
                        if (tournament)
                            tournament.directConnection(roomid, ws, playerid);
                        else
                            this.Rooms.directconnection(roomid, ws, playerid);
                        break;
                    }
                case "ready":
                    {
                        console.log("ready received from player with id : ", ws.userId);
                        const tournament = this.Tournaments.isPlayerInATournament(ws.userId);
                        if (tournament)
                            tournament.setPlayerReady(message.data.roomid, String(ws.userId).trim());
                        else
                            this.Rooms.setPlayerReady(message.data.roomid, String(ws.userId).trim());
                        break;
                    }
                case "leavegame":
                    {
                        const roomid = Number(message.data.id);
                        if (Number.isNaN(roomid)) {
                            console.error("leavegame didn't work: roomid in NaN");
                            return;
                        }
                        const playerid: string = String(ws.userId).trim();
                        if (!playerid) {
                            console.error("leavegame didn't work: playerid is undefined");
                            return;
                        }
                        this.Rooms.leaveRoom(roomid, ws, playerid);
                        break;
                    }
                case "test":
                    {
                        console.log("received test with id : ", message.data);
                        break;
                    }
                case "createTournament":
                {
                    const data = message.data;
                    Tournament.create(ws.userId, ws, data.maxPlayers, data.powerUps).then((tournament) => {
                        tournament?.setRegisterSocketCallback((ws:WebSocket, room:Room) => {this.registerSocketInRoom(ws, room)});
                        tournament?.setUnregisterSocketCallback((ws:WebSocket) => {this.unregisterSocket(ws)});
                        this.Tournaments.addTournament(tournament, ws);
                    });
                    break;
                }
                case "joinTournament":
                    {
                        const data = message.data;
                        this.Tournaments.joinTournament(data.tournamentId, data.playerId, ws);
                        break;
                    }
                case "leaveTournament":
                {
                    const data = message.data;
                    this.Tournaments.leaveTournament(data.tournamentId, data.playerId, ws);
                    break;
                }
                case "reconnectTournament":
                {
                    const data = message.data;
                    console.log(`Player ${data.playerId} attempting to reconnect to tournament`);
                    const reconnected = this.Tournaments.reconnectToTournament(ws.userId, ws);
                    if (!reconnected) {
                        const msg = new Messages("tournamentReconnected", { success: false });
                        this.sendJson(msg, ws);
                    }
                    break;
                }
                case "gameLeft":
                {
                    const authWs = ws as AuthenticatedWebSocket;
                    let room : Room | undefined;
                    room = this.wasInRoom(ws);
                    if (room)
                        room.getPlayers().forEach((p, k) => { p.ready = false; });
                    if (room != undefined)
                        room.pingDisconnection();
                    break;
                }
            }
        }
    }


    wasInRoom(ws: WebSocket): Room | undefined {
        return this.socketToRoom.get(ws);
    }

    public registerSocketInRoom(ws: WebSocket, room: Room): void {
        this.socketToRoom.set(ws, room);
    }

    public unregisterSocket(ws: WebSocket): void {
        this.socketToRoom.delete(ws);
    }

    public sendJson(message: Messages, client: WebSocket): void {
        const msg = {
            type: message.getType(),
            data: message.getData(),
            timestamp: Date.now()
        };
        try {
            client.send(JSON.stringify(msg));
        } catch (e) {
            console.error("error sending message to client socket:", e);
        }
    }

}


export function sendJson(message: Messages, player: WebSocket): void {
    const msg = {
        type: message.getType(),
        data: message.getData(),
        timestamp: Date.now()
    };
    try {
        player.send(JSON.stringify(msg));
    } catch (e) {
        console.error(` error sending message to player socket:`, e);
    }
}

const server = new Server();