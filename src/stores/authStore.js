import { create } from 'zustand';
import spotifyService from '../services/spotify';
import lastfmService from '../services/lastfm';
import { userAPI } from '../services/api';
import useListeningHistoryStore from './listeningHistoryStore';

const useAuthStore = create((set, get) => ({
    // ... (rest of store)

    // Auth state
    token: null,
    user: null,
    isAuthenticated: false,
    isLoading: true,
    authType: null, // 'local' | 'spotify' | null
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
                // Verificar se o token ainda é válido buscando o usuário atual
                const response = await userAPI.getCurrentUser();
                if (response.success && response.data) {
                    set({
                        user: response.data,
                        isAuthenticated: true,
                        authType: 'local',
                        isLoading: false,
                        spotifyUserId: storedSpotifyUserId,
                        lastfmSessionKey: storedLastFmSession,
                        lastfmUser: storedLastFmUser ? JSON.parse(storedLastFmUser) : null
                    });

                    // Check if Spotify is also connected
                    const spotifyToken = spotifyService.getToken();
                    if (spotifyToken) {
                        set({ token: spotifyToken, spotifyConnected: true });
                        get().fetchSpotifyUser();
                    }
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

        // Check for Spotify only auth (legacy)
        const spotifyToken = spotifyService.getToken();
        if (spotifyToken) {
            set({
                token: spotifyToken,
                isAuthenticated: true,
                authType: 'spotify',
                spotifyConnected: true,
                spotifyUserId: storedSpotifyUserId,
                lastfmSessionKey: storedLastFmSession,
                lastfmUser: storedLastFmUser ? JSON.parse(storedLastFmUser) : null
            });
            get().fetchSpotifyUser();
        } else {
            set({ isLoading: false });
        }
    },

    // Last.fm Login
    loginLastFM: () => {
        const apiKey = import.meta.env.VITE_LASTFM_API_KEY;
        const callbackUrl = `${window.location.origin}/lastfm/callback`;
        window.location.href = `http://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(callbackUrl)}`;
    },

    // Handle Last.fm Callback
    handleLastFMCallback: async (token) => {
        try {
            const session = await lastfmService.getSession(token);
            if (session) {
                localStorage.setItem('lastfm_session_key', session.key);
                localStorage.setItem('lastfm_user', JSON.stringify(session.name));

                set({
                    lastfmSessionKey: session.key,
                    lastfmUser: session.name
                });
                return { success: true };
            }
        } catch (error) {
            console.error('Last.fm auth error:', error);
            return { success: false, error: error.message };
        }
    },

    // Disconnect Last.fm
    disconnectLastFM: () => {
        localStorage.removeItem('lastfm_session_key');
        localStorage.removeItem('lastfm_user');
        set({
            lastfmSessionKey: null,
            lastfmUser: null
        });
    },

    // Spotify login
    loginSpotify: async () => {
        const authUrl = await spotifyService.getAuthUrl();
        window.location.href = authUrl;
    },

    // Connect Spotify to existing local account
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
    },

    // Handle Spotify callback
    handleCallback: async () => {
        console.log('[AuthStore] Handling Spotify callback...');
        const spotifyToken = await spotifyService.handleCallback();

        if (spotifyToken) {
            console.log('[AuthStore] Spotify Token received. Authenticating with Backend...');
            
            try {
                // Exchange Spotify Token for App Session
                const response = await userAPI.verifySpotifyToken(spotifyToken);
                
                if (response.success && response.data) {
                    const { user, token } = response.data;
                    
                    set({
                        token: spotifyToken, // Keep spotify token for playback
                        user: user,          // Backend user data
                        isAuthenticated: true,
                        authType: 'spotify',
                        spotifyConnected: true,
                        spotifyUserId: user.spotifyId,
                        isLoading: false
                    });

                    localStorage.setItem('spotify_user_id', user.spotifyId);
                    useGamificationStore.getState().trackSpotifyConnected();
                    useListeningHistoryStore.getState().syncWithSpotify();
                    
                    return { success: true, message: 'Login realizado com sucesso!' };
                } else {
                    throw new Error(response.message || 'Falha na autenticação com o servidor');
                }
            } catch (error) {
                console.error('[AuthStore] Backend auth failed:', error);
                return { 
                    success: false, 
                    error: 'backend_error',
                    message: 'Erro ao conectar com o servidor. Tente novamente.' 
                };
            }
        }

        console.error('[AuthStore] Failed to get token from callback URL');
        return {
            success: false,
            error: 'token_missing',
            message: 'Não foi possível obter o token de autenticação.'
        };
    },

    // Fetch Spotify user profile (Legacy/Optional now since backend handles it)
    fetchSpotifyUser: async () => {
        // Keeps local store in sync if needed, but primary source is now backend user
        try {
            const spotifyUser = await spotifyService.getUserProfile();
            set({ spotifyUserId: spotifyUser.id });
        } catch (error) {
            console.error('Error fetching Spotify user:', error);
        }
    },

    // Update user profile - INTEGRADO COM BACKEND
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
