import axios from 'axios';

const configuredApiRoot = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
export const apiRoot = configuredApiRoot === '/api' || /\/api$/i.test(configuredApiRoot)
  ? configuredApiRoot
  : `${configuredApiRoot}/api`;
export const api = axios.create({ baseURL: apiRoot, timeout: 20000, headers: { Accept: 'application/json' } });
