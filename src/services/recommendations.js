import lastfmService from './lastfm';
import itunesService from './itunes';
import deezerService from './deezer';
import spotifyService from './spotify'; // Adicionado caso use Spotify
import imageService from './imageService'; // Importante para consistência de imagens
import usePreviewStore from '../stores/previewStore';
import useListeningHistoryStore from '../stores/listeningHistoryStore';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { aiAPI } from './api';

class RecommendationService {
    constructor() {
        this.seenTracks = new Set(); // Histórico da sessão para evitar repetições
        
        // Dicionário de tradução de Humor (Português -> Inglês)
        this.moodTranslations = {
            'triste': 'sad', 'tristes': 'sad', 'tristeza': 'melancholic',
            'alegre': 'happy', 'feliz': 'happy', 'animada': 'upbeat',
            'calma': 'chill', 'relaxante': 'relaxing', 'estudo': 'study',
            'treino': 'workout', 'festa': 'party', 'dançar': 'dance',
            'noite': 'night', 'dia': 'day', 'chuva': 'rainy', 'sol': 'sunny',
            'rock': 'rock', 'pop': 'pop', 'jazz': 'jazz', 'metal': 'metal'
            // ... (Mantenha o resto do seu dicionário aqui)
        };
    }

    // --- ENTRADA PRINCIPAL: IA (Gemini/OpenAI) ---
    async getAIRecommendations(prompt, limit = 25) {
        try {
            const context = { genres: [], albums: [], recentSongs: [] };
            const authStore = useAuthStore.getState();
            const lastfmUser = authStore.lastfmUser;

            if (lastfmUser) {
                try {
                    // MUDANÇA 1: Aumentado para Top 10 Artistas para dar mais variedade
                    const [albums, artists, recent] = await Promise.all([
                        lastfmService.getTopAlbums(lastfmUser, 5, '7day'), // Top 5 Albums
                        lastfmService.getTopArtists(lastfmUser, 10, '7day'), // TOP 10 Artistas
                        lastfmService.getRecentTracks(lastfmUser, 5)
                    ]);

                    context.albums = albums.map(a => `${a.name} by ${a.artist?.name || a.artist}`);
                    
                    // Pega gêneros baseados nos top 10 artistas
                    const genrePromises = artists.map(artist => 
                        lastfmService.getArtistTags(artist.name).then(tags => tags[0]?.name).catch(() => null)
                    );
                    const genres = await Promise.all(genrePromises);
                    context.genres = [...new Set(genres.filter(g => g))].slice(0, 5); // Top 5 Gêneros únicos

                    context.recentSongs = recent.map(t => `${t.name} by ${t.artist['#text']}`);
                } catch (e) {
                    console.warn('Falha ao obter contexto do Last.fm para IA:', e);
                }
            }

            const res = await aiAPI.generateRecommendations(prompt, limit, context);
            
            if (res.success && res.data) {
                if (Array.isArray(res.data)) {
                    const enriched = await this.enrichTracks(res.data);
                    return { tracks: this.smartShuffle(enriched), artists: [], albums: [] };
                } else {
                    const result = {
                        tracks: [],
                        artists: [],
                        albums: []
                    };

                    // 1. Enriquece Tracks e aplica Smart Shuffle (Não agrupar artistas)
                    if (res.data.tracks && res.data.tracks.length > 0) {
                        const enrichedTracks = await this.enrichTracks(res.data.tracks);
                        result.tracks = this.smartShuffle(enrichedTracks);
                    }

                    // 2. Enriquece Artistas
                    if (res.data.artists && res.data.artists.length > 0) {
                        result.artists = await this.enrichArtists(this.shuffleArray(res.data.artists));
                    }

                    // 3. Enriquece Álbuns
                    if (res.data.albums && res.data.albums.length > 0) {
                         const albumTracks = res.data.albums.map(a => ({ name: 'Intro', artist: a.artist, album: a.name })); 
                         const enrichedAlbumCovers = await this.enrichTracks(albumTracks);
                         
                         result.albums = res.data.albums.map((originalAlbum, index) => ({
                             ...originalAlbum,
                             image: enrichedAlbumCovers[index]?.imageUrl || null
                         }));
                    }

                    return result;
                }
            }
            
            throw new Error(res.message || 'Falha na geração da IA');

        } catch (error) {
            console.error('Erro na Recomendação por IA:', error);
            useToastStore.getState().warning('Quota de IA excedida. Usando algoritmo clássico.');
            return this.getRecommendations(prompt, limit);
        }
    }

