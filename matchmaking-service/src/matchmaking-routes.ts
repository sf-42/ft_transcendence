import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from 'dotenv';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Game, getGameById, createGame, JoinGame, LeaveGame, Tournament, getTournamentById, createTournament, getAvailableTournaments, isPlayerInGame, addPlayerToTournament, updateTournamentBracket, updateTournamentStatus, removePlayerFromTournament, destroyTournament } from './db';

config();


interface CreateGameBody {
    id: number;
    player1: string;
    powerups: number;
    tournamentId?: number;
}

interface JoinGameBody {
    id: number;
    player2: string;
}

interface SyncTournamentBody {
    id: number;
    numberofplayers: number;
}

interface CreateTournamentBody {
    creatorId: number,
    maxPlayers: number,
    powerUps: boolean
}

interface JoinTournamentBody {
	id: number;
	player: number;
}

interface UpdateTournamentBracketBody {
    id: number;
    bracket: number[][][];
}


// ===== Routes =====
export default async function matchmakingRoutes(app: FastifyInstance) {

    app.post('/games', async function (req: FastifyRequest<{ Body: CreateGameBody }>, reply: FastifyReply) {
         // getting db from app decoration
        const db = (app as any).db;
        const powerups = Number(req.body.powerups);
        if (Number.isNaN(powerups))
            return reply.status(400).send({ error: 'Invalid powerups body received is NaN' });
        const player1 = req.body.player1;
        const tournamentId = req.body.tournamentId;
        console.log("Syncing game creation with : ", { powerups, player1, tournamentId });
        const newGame = await createGame(db, powerups, player1, tournamentId);
        return reply.status(201).send(newGame);
    });

    app.put('/games/:id/join', async (req: FastifyRequest<{Body : JoinGameBody}>, reply: FastifyReply) => {

        const db = (app as any).db;
        const id = Number(req.body.id);
        if (Number.isNaN(id)) 
            return reply.status(400).send({ error: 'Invalid game id' });
        const player2 = req.body.player2;
        const existingGame = await getGameById(db, id);
        if (!existingGame)
            return reply.status(404).send({error: 'Game not found'});
        const updated = await JoinGame(db, id, player2);
        if (updated === null)
            return reply.status(409).send({error: 'Cannot join game'});
        return reply.status(200).send(updated);
    });


    app.put('/games/:id/leave', async (req: FastifyRequest<{params : {id: string}; Body : {player: number} }>, reply: FastifyReply) => {

        const db = (app as any).db;
        const id = Number(req.params.id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid game id'});
        console.log(`Player ${req.body.player} leaving game ${id}`);
        const res = await LeaveGame(db, id, req.body.player);
        if (res === null)
            return reply.status(404).send({ error: 'Cannot leave game'});
        return reply.status(200).send(res);
    });

    app.get('/games/:id', async function (req: FastifyRequest<{ params: { id: string } }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid game id' });

        const game = await getGameById(db, id);
        if (!game) return reply.status(404).send({ error: 'Game not found' });
        return reply.status(200).send(game);
    });

    // PS : we receive params as a query string, not in the url as /matchmaking/isingame?playerid=123 so we cant call it params
    app.get('/isingame', async (req: FastifyRequest<{Querystring : {playerid: number}}>, reply: FastifyReply) => {
        const db = (app as any).db;
        const playerid = Number(req.query.playerid);
        if (Number.isNaN(playerid))
            return reply.status(400).send({ error: 'Invalid game id'});
        const res = await isPlayerInGame(db, req.query.playerid);
        if (res === null)
            return reply.status(404).send({ error: 'Cannot leave game'});
        return reply.status(200).send(res);
    });

    app.get('/tournaments/:id', async (req: FastifyRequest<{ params: { id: string } }>, reply: FastifyReply) => {
        const db = (app as any).db;

        const id = Number((req.params as any).id);
        if (Number.isNaN(id)) 
            return reply.status(400).send({ error: 'Invalid id' });

        const tournament = await getTournamentById(db, id);
        if (!tournament)
            return reply.status(404).send({ error: 'Tournament not found' });

        return reply.status(200).send({
            success: true,
            tournament: tournament
        });
    });

    app.get('/tournaments/available', async (req: FastifyRequest, reply: FastifyReply) => {
        const db = (app as any).db;

        const availableTournaments = await getAvailableTournaments(db);
        if (availableTournaments === null) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch tournaments'
            });
        }


        return reply.status(200).send({
            success: true,
            tournaments: availableTournaments
        });
    });

    app.post('/tournaments', async (req: FastifyRequest<{ Body: CreateTournamentBody }>, reply: FastifyReply) => {
        const db = (app as any).db;
        const { creatorId, maxPlayers, powerUps } = req.body;

        if (Number.isNaN(creatorId) || Number.isNaN(maxPlayers) || ![4, 8].includes(maxPlayers) || Number.isNaN(powerUps) || (powerUps !== false && powerUps !== true)) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid parameter'
            });
        }

        const res = await createTournament(db, req.body.maxPlayers, req.body.powerUps, req.body.creatorId);
        if (!res) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to create tournament'
            });
        }

        return reply.status(201).send({
            success: true,
            tournament: JSON.stringify(res)
        });
    });

	app.put('/tournaments/:id/join', async (req: FastifyRequest<{Body : JoinTournamentBody}>, reply: FastifyReply) => {
        const db = (app as any).db;
        const id = Number(req.body.id);
        if (Number.isNaN(id)) 
            return reply.status(400).send({ error: 'Invalid tournament id' });
        const player = req.body.player;
        
        console.log("Joining tournament :", id, "player:", player);

        const existingTournament = await getTournamentById(db, id);
        if (!existingTournament)
            return reply.status(404).send({error: 'Tournament not found'});
        const updated = await addPlayerToTournament(db, id, player);
        if (updated === null)
            return reply.status(409).send({error: 'Cannot join tournament'});
        return reply.status(200).send({
                success: true,
                tournament: updated
            });
    });

    // Route to leave a tournament
    app.put('/tournaments/:id/leave', async (req: FastifyRequest<{Body : UpdateTournamentBracketBody}>, reply: FastifyReply) => {
        const db = (app as any).db;
        const id = Number(req.body.id);
        if (Number.isNaN(id)) 
            return reply.status(400).send({ error: 'Invalid tournament id' });
        const player = req.body.player;
        console.log("Leaving tournament :", id);
        const existingTournament = await getTournamentById(db, id);
        if (!existingTournament)
            return reply.status(404).send({error: 'Tournament not found'});
        const updated = await removePlayerFromTournament(db, id, player);
        if (updated === null)
            return reply.status(409).send({ error: 'Cannot leave tournament' });
        return reply.status(200).send({
            success: true,
            tournament: updated
        });
    });

    app.put('/tournaments/:id/bracket', async (req: FastifyRequest<{Body : UpdateTournamentBracketBody}>, reply: FastifyReply) => {
        const db = (app as any).db;
        const id = Number(req.params.id);
        if (Number.isNaN(id)) 
            return reply.status(400).send({ error: 'Invalid tournament id' });
        const bracket: number[][][] = req.body.bracket;
        if (!bracket)
            return reply.status(400).send({success: false, error: 'Invalid bracket in body'});
        const res = await updateTournamentBracket(db, req.params.id, req.body.bracket);
        if (res)
        {
            return reply.status(200).send({
                success: true
            });
        }
        return reply.status(404).send({
            success: false,
            error: 'UpdateTournamentBracket fail in db'
        });
    });

    app.put('/tournaments/:id/status', async (req: FastifyRequest<{params: { id: string }, Body : {status: 'pending' | 'in_progress' | 'finished'}}>, reply: FastifyReply) => {
        console.log("Tournament status received : ", req.body.status);
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        const status = req.body.status;
        if (!status)
            return reply.status(400).send({success: false, error: 'Invalid status in body'});

        const res = await updateTournamentStatus(db, id, status);
        if (res)
            return reply.status(200).send({ success: true });
        return reply.status(404).send({
            success: false,
            error: 'UpdateTournamentStatus failed in db'
        });
    });

      app.put('/tournaments/:id/destroy', async (req: FastifyRequest<{params :{id : string}, Body:{forced: boolean}}>, reply: FastifyReply) => {
        const db = (app as any).db;
        const id = Number(req.params.id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid tournament id' });
        const res = await destroyTournament(db, req.params.id, req.body.forced);
        if (res)
        {
            return reply.status(200).send({
                success: true
            });
        }
        return reply.status(404).send({
            success: false,
            error: 'DestroyTournament fail in db'
        });
    });
};
