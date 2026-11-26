import axios from 'axios';

export const apiRoot = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const api = axios.create({ baseURL: apiRoot, timeout: 20000, headers: { Accept: 'application/json' } });
