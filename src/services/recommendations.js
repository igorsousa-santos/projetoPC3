import lastfmService from './lastfm';
import itunesService from './itunes';
import deezerService from './deezer'; 
import spotifyService from './spotify';
import useListeningHistoryStore from '../stores/listeningHistoryStore';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { aiAPI } from './api';
import usePreviewStore from '../stores/previewStore'; // Import adicionado pois é usado no código

class RecommendationService {
    constructor() {
        this.seenTracks = new Set();
    }

    // --- 1. RECOMENDAÇÃO HÍBRIDA (IA) ---
    async getAIRecommendations(prompt, limit = 25, contextArtists = [], { minTracks = 1, maxRetries = 0 } = {}) {
        try {
            const context = await this.gatherUserContext(contextArtists);

            const safePromptPreview = String(prompt || '').trim().slice(0, 80);
            console.debug('[RecService] Calling AI generateRecommendations', {
                limit,
                minTracks,
                maxRetries,
                promptPreview: safePromptPreview,
                promptLength: String(prompt || '').length,
                contextTopArtists: Array.isArray(context?.topArtists) ? context.topArtists.length : 0,
            });

            const res = await aiAPI.generateRecommendations(prompt, limit, context, { minTracks, maxRetries });

            console.debug('[RecService] AI generateRecommendations response', {
                success: res?.success,
                hasData: Boolean(res?.data),
                dataType: Array.isArray(res?.data) ? 'array' : typeof res?.data,
                message: res?.message,
            });
            
            if (res.success && res.data) {
                let result = { tracks: [], artists: [], albums: [] };
                const rawTracks = Array.isArray(res.data) ? res.data : (res.data.tracks || []);
                const rawArtists = !Array.isArray(res.data) ? (res.data.artists || []) : [];
                const rawAlbums = !Array.isArray(res.data) ? (res.data.albums || []) : [];

                if (rawTracks.length > 0) {
                    const enrichedTracks = await this.enrichTracks(rawTracks);
                    // Shuffle aqui garante que a IA não retorne blocos viciados
                    result.tracks = this.smartShuffle(this.shuffleArray(enrichedTracks));
                }
                if (rawArtists.length > 0) {
                    result.artists = await this.enrichArtists(this.shuffleArray(rawArtists));
                }
                if (rawAlbums.length > 0) {
                     const albumTracks = rawAlbums.map(a => ({ name: 'Intro', artist: a.artist, album: a.name })); 
                     const enrichedAlbumCovers = await this.enrichTracks(albumTracks);
                     result.albums = rawAlbums.map((originalAlbum, index) => ({
                         ...originalAlbum,
                         image: enrichedAlbumCovers[index]?.imageUrl || null
                     }));
                }

                if (result.tracks.length === 0) throw new Error("IA retornou zero faixas");
                return result;
            }
            throw new Error('Falha na IA');

        } catch (error) {
            console.warn('[RecService] Fallback para algoritmo clássico:', error);
            return this.getRecommendations(prompt, limit, contextArtists);
        }
    }

