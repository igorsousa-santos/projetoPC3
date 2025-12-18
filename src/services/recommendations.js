import lastfmService from './lastfm';
import spotifyService from './spotify';
import deezerService from './deezer';
import itunesService from './itunes';
import usePreviewStore from '../stores/previewStore';
import useListeningHistoryStore from '../stores/listeningHistoryStore';
import useAuthStore from '../stores/authStore';
import { aiAPI } from './api';

class RecommendationService {
    constructor() {
        this.seenTracks = new Set(); // Histórico da sessão para evitar repetições
    }

    async getAIRecommendations(prompt, limit = 25) {
        try {
            // --- Rule of Threes Context Gathering ---
            const context = {
                genres: [],
                albums: [],
                recentSongs: []
            };

            const historyStore = useListeningHistoryStore.getState();
            const authStore = useAuthStore.getState();
            const lastfmUser = authStore.lastfmUser;

            // 1. Three Recent Songs (Prioritize Spotify Recently Played)
            try {
                if (spotifyService.isConnected()) {
                    const recentSpotify = await spotifyService.getRecentlyPlayed(3);
                    context.recentSongs = recentSpotify.map(item => `${item.track.name} by ${item.track.artists[0].name}`);
                } else {
                    const recent = historyStore.getRecentTracks(3);
                    context.recentSongs = recent.map(t => `${t.name} by ${t.artist}`);
                }
            } catch (e) {
                // Fallback to local store
                const recent = historyStore.getRecentTracks(3);
                context.recentSongs = recent.map(t => `${t.name} by ${t.artist}`);
            }

            // 2. Three Top Albums & Genres (Prioritize Spotify Top Artists/Tracks)
            try {
                if (spotifyService.isConnected()) {
                    const topArtists = await spotifyService.getTopArtists(5, 'short_term');
                    const topTracks = await spotifyService.getTopTracks(5, 'short_term');

                    context.genres = [...new Set(topArtists.flatMap(a => a.genres))].slice(0, 3);
                    context.albums = topTracks.map(t => `${t.album.name} by ${t.artists[0].name}`).slice(0, 3);
                } else if (lastfmUser) {
                    // Legacy Last.fm Fallback
                    const [albums, artists] = await Promise.all([
                        lastfmService.getTopAlbums(lastfmUser, 3, '7day'),
                        lastfmService.getTopArtists(lastfmUser, 5, '7day')
                    ]);
                    context.albums = albums.map(a => `${a.name} by ${a.artist?.name || a.artist}`);
                    const genrePromises = artists.slice(0, 3).map(artist => 
                        lastfmService.getArtistTags(artist.name).then(tags => tags[0]?.name).catch(() => null)
                    );
                    const genres = await Promise.all(genrePromises);
                    context.genres = [...new Set(genres.filter(g => g))].slice(0, 3);
                }
            } catch (e) {
                console.warn('Could not fetch context for AI:', e);
            }

            const res = await aiAPI.generateRecommendations(prompt, limit, context);
            if (res.success && res.data) {
                // Enrich tracks with images/previews from Spotify/iTunes/Deezer
                const enriched = await this.enrichWithSpotify(res.data);
                return enriched;
            }
            throw new Error(res.message || 'AI generation failed');
        } catch (error) {
            console.error('AI Recommendation Error:', error);
            // Fallback to traditional method
            return this.getRecommendations(prompt, limit);
        }
    }

