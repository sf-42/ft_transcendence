import { Player } from "./Player";
import { Messages } from "./Messages"
import { WebSocket } from "ws";
import { Tournament } from "./Tournament";
import { Room } from "./Room";

export class Tournaments extends Set<Tournament>
{
    public callbackRegisterSocket?: (ws: WebSocket, room: Room) => void;
    private callbackUnregisterSocket?: (ws: WebSocket) => void;
    constructor()
    {
        super();
    }

    public setRegisterSocketCallback(c: (ws: WebSocket, room: Room) => void)
    {
        this.callbackRegisterSocket = c;
    }

    public setUnregisterSocketCallback(c: (ws: WebSocket) => void)
    {
        this.callbackUnregisterSocket = c;
    }

    public addTournament(tournament: Tournament | null, ws : WebSocket) : void
    {
        if (!tournament)
        {
            console.error("Adding tournament failed");
            const msg = new Messages("tournamentCreated", "failed");
            this.sendJson(msg, ws);
            return;
        }
        this.add(tournament);
        const msg = new Messages("tournamentCreated", {tournamentid: tournament.getId()});
        this.sendJson(msg, ws);
    }

    public joinTournament(tournamentid: number, playerid: number, ws: WebSocket)
    {
        try 
        {
			let tournament: Tournament | undefined;
            this.forEach((t) => {
                if (tournamentid === t.getId())
                {
                    t.addPlayer(playerid, ws);
					tournament = t;
                    return;
                }
            });
            if (!tournament)
                throw (new Error(`Error joining tournament : tournament not found with id : ${tournamentid}`));
            const msg = new Messages("tournamentJoined", {tournamentid: tournamentid});
            this.sendJson(msg, ws); 
			const updateMsg = new Messages("updateTournament", { update: "playerJoined", tournamentid: tournamentid, playerid: playerid });
			for (const user of tournament?.getPlayers()) {
				if (Number(user.getId()) !== playerid)
					this.sendJson(updateMsg, user.Websocket);
			}
        }
        catch (error)
        {
            console.error(error);
            const msg = new Messages("tournamentJoined", "failed");
            this.sendJson(msg, ws);
        }
    }

    public leaveTournament(tournamentId: number, playerId: number, ws: WebSocket)
    {
        try
        {
            let tournament: Tournament | undefined;
            this.forEach((t) => {
                if (tournamentId === t.getId())
                {
                    tournament = t;
                    t.removePlayer(playerId, ws);
                    return;
                }
            });
            if (!tournament)
                throw (new Error(`Error leaving tournament : tournament not found with id : ${tournamentId}`));
            const msg = new Messages("tournamentLeft", { tournamentid: tournamentId });
            this.sendJson(msg, ws);
            const updateMsg = new Messages("updateTournament", { update: "playerLeft", tournamentid: tournamentId, playerid: playerId });
            for (const user of tournament.getPlayers()) {
				if (Number(user.getId()) !== playerId)
					this.sendJson(updateMsg, user.Websocket);
			}
            if (tournament.getConnectedPlayers() === 0)
                this.delete(tournament);
        }
        catch (error)
        {
            console.error(error);
            const msg = new Messages("tournamentLeft", "failed");
            this.sendJson(msg, ws);
        }
    }

    public reconnectToTournament(playerId: number, ws: WebSocket): boolean {
        console.log(`[reconnectToTournament] Called for player ${playerId}`);
        const tournament = this.isPlayerInATournament(playerId);
        if (!tournament) {
            console.log(`[reconnectToTournament] Player ${playerId} tried to reconnect but is not in any tournament`);
            return false;
        }
        
        // Update the player's WebSocket
        const updated = tournament.updatePlayerWebSocket(playerId, ws);
        console.log(`[reconnectToTournament] WebSocket updated for player ${playerId}: ${updated}`);
        
        // Send confirmation and current tournament state to the player
        const msg = new Messages("tournamentReconnected", { 
            tournamentId: tournament.getId(),
            bracket: tournament.getBracketIds()
        });
        this.sendJson(msg, ws);
        
        console.log(`[reconnectToTournament] Player ${playerId} reconnected to tournament ${tournament.getId()}`);
        return true;
    }

    public sendJson(message : Messages, client: WebSocket) : void
    {
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

    public async destroy()
    {
        this.clear();
    }

	public isPlayerInATournament(playerId: number): Tournament | null {
		for (const tournament of this) {
			if (tournament.isPlayerInTournament(playerId))
				return tournament;
		}
		return null;
	}

    public removeTournament(id: number) {
        for (const tournament of this) {
            if (tournament.getId() === id)
                this.delete(tournament);
        }
    }
}