    // --- 2. RECOMENDAÇÃO CLÁSSICA (SEM IA) ---
    async getRecommendations(prompt, limit = 25, contextArtists = []) {
        try { usePreviewStore.getState().stopPreview(); } catch (e) {}

        const parsed = await this.parsePrompt(prompt);
        const { type, value } = parsed;

        try {
            let tracksAccumulator = [];

            if (type === 'artist') {
                tracksAccumulator = await this.getRecommendationsByArtist(value, limit);
            } 
            else if (type === 'genre') {
                const tracks = await lastfmService.getTopTracksByTag(value, 150);
                // Shuffle imediato para misturar os top tracks do gênero
                tracksAccumulator = this.shuffleArray(tracks); 
            } 
            else {
                // LÓGICA "PARA VOCÊ"
                
                // 1. Define Sementes
                let seeds = [];
                if (contextArtists && contextArtists.length > 0) {
                    const names = contextArtists.map(a => typeof a === 'string' ? a : a.name);
                    seeds = this.shuffleArray(names).slice(0, 5);
                } else {
                    const context = await this.gatherUserContext();
                    seeds = this.shuffleArray(context.topArtists).slice(0, 5);
                }

                if (seeds.length === 0) seeds.push('Coldplay', 'Radiohead', 'Queen');

                // 2. Busca similares
                const similarArtistsPromises = seeds.map(artist => 
                    lastfmService.getSimilarArtists(artist, 5).catch(() => [])
                );
                const similarArtistsArrays = await Promise.all(similarArtistsPromises);
                
                // Shuffle aqui para misturar a ordem dos artistas similares encontrados
                const poolOfSimilarArtists = this.deduplicateArtists(similarArtistsArrays.flat());
                const selectedArtists = this.shuffleArray(poolOfSimilarArtists).slice(0, 15);

                // 3. Busca tracks
                const trackPromises = selectedArtists.map(artist => 
                    lastfmService.getTopTracksByArtist(artist.name, 3).catch(() => [])
                );
                
                const results = await Promise.all(trackPromises);
                tracksAccumulator = results.flat();
            }

            // --- CORREÇÃO PRINCIPAL ---
            // Embaralha TUDO antes de cortar (slice). 
            // Sem isso, se tivermos 100 tracks [A,A,A,B,B,B...], o slice(40) pegaria apenas os primeiros artistas.
            const mixedTracks = this.shuffleArray(tracksAccumulator);

            // Agora cortamos para enriquecer (economia de API), mas já está misturado
            const tracksToEnrich = this.deduplicateTracks(mixedTracks).slice(0, 40);
            
            const enrichedTracks = await this.enrichTracks(tracksToEnrich);

            // Gera lista de artistas baseada nas tracks misturadas
            const uniqueArtistsMap = new Map();
            enrichedTracks.forEach(t => {
                if (t.artist && !uniqueArtistsMap.has(t.artist)) {
                    uniqueArtistsMap.set(t.artist, { name: t.artist, reason: `Recomendado` });
                }
            });
            
            const rawArtists = this.shuffleArray(Array.from(uniqueArtistsMap.values())).slice(0, 10);
            const enrichedArtists = await this.enrichArtists(rawArtists);
            
            // SmartShuffle final para garantir distribuição (ex: não tocar 2 do mesmo artista seguidas)
            const finalTracks = this.smartShuffle(enrichedTracks).slice(0, limit);

            return {
                tracks: finalTracks,
                artists: enrichedArtists,
                albums: [] 
            };

        } catch (error) {
            console.error('Erro Algorítmico:', error);
            return { tracks: [], artists: [], albums: [] };
        }
    }

    // --- COLETA DE CONTEXTO ---
    async gatherUserContext(injectedArtists = []) {
        if (injectedArtists.length > 0) {
            const names = injectedArtists.map(a => typeof a === 'string' ? a : a.name);
            return { topArtists: names, recentSongs: [] };
        }

        const historyStore = useListeningHistoryStore.getState();
        const authStore = useAuthStore.getState();
        const lastfmUser = authStore.lastfmUser;

        let artistPool = new Set();
        const localTopArtists = historyStore.getTopArtists(30);
        localTopArtists.forEach(a => artistPool.add(a.artist));

        if (lastfmUser) {
            try {
                const top7day = await lastfmService.getTopArtists(lastfmUser, 20, '7day');
                top7day.forEach(a => artistPool.add(a.name));
            } catch (e) {}
        }

        const topArtists = this.shuffleArray(Array.from(artistPool)).slice(0, 15);
        return { topArtists, recentSongs: [] };
    }

    // --- UTILS ---
    smartShuffle(tracks) {
        if (!tracks || tracks.length === 0) return [];
        const tracksByArtist = {};
        tracks.forEach(t => {
            const artist = (t.artist || '').toLowerCase();
            if (!tracksByArtist[artist]) tracksByArtist[artist] = [];
            tracksByArtist[artist].push(t);
        });
        
        // Ordena artistas por quem tem mais músicas (para distribuir melhor)
        const sortedArtists = Object.keys(tracksByArtist).sort((a, b) => tracksByArtist[b].length - tracksByArtist[a].length);
        const result = [];
        let lastArtist = null;
        
        while (result.length < tracks.length) {
            let added = false;
            for (let i = 0; i < sortedArtists.length; i++) {
                const artist = sortedArtists[i];
                if (tracksByArtist[artist].length > 0 && artist !== lastArtist) {
                    result.push(tracksByArtist[artist].shift());
                    lastArtist = artist;
                    added = true;
                    break; 
                }
            }
            // Se não conseguiu adicionar (ex: sobrou só tracks do mesmo artista), adiciona o próximo disponível
            if (!added) {
                for (let i = 0; i < sortedArtists.length; i++) {
                    if (tracksByArtist[sortedArtists[i]].length > 0) {
                        result.push(tracksByArtist[sortedArtists[i]].shift());
                        lastArtist = sortedArtists[i];
                        break;
                    }
                }
            }
        }
        return result;
    }

