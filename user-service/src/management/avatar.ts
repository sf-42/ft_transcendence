import { dbPromise } from "../db";
import { userChangeAvatarPayload } from "../user-interfaces";
import { FastifyRequest, FastifyReply, FastifyLogFn } from "fastify";
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export async function updateAvatar(req: FastifyRequest<{ Body: userChangeAvatarPayload }>, reply: FastifyReply) {
    try {
        const db = await dbPromise;
        if (!db) { throw new Error("Failed to load db"); }

        const userIdHeader = req.headers["x-user-id"];
        if (typeof userIdHeader !== "string") { throw new Error("Missing x-user-id header"); }

        const userId = Number(userIdHeader);
        if (!Number.isInteger(userId) || userId <= 0) { throw new Error("Invalid x-user-id number") }

        const { avatar } = req.body;
        if (!avatar) { throw new Error("Missing avatar element in body"); }

        const allowedAvatars = ["avatar1", "avatar2", "avatar3"];  // Ask hugo list of avatars
        if (!allowedAvatars.includes(avatar)) { return reply.status(400).send({ success: false, message: "Unknown avatar" }); }

        db.run("UPDATE users SET avatar = ? WHERE id = ?;", [avatar, userId]);
        reply.status(200).send({ success: true, message: "Avatar updated successfully", avatar });

    }
    catch (err) {
        console.log("[ERROR]: users-service setAvatar function failed: ", err);
        reply.status(500).send({ success: false, message: "Server internal error" });
    }
}