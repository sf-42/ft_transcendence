import axios from 'axios';
import {type AxiosHeaders, type AxiosRequestHeaders, } from 'axios';

interface RequestConfig {
    url: string;
    method?: string;
    data?: any;
    headers?: AxiosRequestHeaders;
    [key: string]: any;
}

interface ResponseData<T = any> {
    data: T;
    status?: number;
    statusText?: string;
    headers?: Record<string, any>;
}

interface HttpError extends Error {
    response?: {
        status: number;
        data: any;
        headers: Record<string, any>;
    };
    request?: any;
    message: string;
}

const axiosInstance = axios.create({
  baseURL: process.env.MATCHMAKING_SERVICE_URL || 'http://matchmaking-service:3003',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});


axiosInstance.interceptors.request.use(cfg => {
    // service token a inject
  return cfg;
});

axiosInstance.interceptors.response.use(
  res => res,
  (err:unknown) => {
    const httpError = err as HttpError
    // normaliser l'erreur
    return Promise.reject(httpError);
  }
);

const userAxiosInstance = axios.create({
  baseURL: process.env.USER_SERVICE_URL || 'http://user-service:3002',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

userAxiosInstance.interceptors.request.use(cfg => {
    // service token a inject
  return cfg;
});

userAxiosInstance.interceptors.response.use(
  res => res,
  (err:unknown) => {
    const httpError = err as HttpError
    // normaliser l'erreur
    return Promise.reject(httpError);
  }
);

async function request<T = any>(config: RequestConfig, instance = axiosInstance): Promise<ResponseData<T>> 
{
    const { url, method = 'GET', data, headers = {}, ...rest } = config;
    try 
    {
        const res = await instance.request({ url, method, data, headers, ...rest });
            return { data: res.data as T, status: res.status, headers: res.headers };
    } 
    catch (err: unknown) 
    {
        if (axios.isAxiosError(err)) 
        {
            const aErr = err;
            throw {
                message: aErr.message,
                response: aErr.response ? { status: aErr.response.status, data: aErr.response.data, headers: aErr.response.headers } : undefined,
                request: aErr.request
            } as HttpError;
        }
        throw err;
    }
}

const http = {
    request,
    get<T = any>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}) {
        return request<T>({ ...config, url, method: 'GET' });
    },
    post<T = any>(url: string, data?: any, config: Omit<RequestConfig, 'url' | 'method' | 'data'> = {}) {
        return request<T>({ ...config, url, method: 'POST', data });
    },
    put<T = any>(url: string, data?: any, config: Omit<RequestConfig, 'url' | 'method' | 'data'> = {}) {
        return request<T>({ ...config, url, method: 'PUT', data });
    },
    delete<T = any>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}) {
        return request<T>({ ...config, url, method: 'DELETE' });
    }
};

export const userHttp = {
    request: (config: RequestConfig) => request(config, userAxiosInstance),
    get<T = any>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}) {
        return request<T>({ ...config, url, method: 'GET' }, userAxiosInstance);
    },
    post<T = any>(url: string, data?: any, config: Omit<RequestConfig, 'url' | 'method' | 'data'> = {}) {
        return request<T>({ ...config, url, method: 'POST', data }, userAxiosInstance);
    },
    put<T = any>(url: string, data?: any, config: Omit<RequestConfig, 'url' | 'method' | 'data'> = {}) {
        return request<T>({ ...config, url, method: 'PUT', data }, userAxiosInstance);
    },
    delete<T = any>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}) {
        return request<T>({ ...config, url, method: 'DELETE' }, userAxiosInstance);
    }
};

export default http;
