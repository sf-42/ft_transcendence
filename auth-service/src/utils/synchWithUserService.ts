import fetch from 'node-fetch';
import { config } from 'dotenv';

config();
const USER_PORT = process.env.USER_PORT || '3002';
const USER_SERVICE_HOST = process.env.USER_SERVICE_HOST || 'user-service';
const CHAT_SERVICE_HOST = process.env.CHAT_SERVICE_HOST || 'chat-service';
const CHAT_SERVICE_PORT = process.env.CHAT_SERVICE_PORT || '3004';

interface SyncUserPayload {
    id: number,
    username: string,
    createdAt?: string
}

export async function syncUserWithUserService(userRow: SyncUserPayload) {
    try {
        const response = await fetch(`http://${USER_SERVICE_HOST}:${USER_PORT}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userRow),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ERROR]: Sync auth-service to user-service failed: ${errorText}`);
            return null;
        }

        const data = await response.json();
        console.log("[INFO]: User synced: ", data);

        try {
            const chatResponse = await fetch(`http://${CHAT_SERVICE_HOST}:${CHAT_SERVICE_PORT}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userRow.id)
            });

            if (!chatResponse.ok) {
                const errorText = await chatResponse.text();
                console.error(`[ERROR]: Sync auth-service to chat-service failed: ${errorText}`);
            }
        }
        catch (error) {
            console.error('[ERROR]: update with chat-service failed:', error);
        }
        return data;
    }
    catch (error) {
        console.error("[ERROR]: syncUserWithUserService failed: ", error);
        return null;
    }
}

export async function deleteUserFromServices(userId: number) {
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'default_secret';

    // Sync with user-service
    try {
        const response = await fetch(`http://${USER_SERVICE_HOST}:${USER_PORT}/internal/sync`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': internalSecret,
                'x-user-id': userId.toString()
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ERROR]: Delete sync auth-service to user-service failed: ${errorText}`);
        } else {
            console.log(`[INFO]: User ${userId} deleted from user-service`);
        }
    } catch (error) {
        console.error("[ERROR]: deleteUserFromServices (user-service) failed: ", error);
    }

    // Sync with chat-service
    try {
        const chatResponse = await fetch(`http://chat-service:${CHAT_SERVICE_PORT}/internal/sync`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': internalSecret,
                'x-user-id': userId.toString()
            }
        });

        if (!chatResponse.ok) {
            const errorText = await chatResponse.text();
            console.error(`[ERROR]: Delete sync auth-service to chat-service failed: ${errorText}`);
        } else {
            console.log(`[INFO]: User ${userId} deleted from chat-service`);
        }
    } catch (error) {
        console.error("[ERROR]: deleteUserFromServices (chat-service) failed: ", error);
    }
}