    // Helper para normalizar strings para comparação (remove acentos e caracteres especiais)
    normalizeString(str) {
        if (!str) return '';
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    // Limpa o nome da faixa para melhorar a busca (remove "prod.", "ft.", "**", etc.)
    cleanTrackName(name) {
        if (!name) return '';
        let cleaned = name;

        // 1. Remove explicit "prod.", "feat.", "ft." outside parentheses (greedy until end)
        cleaned = cleaned.replace(/\s(prod\.|feat\.|ft\.|with).*/gi, '');

        // 2. Remove ALL content in square brackets [ ... ]
        // Square brackets are almost always metadata in Last.fm (e.g. [Meters], [Clean], [Video])
        cleaned = cleaned.replace(/\[.*?\]/g, '');

        // 3. Remove known garbage patterns
        cleaned = cleaned
            .replace(/\*\*.*?\*\*/g, '')
            .replace(/EP OUT NOW/gi, '')
            .replace(/\(LQ\)/gi, '')
            .replace(/\(HQ\)/gi, '');

        // 4. Remove parentheses containing specific keywords (keep normal parentheses like "(Don't Fear) The Reaper")
        const keywords = ['prod', 'feat', 'ft', 'bootleg', 'remix', 'edit', 'demo', 'version', 'slowed', 'reverb', 'mix', 'vip', 'live', 'session'];
        const noiseRegex = new RegExp(`\\(.*?\\b(?:${keywords.join('|')})\\b.*?\\)`, 'gi');
        cleaned = cleaned.replace(noiseRegex, '');

        // 5. Remove Date patterns (e.g. 02.03.2013, 2023)
        cleaned = cleaned.replace(/\d{2}\.\d{2}\.\d{4}/g, ''); // dd.mm.yyyy
        cleaned = cleaned.replace(/\d{4}/g, ''); // yyyy (risky but often needed for live sets)

        // 6. Remove "p1", "pt.1", "part 1"
        cleaned = cleaned.replace(/\bp\d+\b/gi, '');
        cleaned = cleaned.replace(/\bpt\.?\s*\d+\b/gi, '');
        cleaned = cleaned.replace(/\bpart\s*\d+\b/gi, '');

        // 7. Remove trailing " - " garbage
        cleaned = cleaned.replace(/\s+-\s+.*$/, '');

        return cleaned.replace(/\s+/g, ' ').trim();
    }

    async parsePrompt(prompt) {
        const lowerPrompt = prompt.toLowerCase().trim();
        const trackPatterns = [
            /(.+?)\s+by\s+(.+)/i,
            /(.+?)\s+-\s+(.+)/,
            /(.+?)\s+from\s+(.+)/i,
        ];

        for (const pattern of trackPatterns) {
            const match = prompt.match(pattern);
            if (match) {
                return {
                    type: 'track',
                    value: prompt,
                    track: match[1].trim(),
                    artist: match[2].trim()
                };
            }
        }

        const genreKeywords = [
            'rock', 'pop', 'jazz', 'indie', 'electronic', 'hip hop', 'hip-hop', 'rap',
            'metal', 'folk', 'country', 'blues', 'reggae', 'punk', 'soul', 'funk',
            'disco', 'house', 'techno', 'ambient', 'classical', 'edm', 'r&b', 'rnb',
            'alternative', 'grunge', 'psychedelic', 'progressive', 'hardcore', 'ska',
            'gospel', 'latin', 'world', 'experimental', 'noise', 'drone', 'shoegaze'
        ];

        if (genreKeywords.some(genre => lowerPrompt.includes(genre))) {
            return { type: 'genre', value: prompt };
        }

        // AUTO-DETECT: tentar buscar como música
        try {
            const trackSearch = await lastfmService.searchTrack(prompt, 3);
            const trackResults = trackSearch.tracks || trackSearch;
            if (trackResults.length > 0) {
                const topTrack = trackResults[0];
                const listeners = parseInt(topTrack.listeners || 0);
                if (listeners > 100000) {
                    return {
                        type: 'track',
                        value: prompt,
                        track: topTrack.name,
                        artist: topTrack.artist?.name || topTrack.artist
                    };
                }
            }
        } catch (error) {
            // Silent fail
        }

        return { type: 'artist', value: prompt };
    }

    async getRecommendations(prompt, limit = 25) {
        // Stop any playing preview when a new recommendation request starts
        try {
            usePreviewStore.getState().stopPreview();
        } catch (e) {
            console.warn("Could not stop preview:", e);
        }

        const parsed = await this.parsePrompt(prompt);
        const { type, value, track, artist } = parsed;

        // --- SPOTIFY FIRST STRATEGY ---
        if (spotifyService.isConnected()) {
            try {
                let seedArtists = [];
                let seedTracks = [];
                let seedGenres = [];

                if (type === 'artist') {
                    const found = await spotifyService.searchArtist(value);
                    if (found) seedArtists.push(found.id);
                } else if (type === 'track') {
                    const query = track && artist ? `track:${track} artist:${artist}` : value;
                    const found = await spotifyService.searchGeneral(query);
                    if (found) seedTracks.push(found.id);
                } else if (type === 'genre') {
                    // Spotify genres must match exactly their list, so this is risky.
                    // Fallback: search for a playlist/track of that genre or trust the user input if valid
                    // For now, simpler to use search for a "genre" track/artist or fallback to Last.fm for pure genre
                    seedGenres.push(value.toLowerCase().replace(/\s+/g, '-')); 
                }

                if (seedArtists.length > 0 || seedTracks.length > 0 || seedGenres.length > 0) {
                    console.log(`[Recs] Using Spotify API with seeds:`, { seedArtists, seedTracks, seedGenres });
                    const spotifyRecs = await spotifyService.getRecommendations(seedArtists, seedTracks, seedGenres, limit);
                    
                    if (spotifyRecs.length > 0) {
                        return spotifyRecs.map(t => ({
                            id: t.id,
                            name: t.name,
                            artist: t.artists[0].name,
                            album: t.album.name,
                            imageUrl: t.album.images[0]?.url,
                            uri: t.uri,
                            spotifyUrl: t.external_urls.spotify,
                            previewUrl: t.preview_url
                        }));
                    }
                }
            } catch (e) {
                console.warn("Spotify Recommendations failed, falling back to Last.fm:", e);
            }
        }

        // --- LAST.FM FALLBACK ---
        try {
            let lastfmTracks = [];
            // ... (keep existing logic)

            if (type === 'artist') {
                lastfmTracks = await this.getRecommendationsByArtist(value, limit);
            } else if (type === 'track') {
                if (track && artist) {
                    lastfmTracks = await this.getRecommendationsByTrack(track, artist, limit);
                } else {
                    lastfmTracks = await this.getRecommendationsByTrackSearch(value, limit);
                }
            } else if (type === 'genre') {
                lastfmTracks = await this.getRecommendationsByGenre(value, limit);
            }

            const enrichedTracks = await this.enrichWithSpotify(lastfmTracks);
            return enrichedTracks;
        } catch (error) {
            console.error('Error getting recommendations:', error);
            throw error;
        }
    }

    // Helper para buscar "Deep Cuts" (faixas do fundo do baú) quando faltam recomendações
    async getDeepCuts(artistName, limit) {
        try {
            const similarArtists = await lastfmService.getSimilarArtists(artistName, 50);
            const selectedArtists = this.shuffleArray(similarArtists).slice(0, 8); // Aumentado para 8 artistas

            const promises = selectedArtists.map(async (artist) => {
                // DEEP DIVE EXTREMO: Páginas 10 a 25
                const randomPage = Math.floor(Math.random() * 16) + 10;
                const tracks = await lastfmService.getTopTracksByArtist(artist.name, 20, randomPage);
                return this.shuffleArray(tracks).slice(0, 5);
            });

            return (await Promise.all(promises)).flat();
        } catch (e) {
            return [];
        }
    }

    async getRecommendationsByArtist(artistName, limit) {
        const normSearchArtist = this.normalizeString(artistName);

        // 1. Estratégia 100% Similares (Sem Tags)
        // Aumentado pool para 60 para ter mais variedade e evitar repetições
        const similarArtists = await lastfmService.getSimilarArtists(artistName, 60);

        const filteredSimilar = similarArtists.filter(a => {
            const norm = this.normalizeString(a.name);
            return norm !== normSearchArtist && !norm.includes(normSearchArtist);
        });

        // Selecionar 20 artistas aleatórios (mais fontes = menos chance de faltar música)
        const selectedArtists = this.shuffleArray(filteredSimilar).slice(0, 20);

        const promises = selectedArtists.map(async (artist) => {
            // RANGE FIXO: Páginas 2 a 10 (Variedade garantida sem lógica progressiva complexa)
            const minPage = 2;
            const maxPage = 10;
            const randomPage = Math.floor(Math.random() * (maxPage - minPage + 1)) + minPage;

            const tracks = await lastfmService.getTopTracksByArtist(artist.name, 20, randomPage);
            // Pegar até 3 faixas por artista inicialmente
            return this.shuffleArray(tracks).slice(0, 3);
        });

        const similarTracks = (await Promise.all(promises)).flat();

        // 2. Filtragem Final
        let filteredTracks = similarTracks.filter(track => {
            const trackName = track.name.toLowerCase();
            const trackArtistName = track.artist?.name || track.artist || '';
            const normTrackArtist = this.normalizeString(trackArtistName);
            const uniqueId = `${trackName}_${normTrackArtist}`;

            const isSame = normTrackArtist === normSearchArtist;
            const contains = normTrackArtist.includes(normSearchArtist) || (normSearchArtist.length > 3 && normSearchArtist.includes(normTrackArtist));

            if (isSame || contains) return false;
            if (this.seenTracks.has(uniqueId)) return false;

            return true;
        });

        // 3. BACKFILL LOGIC: Se faltar música, buscar Deep Cuts
        if (filteredTracks.length < limit) {
            const missing = limit - filteredTracks.length;
            // Pedir o triplo do que falta para garantir após filtragem
            const deepCuts = await this.getDeepCuts(artistName, missing * 3);

            const validDeepCuts = deepCuts.filter(track => {
                const uniqueId = `${track.name.toLowerCase()}_${this.normalizeString(track.artist?.name || track.artist)}`;
                return !this.seenTracks.has(uniqueId);
            });

            filteredTracks = [...filteredTracks, ...validDeepCuts];
        }

        const uniqueTracks = this.deduplicateTracks(filteredTracks);
        // Permitir até 2 músicas do mesmo artista
        const diverseTracks = this.applyDiversityFilter(uniqueTracks, 2);
        const finalShuffled = this.shuffleArray(diverseTracks);

        // Registrar faixas mostradas na sessão
        const selected = finalShuffled.slice(0, limit);
        selected.forEach(track => {
            const uniqueId = `${track.name.toLowerCase()}_${this.normalizeString(track.artist?.name || track.artist)}`;
            this.seenTracks.add(uniqueId);
        });

        return selected;
    }

    async getRecommendationsByTrack(trackName, artistName, limit) {
        try {
            const normSearchArtist = this.normalizeString(artistName);

            // 1. Estratégia 100% Tracks Similares (Sem Tags)
            const similarTracks = await lastfmService.getSimilarTracks(trackName, artistName, 60);

            // Filtros
            let filteredTracks = similarTracks.filter(track => {
                const trackName = track.name.toLowerCase();
                const trackArtistName = track.artist?.name || track.artist || '';
                const normTrackArtist = this.normalizeString(trackArtistName);
                const uniqueId = `${trackName}_${normTrackArtist}`;

                if (normTrackArtist === normSearchArtist || normTrackArtist.includes(normSearchArtist)) return false;
                if (this.seenTracks.has(uniqueId)) return false;

                return true;
            });

            // BACKFILL LOGIC
            if (filteredTracks.length < limit) {
                const missing = limit - filteredTracks.length;
                const deepCuts = await this.getDeepCuts(artistName, missing * 3);
                const validDeepCuts = deepCuts.filter(track => {
                    const uniqueId = `${track.name.toLowerCase()}_${this.normalizeString(track.artist?.name || track.artist)}`;
                    return !this.seenTracks.has(uniqueId);
                });
                filteredTracks = [...filteredTracks, ...validDeepCuts];
            }

            const uniqueTracks = this.deduplicateTracks(filteredTracks);
            // Permitir até 2 músicas do mesmo artista
            const diverseTracks = this.applyDiversityFilter(uniqueTracks, 2);
            const finalShuffled = this.shuffleArray(diverseTracks);

            const selected = finalShuffled.slice(0, limit);
            selected.forEach(track => {
                const uniqueId = `${track.name.toLowerCase()}_${this.normalizeString(track.artist?.name || track.artist)}`;
                this.seenTracks.add(uniqueId);
            });

            return selected;

        } catch (error) {
            console.error('Error getting similar tracks:', error);
            return this.getRecommendationsByArtist(artistName, limit);
        }
    }

    async getRecommendationsByTrackSearch(trackQuery, limit) {
        try {
            const searchData = await lastfmService.searchTrack(trackQuery, 5);
            const searchResults = searchData.tracks || searchData;
            if (searchResults.length === 0) {
                return this.getRecommendationsByArtist(trackQuery, limit);
            }
            const mainTrack = searchResults[0];
            return this.getRecommendationsByTrack(
                mainTrack.name,
                mainTrack.artist?.name || mainTrack.artist,
                limit
            );
        } catch (error) {
            console.error('Error in track search:', error);
            return this.getRecommendationsByArtist(trackQuery, limit);
        }
    }

    async getRecommendationsByGenre(genre, limit) {
        // Buscar 100 faixas do gênero para ter bastante variedade no shuffle
        // Range aleatório 1-5
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const topTracks = await lastfmService.getTopTracksByTag(genre, 100, randomPage);
        const shuffled = this.shuffleArray(topTracks);
        return shuffled.slice(0, limit);
    }

    getLastFmImage(track) {
        if (!track.image || !Array.isArray(track.image)) return null;

        const sizes = ['extralarge', 'large', 'medium', 'small'];
        for (const size of sizes) {
            const img = track.image.find(i => i.size === size);
            if (img && img['#text']) {
                const url = img['#text'];
                // Ignorar placeholder cinza do Last.fm
                if (url.includes('2a96cbd8b46e442fc41c2b86b821562f')) return null;
                return url;
            }
        }
        return null;
    }

    async enrichWithSpotify(lastfmTracks) {
        const enrichedTracks = [];
        const BATCH_SIZE = 5;

        // Processar em lotes de 5 para ser mais rápido que sequencial, mas seguro
        for (let i = 0; i < lastfmTracks.length; i += BATCH_SIZE) {
            const batch = lastfmTracks.slice(i, i + BATCH_SIZE);

            const batchPromises = batch.map(async (track) => {
                const baseTrack = {
                    id: `${track.name}_${track.artist?.name || track.artist}`.replace(/\s/g, '_'),
                    name: track.name,
                    artist: track.artist?.name || track.artist,
                    album: track.album || 'Unknown Album',
                    imageUrl: this.getLastFmImage(track) || '/default-album.png',
                    listeners: parseInt(track.listeners || track.playcount || 0),
                    previewUrl: null,
                    reason: track.reason // PRESERVE THE AI REASON HERE
                };

                let finalTrack = baseTrack;
                const cleanName = this.cleanTrackName(baseTrack.name);

                // --- STRATEGY 1: SPOTIFY (Strict & Fuzzy) ---
                try {
                    // 1.1 Strict Search (Clean Name)
                    console.log(`[Enrich] Searching for: ${cleanName} - ${baseTrack.artist}`);
                    let spotifyTrack = await spotifyService.searchTrack(cleanName, baseTrack.artist);

                    // 1.2 Strict Search (Original Name) - if clean failed
                    if (!spotifyTrack && cleanName !== baseTrack.name) {
                        spotifyTrack = await spotifyService.searchTrack(baseTrack.name, baseTrack.artist);
                    }

                    // 1.3 General Fuzzy Search (Artist + Clean Name) - if strict failed
                    if (!spotifyTrack) {
                        const fuzzyQuery = `${baseTrack.artist} ${cleanName}`;
                        spotifyTrack = await spotifyService.searchGeneral(fuzzyQuery);

                        // Verify if the fuzzy result is actually from the correct artist
                        if (spotifyTrack) {
                            const spotifyArtist = spotifyTrack.artists[0].name.toLowerCase();
                            const originalArtist = baseTrack.artist.toLowerCase();
                            // Simple inclusion check to avoid bad matches
                            if (!spotifyArtist.includes(originalArtist) && !originalArtist.includes(spotifyArtist)) {
                                spotifyTrack = null;
                            }
                        }
                    }

                    if (spotifyTrack) {
                        baseTrack.previewUrl = spotifyTrack.preview_url;

                        const token = spotifyService.getToken();
                        if (token) {
                            finalTrack = {
                                ...baseTrack,
                                id: spotifyTrack.id,
                                imageUrl: spotifyTrack.album?.images?.[0]?.url || baseTrack.imageUrl,
                                uri: spotifyTrack.uri,
                                spotifyUrl: spotifyTrack.external_urls?.spotify,
                                album: spotifyTrack.album?.name || baseTrack.album
                            };
                        }
                    }
                } catch (error) {
                    // Silent fail
                }

                // --- STRATEGY 2: ITUNES (Fallback for Previews/Covers) ---
                if (!finalTrack.previewUrl || finalTrack.imageUrl === '/default-album.png') {
                    try {
                        const itunesTrack = await itunesService.searchTrack(cleanName, baseTrack.artist);
                        if (itunesTrack) {
                            if (!finalTrack.previewUrl) finalTrack.previewUrl = itunesTrack.previewUrl;
                            if (finalTrack.imageUrl === '/default-album.png') finalTrack.imageUrl = itunesTrack.imageUrl;
                            if (finalTrack.album === 'Unknown Album') finalTrack.album = itunesTrack.album;
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }

                // --- STRATEGY 3: DEEZER (Last Resort) ---
                if (!finalTrack.previewUrl || finalTrack.imageUrl === '/default-album.png') {
                    try {
                        let deezerTrack = await deezerService.searchTrack(cleanName, baseTrack.artist);
                        if (deezerTrack) {
                            if (!finalTrack.previewUrl) finalTrack.previewUrl = deezerTrack.preview;
                            if (finalTrack.album === 'Unknown Album' && deezerTrack.album) finalTrack.album = deezerTrack.album.title;
                            if (finalTrack.imageUrl === '/default-album.png' && deezerTrack.album) {
                                finalTrack.imageUrl = deezerTrack.album.cover_xl || deezerTrack.album.cover_medium;
                            }
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }

                return finalTrack;
            });

            const processedBatch = await Promise.all(batchPromises);
            enrichedTracks.push(...processedBatch);

            // Pequeno delay entre lotes se houver mais
            if (i + BATCH_SIZE < lastfmTracks.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return enrichedTracks;
    }

    async enrichArtists(artists) {
        const enrichedArtists = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < artists.length; i += BATCH_SIZE) {
            const batch = artists.slice(i, i + BATCH_SIZE);

            const batchPromises = batch.map(async (artist) => {
                // If we already have a good image, keep it
                if (artist.image && !artist.image.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                    return artist;
                }

                let imageUrl = null;

                // 1. Try Spotify
                try {
                    const spotifyArtist = await spotifyService.searchArtist(artist.name);
                    if (spotifyArtist && spotifyArtist.images?.length > 0) {
                        imageUrl = spotifyArtist.images[0].url;
                    }
                } catch (e) {
                    console.warn(`[Enrich] Spotify artist search failed for ${artist.name}`, e);
                }

                // 2. Try iTunes (Fallback - getting top album art)
                if (!imageUrl) {
                    try {
                        // Search for a track by this artist to get album art
                        const itunesTrack = await itunesService.searchTrack('', artist.name);
                        if (itunesTrack && itunesTrack.imageUrl) {
                            imageUrl = itunesTrack.imageUrl;
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }

                return {
                    ...artist,
                    image: imageUrl || artist.image // Fallback to original (even if placeholder) if all else fails
                };
            });

            const processedBatch = await Promise.all(batchPromises);
            enrichedArtists.push(...processedBatch);

            if (i + BATCH_SIZE < artists.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return enrichedArtists;
    }

    deduplicateTracks(tracks) {
        const seen = new Map();
        const unique = [];

        for (const track of tracks) {
            const key = `${track.name.toLowerCase().trim()}_${(track.artist?.name || track.artist || '').toLowerCase().trim()}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(track);
            }
        }

        return unique;
    }

    applyDiversityFilter(tracks, maxPerArtist = 2) {
        const artistCounts = {};
        const firstPass = [];
        const secondPass = [];

        for (const track of tracks) {
            const artist = (track.artist?.name || track.artist || '').toLowerCase().trim();
            const count = artistCounts[artist] || 0;

            if (count < maxPerArtist) {
                artistCounts[artist] = count + 1;
                firstPass.push(track);
            } else {
                secondPass.push(track);
            }
        }

        for (const track of secondPass) {
            const artist = (track.artist?.name || track.artist || '').toLowerCase().trim();
            const count = artistCounts[artist] || 0;

            if (count < maxPerArtist + 1) {
                artistCounts[artist] = count + 1;
                firstPass.push(track);
            }
        }

        return firstPass;
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    async getPersonalizedRecommendations(listeningHistory, limit = 50) {
        try {
            const topArtists = listeningHistory.getTopArtists(5);
            const allRecommendations = [];

            for (const artist of topArtists) {
                const recs = await this.getRecommendationsByArtist(artist.name, 15);
                allRecommendations.push(...recs);
            }

            const unique = this.deduplicateTracks(allRecommendations);
            const diverseRecommendations = this.applyDiversityFilter(unique, 3);
            const shuffled = this.shuffleArray(diverseRecommendations);
            const selected = shuffled.slice(0, limit);

            return await this.enrichWithSpotify(selected);
        } catch (error) {
            console.error('Error getting personalized recommendations:', error);
        }
    }

    async getRecommendationsBasedOnRecentTopArtists(user, limit = 50) {
        try {
            // 1. Get Top Artists (Spotify Priority)
            let topArtists = [];
            
            if (spotifyService.isConnected()) {
                const spotifyTop = await spotifyService.getTopArtists(5, 'short_term');
                topArtists = spotifyTop.map(a => ({ name: a.name, id: a.id }));
            } else if (user) {
                topArtists = await lastfmService.getTopArtists(user, 5, '7day');
            }

            if (topArtists.length === 0) return [];

            // If we have Spotify IDs, we can use Spotify Recs directly
            if (spotifyService.isConnected() && topArtists[0].id) {
                const seedArtists = topArtists.slice(0, 5).map(a => a.id);
                const spotifyRecs = await spotifyService.getRecommendations(seedArtists, [], [], limit);
                return spotifyRecs.map(t => ({
                    id: t.id,
                    name: t.name,
                    artist: t.artists[0].name,
                    album: t.album.name,
                    imageUrl: t.album.images[0]?.url,
                    uri: t.uri,
                    spotifyUrl: t.external_urls.spotify,
                    previewUrl: t.preview_url
                }));
            }

            // Fallback to Last.fm Similarity Graph
            const allTracks = [];
            const seenArtists = new Set(topArtists.map(a => a.name.toLowerCase()));
            
            // ... (keep existing Last.fm logic)

            // 2. For each top artist, get similar artists
            const promises = topArtists.map(async (artist) => {
                try {
                    // Get 3 similar artists
                    const similarArtists = await lastfmService.getSimilarArtists(artist.name, 3);

                    // Filter out artists we already know (the top ones)
                    const newSimilar = similarArtists.filter(sim => !seenArtists.has(sim.name.toLowerCase()));

                    // 3. Get top tracks for these similar artists
                    const trackPromises = newSimilar.map(async (sim) => {
                        // Get top 5 tracks for each similar artist
                        const tracks = await lastfmService.getTopTracksByArtist(sim.name, 5);
                        return tracks;
                    });

                    const tracks = await Promise.all(trackPromises);
                    return tracks.flat();
                } catch (e) {
                    console.error(`Error processing artist ${artist.name}:`, e);
                    return [];
                }
            });

            const results = await Promise.all(promises);
            const combined = results.flat();

            // 4. Deduplicate and Shuffle
            const unique = this.deduplicateTracks(combined);
            const diverse = this.applyDiversityFilter(unique, 2);
            const shuffled = this.shuffleArray(diverse);
            const selected = shuffled.slice(0, limit);

            // 5. Enrich with Spotify
            return await this.enrichWithSpotify(selected);

        } catch (error) {
            console.error('Error getting recent recommendations:', error);
            return [];
        }
    }
}

export default new RecommendationService();
