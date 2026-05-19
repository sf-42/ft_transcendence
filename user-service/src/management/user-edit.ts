import { dbPromise } from "../db";
import { SyncUserBody } from "../user-interfaces";
import { FastifyRequest, FastifyReply, FastifyLogFn } from "fastify";
import { User, getUserById, updateUser, updateUserStats, updateUserKeyBinds } from '../db';

export async function syncUser(app: any, req: FastifyRequest<{ body: Partial<User> }>, reply: FastifyReply) {
    try {
        const db = (app as any).db;
        // const id = Number((req.params as any).id);
        
        console.log("Content-Type:", req.headers['content-type']);
        console.log("Full body received:", typeof req.body, req.body);
        
        // Parse body if it's a string
        let bodyData = req.body;
        if (typeof req.body === 'string') {
            try {
                bodyData = JSON.parse(req.body);
            } catch (e) {
                console.log("Failed to parse body as JSON");
            }
        }
        
        const param: Partial<User> = (bodyData as any).params;
        const headerId = req.headers['x-user-id'];
        if (typeof headerId !== "string")
        { return reply.status(400).send({ succes: false, message: "Invalid header Id" });}

        const id = Number(headerId);
        if (Number.isNaN(id))
            return reply.status(400).send({ error: 'Invalid id' });

        const user = await getUserById(db, id);
        if (!user)
            return reply.status(404).send({ error: 'User not found' });

        console.log("Updating user", id);
        console.log("Parameters updated:", param);

        if (param.avatar || param.bike) {
            console.log("Calling updateUser");
            await updateUser(db, id, param);
        }
        if (param.stats !== undefined)
            await updateUserStats(db, id, param.stats);
        if (param.keyBinds !== undefined)
            await updateUserKeyBinds(db, id, param.keyBinds);

        const updatedUser = await getUserById(db, id);

        return reply.status(200).send(updatedUser);
    }
    catch (err) {
        console.log("[ERROR]: user-service, syncUser failed", err);
        return reply.status(500).send({ success: false, message: "Internal error" });
    }
}