    // --- ENTRADA SECUNDÁRIA: ALGORITMO CLÁSSICO ---
    async getRecommendations(prompt, limit = 25) {
        try {
            usePreviewStore.getState().stopPreview();
        } catch (e) {}

        const parsed = await this.parsePrompt(prompt);
        const { type, value, track, artist } = parsed;

        try {
            let lastfmTracks = [];

            if (type === 'artist') {
                lastfmTracks = await this.getRecommendationsByArtist(value, limit);
            } else if (type === 'track') {
                if (track && artist) {
                    lastfmTracks = await this.getRecommendationsByTrack(track, artist, limit);
                } else {
                    lastfmTracks = await this.getRecommendationsByTrackSearch(value, limit);
                }
            } else if (type === 'genre') {
                const lowerValue = value.toLowerCase();
                const BR_GENRE_SEEDS = {
                    'funk carioca': ['Anitta', 'Ludmilla', 'MC Kevin o Chris', 'Dennis DJ', 'Pedro Sampaio'],
                    'sertanejo': ['Jorge & Mateus', 'Gusttavo Lima', 'Marília Mendonça', 'Henrique & Juliano'],
                    'pagode': ['Sorriso Maroto', 'Thiaguinho', 'Menos é Mais', 'Ferrugem']
                };

                if (BR_GENRE_SEEDS[lowerValue]) {
                    const seeds = BR_GENRE_SEEDS[lowerValue];
                    const randomSeed = seeds[Math.floor(Math.random() * seeds.length)];
                    lastfmTracks = await this.getRecommendationsByArtist(randomSeed, limit);
                } else {
                    lastfmTracks = await this.getRecommendationsByGenre(value, limit);
                }
            }

            // 1. Enriquece as Faixas (Capa, Preview)
            const enrichedTracks = await this.enrichTracks(lastfmTracks);

            // 2. Extrai Artistas Únicos das faixas recomendadas
            const uniqueArtistsMap = new Map();
            enrichedTracks.forEach(t => {
                if (t.artist && !uniqueArtistsMap.has(t.artist)) {
                    uniqueArtistsMap.set(t.artist, {
                        name: t.artist,
                        reason: `Similares a ${value}`
                    });
                }
            });
            
            // MUDANÇA 2: Pega artistas baseados no Top 10 e os embaralha
            const rawArtists = this.shuffleArray(Array.from(uniqueArtistsMap.values())).slice(0, 10);
            const enrichedArtists = await this.enrichArtists(rawArtists);

            // 3. Aplica SMART SHUFFLE nas faixas para evitar artistas repetidos em sequência
            const finalTracks = this.smartShuffle(enrichedTracks);

            return {
                tracks: finalTracks,
                artists: enrichedArtists,
                albums: [] 
            };

        } catch (error) {
            console.error('Erro ao buscar recomendações algorítmicas:', error);
            throw error;
        }
    }

    // --- LÓGICA DE PARSEAMENTO (Mantida) ---
    async parsePrompt(prompt) {
        const lowerPrompt = prompt.toLowerCase().trim();
        const trackPatterns = [
            /(.+?)\s+by\s+(.+)/i,
            /(.+?)\s+-\s+(.+)/,
            /(.+?)\s+de\s+(.+)/i, 
        ];

        for (const pattern of trackPatterns) {
            const match = prompt.match(pattern);
            if (match) {
                return { type: 'track', value: prompt, track: match[1].trim(), artist: match[2].trim() };
            }
        }

        const genreKeywords = [ 'rock', 'pop', 'jazz', 'indie', 'metal', 'sertanejo', 'funk', 'pagode' ]; // (Simplificado para brevidade)
        if (genreKeywords.some(genre => lowerPrompt.includes(genre))) {
            return { type: 'genre', value: prompt };
        }

        let translatedMood = null;
        for (const [ptWord, enWord] of Object.entries(this.moodTranslations)) {
            if (lowerPrompt.includes(ptWord)) {
                translatedMood = enWord;
                break;
            }
        }
        if (translatedMood) return { type: 'genre', value: translatedMood };

        return { type: 'artist', value: prompt };
    }

    // --- ESTRATÉGIAS DE RECOMENDAÇÃO ---

