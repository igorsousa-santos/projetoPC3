/**
 * Mock API Service
 * Simulates backend interactions using localStorage for persistence.
 */

const STORAGE_KEYS = {
    USER: 'music_horizon_user',
    PLAYLISTS: 'music_horizon_playlists',
    AUTH_TOKEN: 'auth_token'
};

// Helper to simulate network delay
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

// --- USER API ---

export const userAPI = {
    getCurrentUser: async () => {
        await delay();
        const userJson = localStorage.getItem(STORAGE_KEYS.USER);
        if (!userJson) return { success: false, message: 'Not authenticated' };
        return { success: true, data: JSON.parse(userJson) };
    },

    signup: async (name, email, password) => {
        await delay();
        // Check if user already exists (simplified: only one user supported in local mock)
        const existing = localStorage.getItem(STORAGE_KEYS.USER);
        if (existing) {
             const user = JSON.parse(existing);
             if (user.email === email) {
                 return { success: false, message: 'User already exists' };
             }
        }

        const newUser = {
            id: 'user_' + Date.now(),
            name,
            email,
            avatar: null,
            createdAt: new Date().toISOString()
        };

        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'mock_token_' + Date.now());
        
        return { 
            success: true, 
            data: { user: newUser, token: localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) } 
        };
    },

    login: async (email, password) => {
        await delay();
        const userJson = localStorage.getItem(STORAGE_KEYS.USER);
        
        if (!userJson) {
            // Auto-signup for MVP/Demo purposes if user doesn't exist? 
            // Better to fail to mimic real auth, but authStore logic suggests simpler flow.
            // Let's stick to: if email matches stored user, login.
            return { success: false, message: 'User not found' };
        }

        const user = JSON.parse(userJson);
        if (user.email !== email) {
            return { success: false, message: 'Invalid credentials' };
        }

        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'mock_token_' + Date.now());
        return { 
            success: true, 
            data: { user, token: localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) } 
        };
    },

    update: async (id, updates) => {
        await delay();
        const userJson = localStorage.getItem(STORAGE_KEYS.USER);
        if (!userJson) return { success: false, message: 'User not found' };

        const user = JSON.parse(userJson);
        if (user.id !== id) return { success: false, message: 'Unauthorized' };

        const updatedUser = { ...user, ...updates };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
        
        return { success: true, data: updatedUser };
    },

    logout: async () => {
        await delay(100);
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        // localStorage.removeItem(STORAGE_KEYS.USER); // Optional: keep user data?
        return { success: true };
    }
};

// --- PLAYLIST API ---

export const playlistAPI = {
    getAll: async () => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        const playlists = playlistsJson ? JSON.parse(playlistsJson) : [];
        return { success: true, data: playlists };
    },

    create: async (name, description, tracks, isPublic) => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        const playlists = playlistsJson ? JSON.parse(playlistsJson) : [];

        const newPlaylist = {
            id: 'pl_' + Date.now(),
            name,
            description,
            tracks,
            isPublic,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            exported: false,
            spotifyId: null
        };

        playlists.push(newPlaylist);
        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));

        return { success: true, data: newPlaylist };
    },

    update: async (id, updates) => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        if (!playlistsJson) return { success: false, message: 'No playlists found' };

        let playlists = JSON.parse(playlistsJson);
        const index = playlists.findIndex(p => p.id === id);

        if (index === -1) return { success: false, message: 'Playlist not found' };

        playlists[index] = { 
            ...playlists[index], 
            ...updates, 
            updatedAt: new Date().toISOString() 
        };
        
        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
        return { success: true, data: playlists[index] };
    },

    delete: async (id) => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        if (!playlistsJson) return { success: false, message: 'No playlists found' };

        let playlists = JSON.parse(playlistsJson);
        const filtered = playlists.filter(p => p.id !== id);
        
        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(filtered));
        return { success: true };
    },

    addTrack: async (playlistId, track) => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        if (!playlistsJson) return { success: false, message: 'No playlists found' };

        let playlists = JSON.parse(playlistsJson);
        const index = playlists.findIndex(p => p.id === playlistId);

        if (index === -1) return { success: false, message: 'Playlist not found' };

        playlists[index].tracks.push(track);
        playlists[index].updatedAt = new Date().toISOString();

        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
        return { success: true, data: playlists[index] };
    },

    removeTrack: async (playlistId, trackId) => {
        await delay();
        const playlistsJson = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        if (!playlistsJson) return { success: false, message: 'No playlists found' };

        let playlists = JSON.parse(playlistsJson);
        const index = playlists.findIndex(p => p.id === playlistId);

        if (index === -1) return { success: false, message: 'Playlist not found' };

        playlists[index].tracks = playlists[index].tracks.filter(t => t.id !== trackId);
        playlists[index].updatedAt = new Date().toISOString();

        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
        return { success: true, data: playlists[index] };
    }
};
