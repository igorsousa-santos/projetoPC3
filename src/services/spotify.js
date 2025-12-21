const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-top-read',
    'streaming',
    'user-read-email',
    'user-read-private',
    'playlist-modify-public',
    'playlist-modify-private',
    "playlist-read-private",
    "playlist-read-collaborative"
];

class SpotifyService {
    constructor() {
        this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
        this.redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
    }

    // --- PKCE HELPERS ---

    generateRandomString(length) {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    async generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return this.base64encode(digest);
    }

    base64encode(string) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    // --- AUTH FLOW ---

    async getAuthUrl() {
        const codeVerifier = this.generateRandomString(128);
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // Persist verifier across the redirect (duplicate in sessionStorage as a safety net)
        // Store verifier for the callback step
        localStorage.setItem('spotify_code_verifier', codeVerifier);
        sessionStorage.setItem('spotify_code_verifier', codeVerifier);
        // Also drop a short-lived cookie in case storage is wiped by privacy settings
        document.cookie = `spotify_code_verifier=${codeVerifier}; path=/; max-age=600; SameSite=Lax`;

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code', // PKCE uses 'code', not 'token'
            redirect_uri: this.redirectUri,
            scope: SCOPES.join(' '),
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            show_dialog: 'false',
            // Echo verifier in state so we can recover if storage gets cleared by the browser
            state: codeVerifier
        });

        return `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
    }

    // Handle the callback (exchange code for token)
    async handleCallback() {
        console.log('[Spotify] Starting handleCallback...');
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            console.error('[Spotify] Auth Error from URL:', error);
            alert(`Erro do Spotify: ${error}`);
            return null;
        }

        if (!code) {
            console.warn('[Spotify] No code in URL.');
            // Check if we have a hash token (legacy/fallback)
            if (window.location.hash.includes('access_token')) {
                console.log('[Spotify] Found hash token (legacy flow).');
                return this.getTokenFromHash();
            }
            return null;
        }

        // PKCE: Exchange code for token
        let codeVerifier = localStorage.getItem('spotify_code_verifier') || sessionStorage.getItem('spotify_code_verifier');

        // Recover from state if storage was cleared (some browsers wipe localStorage on redirect)
        if (!codeVerifier) {
            const stateVerifier = params.get('state');
            if (stateVerifier) {
                codeVerifier = stateVerifier;
                localStorage.setItem('spotify_code_verifier', codeVerifier);
                sessionStorage.setItem('spotify_code_verifier', codeVerifier);
            }
        }

        // Fallback to cookie if both storage and state failed (privacy modes)
        if (!codeVerifier) {
            const cookieMatch = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('spotify_code_verifier='));
            if (cookieMatch) {
                codeVerifier = cookieMatch.split('=')[1];
                localStorage.setItem('spotify_code_verifier', codeVerifier);
                sessionStorage.setItem('spotify_code_verifier', codeVerifier);
            }
        }

        console.log('[Spotify] Code:', code ? 'Present' : 'Missing');
        console.log('[Spotify] Verifier:', codeVerifier ? 'Present' : 'Missing');
        
        if (!codeVerifier) {
            console.error('[Spotify] No code verifier found in localStorage!');
            const stateInUrl = params.get('state');
            console.warn('[Spotify] State param:', stateInUrl ? 'Present' : 'Missing');
            return null;
        }

        try {
            console.log('[Spotify] Exchanging code for token...');
            const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri,
                    code_verifier: codeVerifier,
                }),
            });

            console.log('[Spotify] Token Response Status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[Spotify] Token Exchange Failed. Details:', errorData);
                throw new Error(errorData.error_description || 'Failed to exchange token');
            }

            const data = await response.json();
            console.log('[Spotify] Token received successfully.');
            console.log('[Spotify] Token scopes:', data.scope);
            console.log('[Spotify] Token expires in:', data.expires_in, 'seconds');
            console.log('[Spotify] Has refresh token:', !!data.refresh_token);
            this.saveToken(data);

            // Clean URL
            window.history.replaceState({}, document.title, '/');
            return data.access_token;

        } catch (err) {
            console.error('[Spotify] Token Exchange Exception:', err);
            alert('Falha ao autenticar com Spotify. Verifique o console para mais detalhes.');
            return null;
        }
    }

    // Legacy/Fallback for Implicit Grant (if needed)
    getTokenFromHash() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in');

        if (token) {
            this.saveToken({ access_token: token, expires_in: expiresIn });
            window.location.hash = '';
            return token;
        }
        return null;
    }

    saveToken(data) {
        const { access_token, expires_in, refresh_token } = data;
        const expiryTime = new Date().getTime() + parseInt(expires_in) * 1000;

        localStorage.setItem('spotify_token', access_token);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());
        if (refresh_token) {
            localStorage.setItem('spotify_refresh_token', refresh_token);
        }
    }

    getToken() {
        const token = localStorage.getItem('spotify_token');
        const expiry = localStorage.getItem('spotify_token_expiry');

        if (!token || !expiry) return null;

        if (new Date().getTime() > parseInt(expiry)) {
            // TODO: Implement refresh token flow if needed, for now just logout
            this.logout();
            return null;
        }

        return token;
    }

    logout() {
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_token_expiry');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_code_verifier');
        sessionStorage.removeItem('spotify_code_verifier');
        document.cookie = 'spotify_code_verifier=; Max-Age=0; path=/; SameSite=Lax';
    }

    // Check if Spotify is connected with a valid token
    isConnected() {
        return !!this.getToken();
    }

    // --- API METHODS ---

    async apiRequest(endpoint, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error('401: No valid Spotify token. Please reconnect your Spotify account.');
        }

        const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.logout();
                throw new Error('401: Session expired. Please reconnect your Spotify account.');
            }
            if (response.status === 403) {
                throw new Error('403: Access denied. Check if you have the required Spotify permissions.');
            }
            const errorText = await response.text();
            console.error('Spotify API Error:', response.status, errorText);
            throw new Error(`${response.status}: ${response.statusText}`);
        }

        // Handle empty responses (like from DELETE)
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    async getUserProfile() {
        return this.apiRequest('/me');
    }

    async getTopArtists(limit = 20, time_range = 'medium_term') {
        // time_range: short_term (4 weeks), medium_term (6 months), long_term (years)
        const data = await this.apiRequest(`/me/top/artists?limit=${limit}&time_range=${time_range}`);
        return data.items || [];
    }

    async getTopTracks(limit = 20, time_range = 'medium_term') {
        const data = await this.apiRequest(`/me/top/tracks?limit=${limit}&time_range=${time_range}`);
        return data.items || [];
    }

    async getRecentlyPlayed(limit = 20) {
        const data = await this.apiRequest(`/me/player/recently-played?limit=${limit}`);
        return data.items || [];
    }

    async getRecommendations(seedArtists = [], seedTracks = [], seedGenres = [], limit = 20) {
        const params = new URLSearchParams({ limit });
        if (seedArtists.length) params.append('seed_artists', seedArtists.slice(0, 5).join(','));
        if (seedTracks.length) params.append('seed_tracks', seedTracks.slice(0, 5).join(','));
        if (seedGenres.length) params.append('seed_genres', seedGenres.slice(0, 5).join(','));

        const data = await this.apiRequest(`/recommendations?${params.toString()}`);
        return data.tracks || [];
    }

    async searchTrack(trackName, artistName) {
        const query = `track:${trackName} artist:${artistName}`;
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
        return data.tracks?.items?.[0] || null;
    }

    async searchGeneral(query) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
        return data.tracks?.items?.[0] || null;
    }

    async searchArtist(artistName) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`);
        return data.artists?.items?.[0] || null;
    }

    // Full search methods with pagination
    async searchArtists(query, limit = 10, offset = 0) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}&offset=${offset}`);
        return {
            artists: data.artists?.items || [],
            total: data.artists?.total || 0,
            offset: data.artists?.offset || 0,
            limit: data.artists?.limit || limit
        };
    }

    async searchTracks(query, limit = 10, offset = 0) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`);
        return {
            tracks: data.tracks?.items || [],
            total: data.tracks?.total || 0,
            offset: data.tracks?.offset || 0,
            limit: data.tracks?.limit || limit
        };
    }

    async searchAlbums(query, limit = 10, offset = 0) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=album&limit=${limit}&offset=${offset}`);
        return {
            albums: data.albums?.items || [],
            total: data.albums?.total || 0,
            offset: data.albums?.offset || 0,
            limit: data.albums?.limit || limit
        };
    }

    async searchAll(query, limit = 10, offset = 0) {
        const data = await this.apiRequest(`/search?q=${encodeURIComponent(query)}&type=artist,track,album&limit=${limit}&offset=${offset}`);
        return {
            artists: {
                items: data.artists?.items || [],
                total: data.artists?.total || 0
            },
            tracks: {
                items: data.tracks?.items || [],
                total: data.tracks?.total || 0
            },
            albums: {
                items: data.albums?.items || [],
                total: data.albums?.total || 0
            }
        };
    }

    async getArtistTopTracks(artistId, market = 'BR') {
        const data = await this.apiRequest(`/artists/${artistId}/top-tracks?market=${market}`);
        return data.tracks || [];
    }

    async getArtist(artistId) {
        return this.apiRequest(`/artists/${artistId}`);
    }

    async getAlbum(albumId) {
        return this.apiRequest(`/albums/${albumId}`);
    }

    async getTrack(trackId) {
        return this.apiRequest(`/tracks/${trackId}`);
    }

    async createPlaylist(userId, name, description = '', isPublic = true) {
        return this.apiRequest(`/users/${userId}/playlists`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                public: isPublic
            })
        });
    }

    async addTracksToPlaylist(playlistId, trackUris) {
        return this.apiRequest(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({
                uris: trackUris
            })
        });
    }

    async unfollowPlaylist(playlistId) {
        return this.apiRequest(`/playlists/${playlistId}/followers`, {
            method: 'DELETE'
        });
    }

    initializePlayer(token, onReady, onPlayerStateChanged) {
        return new Promise((resolve, reject) => {
            if (!window.Spotify) {
                const script = document.createElement('script');
                script.src = 'https://sdk.scdn.co/spotify-player.js';
                script.async = true;
                document.body.appendChild(script);
            }

            window.onSpotifyWebPlaybackSDKReady = () => {
                const player = new window.Spotify.Player({
                    name: 'Music Horizon Player',
                    getOAuthToken: cb => { cb(token); },
                    volume: 0.5
                });

                player.addListener('ready', ({ device_id }) => {
                    console.log('Player ready with device ID:', device_id);
                    onReady(device_id);
                });

                player.addListener('player_state_changed', state => {
                    if (state) onPlayerStateChanged(state);
                });

                player.addListener('initialization_error', ({ message }) => {
                    console.error('Initialization error:', message);
                    reject(message);
                });

                player.addListener('authentication_error', ({ message }) => {
                    console.error('Authentication error:', message);
                    reject(message);
                });

                player.connect().then(success => {
                    if (success) resolve(player);
                    else reject('Failed to connect player');
                });
            };
        });
    }

    async play(deviceId, { uris, context_uri, offset }) {
        const token = this.getToken();
        const body = {};

        if (context_uri) {
            body.context_uri = context_uri;
            if (offset) body.offset = offset;
        } else if (uris) {
            body.uris = uris;
            if (offset) body.offset = offset;
        }

        await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    }

    async pause() {
        const token = this.getToken();
        await fetch(`${SPOTIFY_API_BASE}/me/player/pause`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    async resume() {
        const token = this.getToken();
        await fetch(`${SPOTIFY_API_BASE}/me/player/play`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    async next() {
        const token = this.getToken();
        await fetch(`${SPOTIFY_API_BASE}/me/player/next`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    async previous() {
        const token = this.getToken();
        await fetch(`${SPOTIFY_API_BASE}/me/player/previous`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    async seek(positionMs) {
        const token = this.getToken();
        await fetch(`${SPOTIFY_API_BASE}/me/player/seek?position_ms=${positionMs}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
}

export default new SpotifyService();