    async getRecommendationsByArtist(artistName, limit) {
        const normSearchArtist = this.normalizeString(artistName);
        
        // Busca 60 similares para ter um pool grande
        const similarArtists = await lastfmService.getSimilarArtists(artistName, 60);

        const filteredSimilar = similarArtists.filter(a => {
            const norm = this.normalizeString(a.name);
            return norm !== normSearchArtist && !norm.includes(normSearchArtist);
        });

        // Seleciona 15 artistas aleatórios do pool (antes era menos)
        const selectedArtists = this.shuffleArray(filteredSimilar).slice(0, 15);

        const promises = selectedArtists.map(async (artist) => {
            const randomPage = Math.floor(Math.random() * 5) + 1;
            // Pega apenas 2 faixas por artista para forçar variedade
            const tracks = await lastfmService.getTopTracksByArtist(artist.name, 5, randomPage);
            return this.shuffleArray(tracks).slice(0, 2);
        });

        const similarTracks = (await Promise.all(promises)).flat();
        return this.processAndFilterTracks(similarTracks, normSearchArtist, limit, artistName);
    }
    
    // ... (getRecommendationsByTrack, getRecommendationsByTrackSearch, getRecommendationsByGenre mantidos iguais) ...
    async getRecommendationsByTrack(trackName, artistName, limit) {
        try {
            const normSearchArtist = this.normalizeString(artistName);
            const similarTracks = await lastfmService.getSimilarTracks(trackName, artistName, 60);
            return await this.processAndFilterTracks(similarTracks, normSearchArtist, limit, artistName);
        } catch (error) { return this.getRecommendationsByArtist(artistName, limit); }
    }

    async getRecommendationsByTrackSearch(trackQuery, limit) {
        const searchData = await lastfmService.searchTrack(trackQuery, 1);
        if (searchData.tracks && searchData.tracks.length > 0) {
            const mainTrack = searchData.tracks[0];
            return this.getRecommendationsByTrack(mainTrack.name, mainTrack.artist?.name || mainTrack.artist, limit);
        }
        return this.getRecommendationsByArtist(trackQuery, limit);
    }

    async getRecommendationsByGenre(genre, limit) {
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const topTracks = await lastfmService.getTopTracksByTag(genre, 100, randomPage);
        return this.shuffleArray(topTracks).slice(0, limit);
    }

    async processAndFilterTracks(tracks, normSearchArtist, limit, seedArtistName) {
        let filteredTracks = tracks.filter(track => {
            const trackName = track.name.toLowerCase();
            const trackArtistName = track.artist?.name || track.artist || '';
            const normTrackArtist = this.normalizeString(trackArtistName);
            const uniqueId = `${trackName}_${normTrackArtist}`;
            const isSame = normTrackArtist === normSearchArtist;
            
            if (isSame) return false;
            if (this.seenTracks.has(uniqueId)) return false;

            return true;
        });

        if (filteredTracks.length < limit) {
            const missing = limit - filteredTracks.length;
            const deepCuts = await this.getDeepCuts(seedArtistName, missing * 3);
            filteredTracks = [...filteredTracks, ...deepCuts];
        }

        const uniqueTracks = this.deduplicateTracks(filteredTracks);
        // Filtro de diversidade: Max 2 músicas por artista no total
        const diverseTracks = this.applyDiversityFilter(uniqueTracks, 2);
        
        // MUDANÇA: Retornamos tudo aqui, o corte (slice) e o shuffle final são feitos no método principal
        return diverseTracks; 
    }

    async getDeepCuts(artistName, limit) {
        try {
            const similarArtists = await lastfmService.getSimilarArtists(artistName, 40);
            const selectedArtists = this.shuffleArray(similarArtists).slice(0, 10); // Top 10 similares para deep cuts

            const promises = selectedArtists.map(async (artist) => {
                const randomPage = Math.floor(Math.random() * 10) + 10;
                const tracks = await lastfmService.getTopTracksByArtist(artist.name, 10, randomPage);
                return this.shuffleArray(tracks).slice(0, 2);
            });

            return (await Promise.all(promises)).flat();
        } catch (e) { return []; }
    }

    // --- ENRIQUECIMENTO DE DADOS (Tracks e Artistas) ---

