// HTTP client wrapper around fetch()
// Handles JSON, cookies, query params, and errors automatically

const API_URL = import.meta.env.VITE_API_URL || '';

interface HttpResponse<T = any> {
    data: T;
    status: number;
    ok: boolean;
}

interface HttpError extends Error {
    status?: number;
    data?: any;
}

interface HttpRequestOptions extends RequestInit {
    params?: Record<string, string | number | boolean | (string | number | boolean)[]>;
}

// Main request function
async function request<T = any>(
    method: string,
    endpoint: string,
    body?: any,
    options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
    const url = buildUrl(endpoint, options.params);

    // Remove params from options (not supported by fetch)
    const { params: _unused, ...fetchOptions } = options;
    
    const config: RequestInit = {
        method,
        credentials: 'include', // Send cookies for auth
        headers: {
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
        },
        ...fetchOptions,
    };

    const isBinaryData = body instanceof FormData;
    if (isBinaryData) {
        delete (config.headers as any)['Content-Type'];
        config.body = body;
    }
    else if (body && method !== 'GET') {
        config.body = JSON.stringify(body);
    }

    const response = await fetch(url, config);
    
    // Handle empty responses (204 No Content)
    const data = response.status === 204 
        ? null 
        : await response.json().catch(() => null);
    
    // Throw on HTTP errors (4xx, 5xx)
    if (!response.ok) {
        const error: HttpError = new Error(
            data?.message || data?.error || `HTTP Error ${response.status}`
        );
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return { data, status: response.status, ok: response.ok };
}

// Build URL with query params: { page: 1 } => ?page=1
function buildUrl(endpoint: string, params?: HttpRequestOptions['params']): string {
    let url = `${API_URL}${endpoint}`;
    
    if (!params) return url;

    const searchParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        
        if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, String(v)));
        } else {
            searchParams.append(key, String(value));
        }
    }

    const queryString = searchParams.toString();
    if (queryString) {
        url += url.includes('?') ? '&' : '?';
        url += queryString;
    }

    return url;
}

const http = {
    get: <T = any>(endpoint: string, options?: HttpRequestOptions) => 
        request<T>('GET', endpoint, undefined, options),
    
    post: <T = any>(endpoint: string, body?: any, options?: HttpRequestOptions) => 
        request<T>('POST', endpoint, body, options),
    
    put: <T = any>(endpoint: string, body?: any, options?: HttpRequestOptions) => 
        request<T>('PUT', endpoint, body, options),
    
    // DELETE accepts either (endpoint, options) or (endpoint, body, options)
    delete: <T = any>(endpoint: string, bodyOrOptions?: any, maybeOptions?: HttpRequestOptions) => {
        const isOptions = bodyOrOptions && typeof bodyOrOptions === 'object' 
            && ('headers' in bodyOrOptions || 'credentials' in bodyOrOptions || 'params' in bodyOrOptions);

        if (isOptions) {
            return request<T>('DELETE', endpoint, undefined, bodyOrOptions);
        }
        return request<T>('DELETE', endpoint, bodyOrOptions, maybeOptions);
    },
    
    patch: <T = any>(endpoint: string, body?: any, options?: HttpRequestOptions) => 
        request<T>('PATCH', endpoint, body, options),
};

export default http;
