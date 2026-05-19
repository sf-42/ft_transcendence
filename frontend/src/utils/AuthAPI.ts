class AuthAPI {
    private baseURL: string;
    private token: string | null = null;

    constructor() {
        this.baseURL = 'http://localhost:8080';
        
        this.token = localStorage.getItem('authToken');
    }

    private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
        const url = `${this.baseURL}${endpoint}`;
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    }

    async signup(email: string, password: string, username: string) {
        const data = await this.makeRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, username }),
        });

        return data;
    }

    async login(email: string, password: string) {
        const data = await this.makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        if (data.token) {
            this.token = data.token;
            
            if (data.user && data.user.mfaVerified) {
                localStorage.setItem('authToken', data.token);
            }
        }

        return data;
    }

    async setup2FA() {
        const data = await this.makeRequest('/auth/2fa/setup', {
            method: 'POST',
        });

        return data;
    }

    async verify2FA(code: string) {
        const data = await this.makeRequest('/auth/2fa/verify', {
            method: 'POST',
            body: JSON.stringify({ code }),
        });

        if (data.token) {
            this.token = data.token;
            localStorage.setItem('authToken', data.token);
        }

        return data;
    }

    async getProfile() {
        const data = await this.makeRequest('/auth/me', {
            method: 'GET',
        });

        return data.user;
    }

    logout() {
        this.token = null;
        localStorage.removeItem('authToken');
    }

    isAuthenticated(): boolean {
        return !!this.token;
    }

    getToken(): string | null {
        return this.token;
    }
}

export const authAPI = new AuthAPI();