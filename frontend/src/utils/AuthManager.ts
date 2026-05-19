import http from "./http.ts";
import { navigateTo, socialOverlay } from "../main.ts";

export class AuthManager {
    public static waitingInterval?: number;

    // ===== Authentication state =====
    static async isLoggedIn(): Promise<boolean> {
        try {
            const res = await http.get("/auth/loggedin");
            return res.data.success;
        } catch {
            return false;
        }
    }

    static async logout() {
        try {
            // Disconnect WebSocket before calling logout API
            if (socialOverlay) {
                socialOverlay.disconnect();
            }
            await http.post("/auth/logout", {});
        } catch (err) {
            console.error("Logout failed:", err);
        } finally {
            this.clearLocalUser();
            this.redirectToLogin();
        }
    }

    // ===== Local user info =====
    static setUser(user: any) {
        localStorage.setItem("user", JSON.stringify(user));
    }

    static getUser(): any | null {
        const u = localStorage.getItem("user");
        return u ? JSON.parse(u) : null;
    }

    static clearLocalUser() {
        localStorage.removeItem("user");
    }

    // ===== UI Feedback =====
    static showMessage(text: string, type: "error" | "success" | "info") {
        const message =
            document.getElementById("signup-message") ||
            document.getElementById("login-message");

        if (message) {
            let colorClass =
                type === "error"
                    ? "text-red-400"
                    : type === "success"
                    ? "text-green-400"
                    : "text-yellow-400";

            message.className = `text-center mt-4 p-2 text-xl ${colorClass}`;
            message.textContent = text;
        }
    }

    // ===== Navigation =====
    static redirectToDashboard() {
        setTimeout(() => {
            window.history.pushState(null, "", "/");
            window.dispatchEvent(new PopStateEvent("popstate"));
        }, 800);
    }

    static redirectToLogin() {
        setTimeout(() => {
            // window.history.pushState(null, "", "/login");
            // window.dispatchEvent(new PopStateEvent("popstate"));
            navigateTo("/login");
        }, 300);
    }

    // ===== Optional: handle 2FA UI helpers =====
    static show2faPrompt() {
        const twofaDiv = document.getElementById("twofa-prompt");
        if (twofaDiv) twofaDiv.style.display = "block";
    }

    // ===== OAuth provider check =====
    static async getOAuthProvider(): Promise<string | null> {
        try {
            const res = await http.get("/auth/status");
            return res.data?.oauthProvider || null;
        } catch {
            return null;
        }
    }

    static async isOAuthUser(): Promise<boolean> {
        const provider = await this.getOAuthProvider();
        return provider !== null;
    }
}