    async enrichTracks(tracks) {
        const enrichedTracks = [];
        const BATCH_SIZE = 5;

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

                // 1. TENTA ITUNES (Geralmente tem as melhores capas quadradas e previews)
                try {
                    const itunesData = await itunesService.searchTrack(cleanName, artistName);
                    if (itunesData) {
                        return {
                            ...baseTrack,
                            id: `itunes_${itunesData.id}`,
                            name: itunesData.name,
                            artist: itunesData.artist,
                            album: itunesData.album,
                            imageUrl: itunesData.imageUrl, // 600x600
                            previewUrl: itunesData.previewUrl,
                            externalUrl: itunesData.externalUrl
                        };
                    }
                } catch (e) {}

                // 2. TENTA DEEZER (Fallback forte)
                try {
                    const deezerData = await deezerService.searchTrack(cleanName, artistName);
                    if (deezerData) {
                        return {
                            ...baseTrack,
                            id: `deezer_${deezerData.id}`,
                            name: deezerData.title,
                            album: deezerData.album?.title,
                            imageUrl: deezerData.album?.cover_xl || deezerData.album?.cover_medium,
                            previewUrl: deezerData.preview,
                            externalUrl: deezerData.link
                        };
                    }
                } catch (e) {}

                return baseTrack;
            });

            const processedBatch = await Promise.all(batchPromises);
            enrichedTracks.push(...processedBatch);

            if (i + BATCH_SIZE < tracks.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        return enrichedTracks;
    }

    async enrichArtists(artists) {
        if (!artists || !Array.isArray(artists)) return [];
        
        const enrichedArtists = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < artists.length; i += BATCH_SIZE) {
            const batch = artists.slice(i, i + BATCH_SIZE);

            const batchPromises = batch.map(async (artist) => {
                // Validação de imagem existente
                const hasValidImage = artist.image && 
                                      !artist.image.includes('2a96cbd8b46e442fc41c2b86b821562f') && 
                                      !JSON.stringify(artist.image).includes('#text');

                if (artist.imageUrl || hasValidImage) {
                    return artist;
                }

                // Busca Centralizada (Spotify > Deezer > iTunes)
                const newImageUrl = await imageService.getArtistImage(artist.name);

                return {
                    ...artist,
                    image: newImageUrl || artist.image || null,
                    imageUrl: newImageUrl || null
                };
            });

            const results = await Promise.all(batchPromises);
            enrichedArtists.push(...results);
            
            if (i + BATCH_SIZE < artists.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return enrichedArtists;
    }

    // --- UTILITÁRIOS ---

    // MUDANÇA 3: SMART SHUFFLE (Evita artistas repetidos em sequência)
    smartShuffle(tracks) {
        if (!tracks || tracks.length === 0) return [];
        
        // 1. Agrupa tracks por artista
        const tracksByArtist = {};
        tracks.forEach(t => {
            const artist = (t.artist || '').toLowerCase();
            if (!tracksByArtist[artist]) tracksByArtist[artist] = [];
            tracksByArtist[artist].push(t);
        });

        // 2. Ordena artistas por quem tem mais músicas (para distribuir os mais frequentes primeiro)
        const sortedArtists = Object.keys(tracksByArtist).sort((a, b) => 
            tracksByArtist[b].length - tracksByArtist[a].length
        );

        const result = [];
        let lastArtist = null;

        // 3. Loop de distribuição
        while (result.length < tracks.length) {
            let added = false;

            for (let i = 0; i < sortedArtists.length; i++) {
                const artist = sortedArtists[i];
                const artistTracks = tracksByArtist[artist];

                if (artistTracks.length > 0) {
                    // Tenta não repetir o último artista
                    if (artist !== lastArtist) {
                        result.push(artistTracks.shift());
                        lastArtist = artist;
                        added = true;
                        
                        // Move este artista para o fim da fila de prioridade momentaneamente? 
                        // Não, apenas continua o loop. O loop externo garante que voltamos ao topo.
                        break; 
                    }
                }
            }

            // Fallback: Se não conseguimos adicionar ninguém diferente (ex: sobrou só 1 artista), adiciona ele mesmo
            if (!added) {
                for (let i = 0; i < sortedArtists.length; i++) {
                    const artist = sortedArtists[i];
                    if (tracksByArtist[artist].length > 0) {
                        result.push(tracksByArtist[artist].shift());
                        lastArtist = artist;
                        break;
                    }
                }
            }
        }

        return result;
    }

    cleanTrackName(name) {
        if (!name) return '';
        let cleaned = name;
        cleaned = cleaned.replace(/\s(prod\.|feat\.|ft\.|with).*/gi, '');
        cleaned = cleaned.replace(/\[.*?\]/g, '');
        cleaned = cleaned.replace(/\(.*?\)/g, '');
        cleaned = cleaned.replace(/\d{2}\.\d{2}\.\d{4}/g, '');
        cleaned = cleaned.replace(/\s+-\s+.*$/, '');
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
            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(track);
            }
        }
        return unique;
    }

    applyDiversityFilter(tracks, maxPerArtist = 2) {
        const artistCounts = {};
        const result = [];
        for (const track of tracks) {
            const artist = (track.artist?.name || track.artist || '').toLowerCase().trim();
            const count = artistCounts[artist] || 0;
            if (count < maxPerArtist) {
                artistCounts[artist] = count + 1;
                result.push(track);
            }
        }
        return result;
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