    async enrichTracks(tracks) {
        const enrichedTracks = [];
        const BATCH_SIZE = 6; 
        for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
            const batch = tracks.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (track) => {
                const artistName = track.artist?.name || track.artist || '';
                const trackName = track.name;
                const cleanName = this.cleanTrackName(trackName);
                const baseTrack = {
                    id: `${trackName}_${artistName}`.replace(/\s/g, '_').toLowerCase(),
                    name: trackName,
                    artist: artistName,
                    album: track.album || 'Unknown Album',
                    imageUrl: null,
                    previewUrl: null,
                    reason: track.reason || ''
                };
                if (track.image && Array.isArray(track.image)) {
                    const fmImg = track.image[2]?.['#text'];
                    if (fmImg && !fmImg.includes('2a96cbd8')) baseTrack.imageUrl = fmImg;
                }
                if (!baseTrack.imageUrl) {
                    try {
                        const deezerData = await deezerService.searchTrack(cleanName, artistName);
                        if (deezerData) {
                            baseTrack.id = `deezer_${deezerData.id}`;
                            baseTrack.name = deezerData.title;
                            baseTrack.album = deezerData.album?.title;
                            baseTrack.imageUrl = deezerData.album?.cover_xl || deezerData.album?.cover_medium;
                            baseTrack.previewUrl = deezerData.preview;
                            baseTrack.externalUrl = deezerData.link;
                        } else {
                            const itunesData = await itunesService.searchTrack(cleanName, artistName);
                            if (itunesData) {
                                baseTrack.imageUrl = itunesData.imageUrl;
                                baseTrack.previewUrl = itunesData.previewUrl;
                            }
                        }
                    } catch (e) {}
                }
                return baseTrack;
            });
            const processedBatch = await Promise.all(batchPromises);
            enrichedTracks.push(...processedBatch);
            if (i + BATCH_SIZE < tracks.length) await new Promise(r => setTimeout(r, 100));
        }
        return enrichedTracks;
    }

    async enrichArtists(artists) {
        if (!artists) return [];
        const enrichedArtists = [];
        const BATCH_SIZE = 5;
        for (let i = 0; i < artists.length; i += BATCH_SIZE) {
            const batch = artists.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (artist) => {
                const hasValidImage = artist.image && !artist.image.includes('2a96cbd8b46e442fc41c2b86b821562f') && !JSON.stringify(artist.image).includes('#text');
                if (artist.imageUrl || hasValidImage) return artist;
                let deezerImage = null;
                try {
                    const query = encodeURIComponent(artist.name);
                    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://api.deezer.com/search/artist?q=${query}&limit=1`)}`;
                    const res = await fetch(proxyUrl);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.data?.[0]) deezerImage = data.data[0].picture_xl || data.data[0].picture_big;
                    }
                } catch (e) {}
                return { ...artist, image: deezerImage || artist.image || null, imageUrl: deezerImage || null };
            });
            const results = await Promise.all(batchPromises);
            enrichedArtists.push(...results);
            await new Promise(r => setTimeout(r, 150));
        }
        return enrichedArtists;
    }

    async getRecommendationsByArtist(artistName, limit) {
        const similarArtists = await lastfmService.getSimilarArtists(artistName, 40);
        const filtered = similarArtists.filter(a => this.normalizeString(a.name) !== this.normalizeString(artistName));
        const seeds = this.shuffleArray(filtered).slice(0, 10);
        const promises = seeds.map(artist => lastfmService.getTopTracksByArtist(artist.name, 3).catch(() => []));
        const results = await Promise.all(promises);
        // Shuffle aqui garante que não retornamos blocos [A,A,A, B,B,B]
        return this.shuffleArray(results.flat());
    }

    async parsePrompt(prompt) {
        const lower = prompt.toLowerCase();
        const knownGenres = ['rock', 'pop', 'sertanejo', 'funk', 'pagode', 'jazz', 'metal', 'eletrônica', 'hip hop'];
        if (knownGenres.some(g => lower.includes(g))) return { type: 'genre', value: prompt };
        if (lower.includes('baseado') || lower.includes('variad') || lower.includes('gosto') || prompt.length < 5) return { type: 'mixed', value: 'foryou' };
        return { type: 'artist', value: prompt };
    }

    deduplicateArtists(artists) {
        const seen = new Set();
        return artists.filter(a => {
            const name = a.name.toLowerCase();
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
        });
    }

    cleanTrackName(name) {
        if (!name) return '';
        let cleaned = name.replace(/\s(prod\.|feat\.|ft\.|with).*/gi, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/\s+-\s+.*$/, '');
        return cleaned.replace(/\s+/g, ' ').trim();
    }

    normalizeString(str) {
        if (!str) return '';
        return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }

    deduplicateTracks(tracks) {
        const seen = new Map();
        const unique = [];
        for (const track of tracks) {
            const key = `${track.name.toLowerCase().trim()}_${(track.artist?.name || track.artist || '').toLowerCase().trim()}`;
            if (!seen.has(key)) { seen.set(key, true); unique.push(track); }
        }
        return unique;
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

export default new RecommendationService();