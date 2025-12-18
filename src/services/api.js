import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add interceptor to include auth token in requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Helper for standardized responses
const handleResponse = async (request) => {
    try {
        const response = await request;
        return { success: true, data: response.data };
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        return { 
            success: false, 
            message: error.response?.data?.message || 'Ocorreu um erro na comunicação com o servidor.' 
        };
    }
};

// --- USER API ---

export const userAPI = {
    getCurrentUser: () => handleResponse(api.get('/auth/me')),

    signup: async (name, email, password) => {
        const res = await handleResponse(api.post('/auth/signup', { name, email, password }));
        if (res.success && res.data.token) {
            localStorage.setItem('auth_token', res.data.token);
        }
        return res;
    },

    login: async (email, password) => {
        const res = await handleResponse(api.post('/auth/login', { email, password }));
        if (res.success && res.data.token) {
            localStorage.setItem('auth_token', res.data.token);
        }
        return res;
    },

    update: (id, updates) => handleResponse(api.put(`/users/${id}`, updates)),

    logout: () => {
        localStorage.removeItem('auth_token');
        return { success: true };
    }
};

// --- PLAYLIST API ---

export const playlistAPI = {
    getAll: () => handleResponse(api.get('/playlists')),

    create: (name, description, tracks, isPublic) => 
        handleResponse(api.post('/playlists', { name, description, tracks, isPublic })),

    update: (id, updates) => handleResponse(api.put(`/playlists/${id}`, updates)),

    delete: (id) => handleResponse(api.delete(`/playlists/${id}`)),

    addTrack: async (playlistId, track) => {
        // Get current playlist tracks first (simplified)
        const res = await playlistAPI.getAll();
        if (!res.success) return res;
        
        const playlist = res.data.find(p => p.id === playlistId);
        if (!playlist) return { success: false, message: 'Playlist not found' };
        
        const updatedTracks = [...playlist.tracks, track];
        return playlistAPI.update(playlistId, { tracks: updatedTracks });
    },

    removeTrack: async (playlistId, trackId) => {
        const res = await playlistAPI.getAll();
        if (!res.success) return res;
        
        const playlist = res.data.find(p => p.id === playlistId);
        if (!playlist) return { success: false, message: 'Playlist not found' };
        
        const updatedTracks = playlist.tracks.filter(t => t.id !== trackId);
        return playlistAPI.update(playlistId, { tracks: updatedTracks });
    }
};

// --- AI API ---
export const aiAPI = {
    generateRecommendations: (prompt, limit, context) => 
        handleResponse(api.post('/recommendations/generate', { prompt, limit, context })),
    
    analyzeMusicalTaste: (topArtists, topTracks) =>
        handleResponse(api.post('/ai/analyze', { topArtists, topTracks })),
    
    describePlaylist: (name, tracks) =>
        handleResponse(api.post('/ai/describe-playlist', { name, tracks }))
};