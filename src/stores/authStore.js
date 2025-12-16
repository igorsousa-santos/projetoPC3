import { create } from 'zustand';
import spotifyService from '../services/spotify';
import lastfmService from '../services/lastfm';
import { userAPI } from '../services/api';
import useGamificationStore from './gamificationStore';

const useAuthStore = create((set, get) => ({
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

    // Local signup - INTEGRADO COM BACKEND
    signupLocal: async (name, email, password = '') => {
        try {
            const response = await userAPI.signup(name, email, password);
            if (response.success && response.data) {
                set({
                    user: response.data.user,
                    isAuthenticated: true,
                    authType: 'local',
                    isLoading: false
                });
                return response.data.user;
            }
            throw new Error(response.message || 'Erro ao criar conta');
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    },

    // Local login - INTEGRADO COM BACKEND
    loginLocal: async (email, password = '') => {
        try {
            const response = await userAPI.login(email, password);
            if (response.success && response.data) {
                set({
                    user: response.data.user,
                    isAuthenticated: true,
                    authType: 'local',
                    isLoading: false
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
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
        const token = await spotifyService.handleCallback();

        if (token) {
            console.log('[AuthStore] Token received, updating state...');
            set({ token, spotifyConnected: true });

            useGamificationStore.getState().trackSpotifyConnected();

            if (!get().user) {
                console.log('[AuthStore] No local user, creating from Spotify data...');
                await get().fetchSpotifyUser(true);
            } else {
                console.log('[AuthStore] Local user exists, just updating Spotify connection...');
                await get().fetchSpotifyUser(false);
            }

            return {
                success: true,
                message: 'Spotify conectado com sucesso!'
            };
        }

        console.error('[AuthStore] Failed to get token from callback URL');
        return {
            success: false,
            error: 'token_missing',
            message: 'Não foi possível obter o token de autenticação. Tente novamente.'
        };
    },

    // Fetch Spotify user profile
    fetchSpotifyUser: async (createLocalUser = false) => {
        try {
            const spotifyUser = await spotifyService.getUserProfile();

            localStorage.setItem('spotify_user_id', spotifyUser.id);
            set({ spotifyUserId: spotifyUser.id });

            if (createLocalUser) {
                // Criar usuário no backend a partir dos dados do Spotify
                try {
                    const response = await userAPI.signup(
                        spotifyUser.display_name,
                        spotifyUser.email
                    );
                    if (response.success && response.data) {
                        set({
                            user: response.data.user,
                            isAuthenticated: true,
                            authType: 'spotify',
                            spotifyConnected: true,
                            isLoading: false
                        });
                    }
                } catch (error) {
                    // Se o usuário já existe, tenta fazer login
                    const loginResponse = await userAPI.login(spotifyUser.email);
                    if (loginResponse.success && loginResponse.data) {
                        set({
                            user: loginResponse.data.user,
                            isAuthenticated: true,
                            authType: 'spotify',
                            spotifyConnected: true,
                            isLoading: false
                        });
                    }
                }
            } else {
                set({ isLoading: false });
            }
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
