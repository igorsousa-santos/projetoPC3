import { create } from 'zustand';
import spotifyService from '../services/spotify';
import lastfmService from '../services/lastfm';
import { userAPI } from '../services/api';
import useListeningHistoryStore from './listeningHistoryStore';

const useAuthStore = create((set, get) => ({
    // ... (rest of store)

    // Auth state
    token: null,
    user: null, // Backend user object (sourced from Last.fm mainly)
    isAuthenticated: false,
    isLoading: true,
    authType: null, // 'lastfm' | 'spotify' (legacy)
    spotifyConnected: false,
    spotifyUserId: null,

    // Last.fm state
    lastfmSessionKey: null,
    lastfmUser: null,

    // Initialize auth from storage - INTEGRADO COM BACKEND
    init: async () => {
        const authToken = localStorage.getItem('auth_token');
        const storedSpotifyUserId = localStorage.getItem('spotify_user_id');
        const storedLastFmSession = localStorage.getItem('lastfm_session_key');
        const storedLastFmUser = localStorage.getItem('lastfm_user');

        if (authToken) {
            try {
                // Verify token and get current user from backend
                const response = await userAPI.getCurrentUser();
                if (response.success && response.data) {
                    const user = response.data;
                    
                    set({
                        user: user,
                        isAuthenticated: true,
                        authType: 'lastfm', // Assuming Last.fm based since it's the new standard
                        isLoading: false,
                        spotifyUserId: user.spotifyId || storedSpotifyUserId,
                        lastfmSessionKey: storedLastFmSession, // Keep local session for direct calls if needed
                        lastfmUser: user.lastfmUsername || (storedLastFmUser ? JSON.parse(storedLastFmUser) : null)
                    });

                    // Check if Spotify is also connected
                    const spotifyToken = spotifyService.getToken();
                    if (spotifyToken) {
                        set({ token: spotifyToken, spotifyConnected: true });
                    }
                    
                    // Sync History
                    useListeningHistoryStore.getState().syncHistory();

                    return;
                } else {
                    // Token expired or invalid
                    localStorage.removeItem('auth_token');
                }
            } catch (error) {
                console.error('Token inválido ou expirado:', error);
                localStorage.removeItem('auth_token');
            }
        }

        set({ isLoading: false });
    },

    // Last.fm Login (Primary)
    loginLastFM: () => {
        const apiKey = import.meta.env.VITE_LASTFM_API_KEY;
        const callbackUrl = `${window.location.origin}/lastfm/callback`;
        window.location.href = `http://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(callbackUrl)}`;
    },
    
    // Alias for main login
    login: () => {
        get().loginLastFM();
    },

    // Handle Last.fm Callback
    handleLastFMCallback: async (token) => {
        try {
            // 1. Authenticate with Backend (which also validates with Last.fm)
            const response = await userAPI.loginLastFM(token);
            
            if (response.success && response.data) {
                const { user, token: jwtToken, lastfmSessionKey } = response.data;

                localStorage.setItem('lastfm_session_key', lastfmSessionKey);
                localStorage.setItem('lastfm_user', JSON.stringify(user.lastfmUsername));
                // auth_token is already set by userAPI.loginLastFM

                set({
                    user: user,
                    isAuthenticated: true,
                    authType: 'lastfm',
                    lastfmSessionKey: lastfmSessionKey,
                    lastfmUser: user.lastfmUsername,
                    spotifyUserId: user.spotifyId
                });

                useListeningHistoryStore.getState().syncHistory();

                return { success: true };
            } else {
                throw new Error(response.message || 'Falha no login com Last.fm');
            }
        } catch (error) {
            console.error('Last.fm auth error:', error);
            return { success: false, error: error.message };
        }
    },

    // Disconnect Last.fm (Logout)
    disconnectLastFM: () => {
        get().logout();
    },

    // Spotify login (Secondary / Link Account)
    loginSpotify: async () => {
        const authUrl = await spotifyService.getAuthUrl();
        window.location.href = authUrl;
    },

    // Connect Spotify to existing account
    connectSpotify: () => {
        get().loginSpotify();
    },

    // Disconnect Spotify
    disconnectSpotify: () => {
        spotifyService.logout();
        localStorage.removeItem('spotify_user_id');
        set({
            token: null,
            spotifyConnected: false,
            spotifyUserId: null
        });
        // TODO: Update backend to remove spotifyId from user?
    },

    // Handle Spotify callback (Linking only)
    handleCallback: async () => {
        console.log('[AuthStore] Handling Spotify callback...');
        const spotifyToken = await spotifyService.handleCallback();

        if (!spotifyToken) {
            return {
                success: false,
                error: 'token_missing',
                message: 'Não foi possível obter o token do Spotify.'
            };
        }

        console.log('[AuthStore] Spotify Token received.');

        // Verify if user is logged in
        if (!get().isAuthenticated) {
            // Can't link if not logged in
            // Store token for playback? Maybe, but better to enforce login.
            // Actually, we can just keep the token locally for playback if they want, 
            // but we should warn them they aren't "logged in".
            // But since the request is to "remove old login code", we strictly treat this as a link action or playback auth.
            
            // Let's set the token just so the Player works if they happen to land here, 
            // but return a message saying "Please login".
            
            set({ token: spotifyToken, spotifyConnected: true });
            return { 
                success: false, 
                message: 'Para vincular sua conta, faça login com Last.fm primeiro. O Spotify foi conectado apenas para reprodução.' 
            };
        }

        // User is authenticated, try to link account
        try {
            const response = await userAPI.verifySpotifyToken(spotifyToken);
            
            if (response.success) {
                const updatedUser = response.data.user; // Backend now returns { success, user }

                // Update local user state
                const currentUser = get().user;
                set({
                    token: spotifyToken,
                    spotifyConnected: true,
                    spotifyUserId: updatedUser.spotifyId,
                    user: { ...currentUser, spotifyId: updatedUser.spotifyId }
                });
                
                localStorage.setItem('spotify_user_id', updatedUser.spotifyId);
                useListeningHistoryStore.getState().syncHistory();
                
                return { success: true, message: 'Spotify vinculado com sucesso!' };
            } else {
                // If linking failed (e.g. already used), we still keep the token for playback session
                set({ token: spotifyToken, spotifyConnected: true });
                return { success: false, message: response.message || 'Erro ao vincular conta.' };
            }

        } catch (error) {
            console.error('Error linking Spotify:', error);
            set({ token: spotifyToken, spotifyConnected: true });
            return { success: false, message: 'Erro ao conectar com o servidor.' };
        }
    },

    // Fetch Spotify user profile
    fetchSpotifyUser: async () => {
        try {
            const spotifyUser = await spotifyService.getUserProfile();
            set({ spotifyUserId: spotifyUser.id });
        } catch (error) {
            console.error('Error fetching Spotify user:', error);
        }
    },

    // Update user profile
    updateUser: async (updates) => {
        try {
            const user = get().user;
            if (!user) return null;

            const response = await userAPI.update(user.id, updates);
            if (response.success && response.data) {
                set({ user: response.data });
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('Update user error:', error);
            return null;
        }
    },

    // Logout
    logout: () => {
        userAPI.logout();
        spotifyService.logout();
        localStorage.removeItem('spotify_user_id');
        localStorage.removeItem('lastfm_session_key');
        localStorage.removeItem('lastfm_user');
        set({
            token: null,
            user: null,
            isAuthenticated: false,
            authType: null,
            spotifyConnected: false,
            spotifyUserId: null,
            lastfmSessionKey: null,
            lastfmUser: null
        });
    }
}));

export default useAuthStore;
