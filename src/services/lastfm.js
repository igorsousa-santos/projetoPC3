import cacheService from './cache';

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';
const BACKEND_API_URL = (import.meta.env.VITE_API_URL || '/api') + '/lastfm';

class LastFMService {
    constructor() {
        this.apiKey = import.meta.env.VITE_LASTFM_API_KEY;
    }

    // Make API request to Last.fm with caching
    async apiRequest(method, params = {}) {
        // Generate cache key from method and params
        const cacheKey = cacheService.generateKey('lastfm', method, JSON.stringify(params));

        // Check cache first
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const url = new URL(LASTFM_API_BASE);
        const requestParams = {
            method,
            api_key: this.apiKey,
            ...params,
            format: 'json'
        };

        Object.entries(requestParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        console.log(`[LastFM] Requesting: ${method}`);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (!response.ok) {
            console.error('[LastFM] API Error Response:', data);
            throw new Error(data.message || `Last.fm API Error: ${response.status} ${response.statusText}`);
        }

        if (data.error) {
            console.error('[LastFM] API Error Data:', data);
            throw new Error(data.message);
        }

        // Cache the result (5 minutes TTL)
        cacheService.set(cacheKey, data);

        return data;
    }

    // Get session from token - NOW USES BACKEND
    async getSession(token) {
        try {
            const response = await fetch(`${BACKEND_API_URL}/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            
            const data = await response.json();
            
            if (data.error || !response.ok) {
                throw new Error(data.message || 'Failed to authenticate with Last.fm');
            }
            
            return data.session;
        } catch (error) {
            console.error('Backend Auth Error:', error);
            throw error;
        }
    }

    // Get user's recent tracks
    async getRecentTracks(user, limit = 20) {
        const data = await this.apiRequest('user.getrecenttracks', {
            user,
            limit,
            extended: 1
        });
        return data.recenttracks?.track || [];
    }

    // Get user's top artists
    async getTopArtists(user, limit = 20, period = 'overall') {
        const data = await this.apiRequest('user.gettopartists', {
            user,
            limit,
            period
        });
        return data.topartists?.artist || [];
    }

    // Get user's top tracks
    async getTopTracks(user, limit = 20, period = 'overall') {
        const data = await this.apiRequest('user.gettoptracks', {
            user,
            limit,
            period
        });
        return data.toptracks?.track || [];
    }

    // Get user's top albums
    async getTopAlbums(user, limit = 20, period = 'overall') {
        const data = await this.apiRequest('user.gettopalbums', {
            user,
            limit,
            period
        });
        return data.topalbums?.album || [];
    }

    // Get user info (includes total playcount, registered date, etc)
    async getUserInfo(user) {
        const data = await this.apiRequest('user.getinfo', {
            user
        });
        return data.user || null;
    }

    // Get user's weekly chart list (available weeks)
    async getWeeklyChartList(user) {
        const data = await this.apiRequest('user.getweeklychartlist', {
            user
        });
        return data.weeklychartlist?.chart || [];
    }

    // Get user's weekly artist chart for a specific week
    async getWeeklyArtistChart(user, from, to) {
        const data = await this.apiRequest('user.getweeklyartistchart', {
            user,
            from,
            to
        });
        return data.weeklyartistchart?.artist || [];
    }

    // Get user's weekly album chart for a specific week
    async getWeeklyAlbumChart(user, from, to) {
        const data = await this.apiRequest('user.getweeklyalbumchart', {
            user,
            from,
            to
        });
        return data.weeklyalbumchart?.album || [];
    }

    // Get user's weekly track chart for a specific week
    async getWeeklyTrackChart(user, from, to) {
        const data = await this.apiRequest('user.getweeklytrackchart', {
            user,
            from,
            to
        });
        return data.weeklytrackchart?.track || [];
    }

    // Search for artist with pagination
    async searchArtist(artistName, limit = 10, page = 1) {
        const data = await this.apiRequest('artist.search', {
            artist: artistName,
            limit,
            page
        });
        return {
            artists: data.results?.artistmatches?.artist || [],
            totalResults: parseInt(data.results?.['opensearch:totalResults']) || 0,
            page: parseInt(data.results?.['opensearch:Query']?.startPage) || page
        };
    }

    // Search for track with pagination
    async searchTrack(trackName, limit = 10, page = 1) {
        const data = await this.apiRequest('track.search', {
            track: trackName,
            limit,
            page
        });
        return {
            tracks: data.results?.trackmatches?.track || [],
            totalResults: parseInt(data.results?.['opensearch:totalResults']) || 0,
            page: parseInt(data.results?.['opensearch:Query']?.startPage) || page
        };
    }

    // Search for album with pagination
    async searchAlbum(albumName, limit = 10, page = 1) {
        const data = await this.apiRequest('album.search', {
            album: albumName,
            limit,
            page
        });
        return {
            albums: data.results?.albummatches?.album || [],
            totalResults: parseInt(data.results?.['opensearch:totalResults']) || 0,
            page: parseInt(data.results?.['opensearch:Query']?.startPage) || page
        };
    }

    // Get album info
    async getAlbumInfo(albumName, artistName) {
        const data = await this.apiRequest('album.getinfo', {
            album: albumName,
            artist: artistName
        });
        return data.album || null;
    }

    // Get similar artists
    async getSimilarArtists(artistName, limit = 20) {
        const data = await this.apiRequest('artist.getsimilar', {
            artist: artistName,
            limit
        });
        return data.similarartists?.artist || [];
    }

    // Get similar tracks
    async getSimilarTracks(trackName, artistName, limit = 20) {
        const data = await this.apiRequest('track.getsimilar', {
            track: trackName,
            artist: artistName,
            limit
        });
        return data.similartracks?.track || [];
    }

    // Get top tracks by artist
    async getTopTracksByArtist(artistName, limit = 20, page = 1) {
        const data = await this.apiRequest('artist.gettoptracks', {
            artist: artistName,
            limit,
            page
        });
        return data.toptracks?.track || [];
    }

    // Get artist info
    async getArtistInfo(artistName) {
        const data = await this.apiRequest('artist.getinfo', {
            artist: artistName
        });
        return data.artist || null;
    }

    // Get track info
    async getTrackInfo(trackName, artistName) {
        const data = await this.apiRequest('track.getinfo', {
            track: trackName,
            artist: artistName
        });
        return data.track || null;
    }

    // Get top tags for artist (genres)
    async getArtistTags(artistName) {
        const data = await this.apiRequest('artist.gettoptags', {
            artist: artistName
        });
        return data.toptags?.tag || [];
    }

    // Search by tag/genre
    async searchByTag(tag, limit = 20, page = 1) {
        const data = await this.apiRequest('tag.gettopartists', {
            tag: tag,
            limit,
            page
        });
        return data.topartists?.artist || [];
    }

    // Get top tracks by tag/genre
    async getTopTracksByTag(tag, limit = 20, page = 1) {
        const data = await this.apiRequest('tag.gettoptracks', {
            tag: tag,
            limit,
            page
        });
        return data.tracks?.track || [];
    }

    // Search all (artists, tracks, albums) at once
    async searchAll(query, limit = 10, page = 1) {
        const [artistsResult, tracksResult, albumsResult] = await Promise.all([
            this.searchArtist(query, limit, page),
            this.searchTrack(query, limit, page),
            this.searchAlbum(query, limit, page)
        ]);

        return {
            artists: artistsResult,
            tracks: tracksResult,
            albums: albumsResult
        };
    }

async getTopAlbumsByArtist(artist, limit = 5) {
        try {
            const data = await this.apiRequest('artist.gettopalbums', {
                artist: artist,
                limit: limit
            });
            
            // O Last.fm às vezes retorna um objeto único se houver apenas 1 álbum, ou array se houver vários.
            const albums = data.topalbums?.album;
            
            if (!albums) return [];
            
            // Garante que sempre retornamos um array
            return Array.isArray(albums) ? albums : [albums];
        } catch (error) {
            console.warn(`[LastFM] Erro ao buscar álbuns de ${artist}:`, error);
            return [];
        }
    }

}

export default new LastFMService();
