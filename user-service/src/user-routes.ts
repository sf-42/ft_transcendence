import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from 'dotenv';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { User, getUserById, dbPromise, createUser, updateUser, updateUserStats, updateUserKeyBinds, addResult, Stats, getAllUsersStats, getUserByUsername, updateUsercurrentGame, updateUserCurrentTournament, deleteUser, updateProfilePicture, deleteProfilePicture } from './db';
import { SyncUserBody, userChangeAvatarPayload, ProfilePicturePayload } from './user-interfaces';
import { syncUser } from './management/user-edit';
import { updateAvatar } from "./management/avatar";
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';


config();




// ===== Routes =====
export default async function userRoutes(app: FastifyInstance) {

    app.post('/sync', async function (req: FastifyRequest<{ Body: SyncUserBody }>, reply: FastifyReply) {
        // getting db from app decoration
        const db = (app as any).db;

        const { id, username } = req.body;
        console.log("Syncing user:", id, username);

        const existingUser = await getUserById(db, id);
        if (!existingUser) {
            const newUser = await createUser(db, id, username);
            return reply.status(201).send(newUser);
        }

        if (existingUser.username !== username) {
            await db.run(
                'UPDATE users SET username = ?, updatedAt = ? WHERE id = ?',
                username,
                new Date().toISOString(),
                id
            );
            return reply.status(200).send({ ...existingUser, username });
        }

        return reply.status(200).send(existingUser);
    });

    
    // app.put('/me', async function (req: FastifyRequest<{ Body: Partial<User> }>, reply: FastifyReply) {
    //     return await syncUser(app, req, reply);
    // });

    // Get current user info from x-user-id header
    app.get('/me', async function (req: FastifyRequest, reply: FastifyReply) {
        const db = (app as any).db;
        const headerId = req.headers['x-user-id'];
        
        if (typeof headerId !== "string") {
            return reply.status(400).send({ success: false, error: 'Missing x-user-id header' });
        }

        const id = Number(headerId);
        if (Number.isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid id' });
        }
        
        const user = await getUserById(db, id);
        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        return reply.status(200).send(user);
    });
    
    app.get('/stats', async function (req: FastifyRequest, reply: FastifyReply) {
        try {
            const db = (app as any).db;

            const stats = await getAllUsersStats(db);
            if (Object.keys(stats).length === 0)
                return (reply.status(404).send({ error: 'no stats found' }));

            return (reply.status(200).send(stats));
        }
        catch (err) {
            console.log("[ERROR]: getAllUsersStats call failed:", err);
            reply.status(500).send({ sucess: false, message: "getAllUsersStats call failed" });
        }
    });
    
    // Search user by username
    app.get('/search', async function (req: FastifyRequest<{ Querystring: { username: string } }>, reply: FastifyReply) {
        try {
            const db = (app as any).db;
            const { username } = req.query;
            
            if (!username || username.length < 2) {
                return reply.status(400).send({ error: 'Username must be at least 2 characters' });
            }

            const user = await getUserByUsername(db, username);
            if (!user) {
                return reply.status(404).send({ error: 'User not found' });
            }
            
            return reply.status(200).send(user);
        } catch (err) {
            console.error("[ERROR]: search user failed:", err);
            return reply.status(500).send({ error: 'Search failed' });
        }
    });
    
    app.get('/:id', async function (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        const user = await getUserById(db, id);
        if (!user) return reply.status(404).send({ error: 'User not found' });

        console.log('[INFO]: getting user', id, 'success');

        return reply.status(200).send(user);
    });

    
    app.put('/:id/game', async function (req: FastifyRequest<{ params: { id: string }, body: boolean }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        console.log("Body:", req.body);

        const win: boolean = (req.body as any).win;
        
        const user = await getUserById(db, id);
        if (!user)
            return reply.status(404).send({ error: 'User not found' });

        const result = await addResult(db, id, "game", win);

        return reply.status(200).send({ success: result });
    });
    
    app.put('/:id/tournament', async function (req: FastifyRequest<{ params: { id: string }, body: boolean }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        const win: boolean = (req.body as any).win;
        
        const user = await getUserById(db, id);
        if (!user)
            return reply.status(404).send({ error: 'User not found' });

        const result = await addResult(db, id, "tournament", win);

        return reply.status(200).send({ success: result });
    });

    // Update user by ID (for game/tournament state updates)
    app.put('/:id', async function (req: FastifyRequest<{ params: { id: string }, body: Partial<User> }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = Number((req.params as any).id);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        const param: Partial<User> = req.body;
        
        const user = await getUserById(db, id);
        if (!user)
            return reply.status(404).send({ error: 'User not found' });

        console.log("Updating user", id);
        console.log("Parameters to update:", param);

        let result: boolean = true;

        if (param.avatar !== undefined || param.bike !== undefined) {
            if (!await updateUser(db, id, param))
                result = false;
        }
        if (param.stats !== undefined) {
            if (!await updateUserStats(db, id, param.stats))
                result = false;
        }
        if (param.keyBinds !== undefined) {
            if (!await updateUserKeyBinds(db, id, param.keyBinds))
                result = false;
        }
        if (param.currentGameID !== undefined)
        {
            const currentgameid = Number(param.currentGameID);
            if (!Number.isNaN(currentgameid) && id) {
                if (!await updateUsercurrentGame(db, id ,currentgameid))
                    result = false;
            }
        }
        if (param.currentTournamentID !== undefined) {
            const currentTournamentId = Number(param.currentTournamentID);
            if (!Number.isNaN(currentTournamentId) && id) {
                if (!await updateUserCurrentTournament(db, id ,currentTournamentId))
                    result = false;
            }
        }

        return reply.status(200).send({ success: result });
    });

    app.put('/me', async function (req: FastifyRequest<{ body: Partial<User> }>, reply: FastifyReply) {
        const db = (app as any).db;
        const id = (req.headers as any)['x-user-id'];
        if (!id) {
            return reply.status(401).send({ 
                error: 'Unauthorized - missing user ID' 
            });
        }
        
        const user = await getUserById(db, id);
        if (!user)
            return reply.status(404).send({ error: 'User not found' });

        console.log("Updating user", id);

        let param: Partial<User>;

        if (typeof req.body === 'string') {
            const parsed = JSON.parse(req.body);
            param = parsed.params;
        }
        else if (req.body.params)
            param = req.body.params;
        else
            param = req.body;
        
        console.log("Parameters to update with /me:", param);

        let result: boolean = true;

        if (param.avatar !== undefined || param.bike !== undefined) {
            if (!await updateUser(db, id, param))
                result = false;
        }
        if (param.stats !== undefined) {
            if (!await updateUserStats(db, id, param.stats))
                result = false;
        }
        if (param.keyBinds !== undefined) {
            if (!await updateUserKeyBinds(db, id, param.keyBinds))
                result = false;
        }
        if (param.currentGameID !== undefined)
        {
            const currentgameid = Number(param.currentGameID);
            if (!Number.isNaN(currentgameid) && id) {
                if (!await updateUsercurrentGame(db, id ,currentgameid))
                    result = false;
            }
        }
        if (param.currentTournamentID !== undefined) {
            const currentTournamentId = Number(param.currentTournamentID);
            if (!Number.isNaN(currentTournamentId) && id) {
                if (!await updateUserCurrentTournament(db, id ,currentTournamentId))
                    result = false;
            }
        }

        return reply.status(200).send({ success: result });
    });

    app.delete('/internal/sync', async function (req: FastifyRequest, reply: FastifyReply) {
        const apiKey = req.headers['x-internal-secret'];
        const db = (app as any).db;
        if (apiKey !== process.env.INTERNAL_SERVICE_SECRET) {
            return reply.status(403).send({ error: "Access denied. Internal communication only." });
        }
        const id = Number(req.headers['x-user-id']);
        if (Number.isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid user id' });
        }
        try {
            console.log("deleteUser type:", typeof deleteUser);
            if (typeof deleteUser !== 'function') {
                throw new Error("deleteUser is not a function");
            }
            await deleteUser(db, id);
            return reply.status(200).send({ success: true });
        }
        catch (err: any) {
            console.log("[ERROR]: deleteUser call failed", err.message, err.stack);
            return reply.status(500).send({ success: false, message: "deleteUser call failed" });
        }
    });

    app.put('/picture', async function (req: FastifyRequest, reply: FastifyReply) {
        try {
            const db = (app as any).db;
            const id = Number(req.headers['x-user-id']);
            if (Number.isNaN(id)) {
                return reply.status(400).send({ error: 'Invalid user id' });
            }
            
            const data = await req.file();
            if (!data) {
                return reply.status(400).send({ error: 'No file uploaded' });
            }
            
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.mimetype)) {
                return reply.status(400).send({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
            }
            const uploadDir = process.env.PICTURE_PATH;
            const fileName = `${id}.webp`;
            const filePath = path.join(uploadDir, fileName);
            

            const buffer = await data.toBuffer();
            await sharp(buffer)
                .resize(500, 500, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filePath);

            const profilePictureUrl = `/picture/${fileName}`;
            await updateProfilePicture(db, id, profilePictureUrl);

            return reply.status(200).send({ success: true, profilePicture: profilePictureUrl });
        }
        catch (err) {
            console.log("[ERROR]: updateProfilePicture call failed", err);
            reply.status(500).send({ sucess: false, message: "updateProfilePicture call failed" });
        }
    });
    
    app.delete('/picture', async function (req: FastifyRequest, reply: FastifyReply) {
        try {
            const db = (app as any).db;
            const id = Number(req.headers['x-user-id']);
            if (Number.isNaN(id)) {
                return reply.status(400).send({ error: 'Invalid user id' });
            }
            // Get current user to find the file path
            const user = await getUserById(db, id);
            if (user && user.profilePicture) {
                const fileName = path.basename(user.profilePicture);
                const uploadDir = process.env.PICTURE_PATH;
                const filePath = path.join(uploadDir, fileName);
                
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            await deleteProfilePicture(db, id);
            return reply.status(200).send({ success: true });
        }
        catch (err) {
            console.log("[ERROR]: deleteProfilePicture call failed", err);
            reply.status(500).send({ sucess: false, message: "deleteProfilePicture call failed" });
        }
    });
    
    app.get('/picture', async function (req: FastifyRequest, reply: FastifyReply) {
        try {
            const db = (app as any).db;
            const id = Number(req.headers['x-user-id']);
            if (Number.isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid user id' });
        }

        const user = await getUserById(db, id);
        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        return reply.status(200).send({ success: true, profilePicture: user.profilePicture });
        }
        catch (err) {
            console.log("[ERROR]: getProfilePicture call failed", err);
            reply.status(500).send({ success: false, message: "getProfilePicture call failed" });
        }
    });

    app.post('/picture', async function (req: FastifyRequest<{ Body: ProfilePicturePayload }>, reply: FastifyReply) {
        try {
            const db = (app as any).db;
            const id = Number(req.headers['x-user-id']);
            if (Number.isNaN(id)) {
                return reply.status(400).send({ error: 'Invalid user id' });
            }

            const data = await req.file();
            if (!data) {
                return reply.status(400).send({ error: 'No file uploaded' });
            }

            if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.mimetype)) {
                return reply.status(400).send({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
            }

            const uploadDir = process.env.PICTURE_PATH;
            const fileName = `${id}.webp`;
            const filePath = path.join(uploadDir, fileName);
            

            const buffer = await data.toBuffer();
            await sharp(buffer)
                .resize(500, 500, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filePath);
                
            const profilePictureUrl = `/picture/${fileName}`;
            await updateProfilePicture(db, id, profilePictureUrl);
            
            return reply.status(200).send({ success: true, profilePicture: profilePictureUrl });
        }
        catch (err) {
            console.log("[ERROR]: updateProfilePicture call failed", err);
            reply.status(500).send({ sucess: false, message: "updateProfilePicture call failed" });
        }
    });
}
