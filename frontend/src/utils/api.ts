import axios from 'axios';
import { resolveApiUrl } from '../utils/urlUtils';

const api = axios.create({
    baseURL: resolveApiUrl('/api')
});

export type LogEntry = {
    id: string;
    timestamp: string;
    level: string;
    logger: string;
    thread: string;
    message: string;
};

export const systemApi = {
    streamLogs: () => {
        return new EventSource(resolveApiUrl('/api/system/logs'));
    },
    logs: (params?: { level?: string; query?: string; limit?: number }) => api.get('/system/logs/history', { params }),
    clearLogs: () => api.delete('/system/logs'),
    getHealth: () => api.get('/system/health')
};

export const settingsApi = {
    get: () => api.get('/settings'),
    models: (provider: 'minimax' | 'deepseek') => api.get(`/settings/${provider}/models`),
    update: (provider: 'minimax' | 'deepseek', payload: { apiKey?: string; model?: string }) => api.post(`/settings/${provider}`, payload)
};

export const chatApi = {
    ask: (message: string) => api.post('/chat/ask', { message }),
    stream: (message: string) => {
        return new EventSource(resolveApiUrl('/api/chat/stream?message=' + encodeURIComponent(message)));
    }
};

export type ProviderMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

export const deepSeekApi = {
    ask: (message: string, messages: ProviderMessage[]) => api.post('/deepseek/chat/ask', { message, messages }),
    balance: () => api.get('/deepseek/account/balance'),
    usage: () => api.get('/deepseek/account/usage')
};

export const imageApi = {
    history: () => api.get('/images/history'),
    deleteHistory: (id: string) => api.delete(`/images/history/${id}`),
    clearHistory: () => api.delete('/images/history')
};

export const ttsApi = {
    voices: () => api.get('/tts/voices'),
    history: () => api.get('/tts/history'),
    deleteHistory: (id: string) => api.delete(`/tts/history/${id}`),
    clearHistory: () => api.delete('/tts/history'),
    generate: (payload: {
        text: string;
        voiceId?: string;
        model?: string;
        format?: string;
        speed?: number;
        vol?: number;
        pitch?: number;
        sampleRate?: number;
        bitrate?: number;
    }) => api.post('/tts/tts', payload),
    preview: (payload: {
        text: string;
        voiceId?: string;
        model?: string;
        format?: string;
        speed?: number;
        vol?: number;
        pitch?: number;
        sampleRate?: number;
        bitrate?: number;
    }) => api.post('/tts/preview', payload)
};
