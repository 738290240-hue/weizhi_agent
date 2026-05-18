import axios from 'axios';
import { resolveApiUrl } from '../utils/urlUtils';
const api = axios.create({
    baseURL: resolveApiUrl('/api')
});
export const systemApi = {
    streamLogs: () => {
        return new EventSource(resolveApiUrl('/api/system/logs'));
    },
    logs: (params) => api.get('/system/logs/history', { params }),
    clearLogs: () => api.delete('/system/logs'),
    getHealth: () => api.get('/system/health')
};
export const settingsApi = {
    get: () => api.get('/settings'),
    models: (provider) => api.get(`/settings/${provider}/models`),
    update: (provider, payload) => api.post(`/settings/${provider}`, payload)
};
export const chatApi = {
    ask: (message) => api.post('/chat/ask', { message }),
    stream: (message) => {
        return new EventSource(resolveApiUrl('/api/chat/stream?message=' + encodeURIComponent(message)));
    }
};
export const deepSeekApi = {
    ask: (message, messages) => api.post('/deepseek/chat/ask', { message, messages }),
    balance: () => api.get('/deepseek/account/balance'),
    usage: () => api.get('/deepseek/account/usage')
};
export const imageApi = {
    history: () => api.get('/images/history'),
    deleteHistory: (id) => api.delete(`/images/history/${id}`),
    clearHistory: () => api.delete('/images/history')
};
export const ttsApi = {
    voices: () => api.get('/tts/voices'),
    history: () => api.get('/tts/history'),
    deleteHistory: (id) => api.delete(`/tts/history/${id}`),
    clearHistory: () => api.delete('/tts/history'),
    generate: (payload) => api.post('/tts/tts', payload),
    preview: (payload) => api.post('/tts/preview', payload)
};
