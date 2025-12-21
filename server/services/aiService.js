import genAI from '../config/genai.js';
import lastfmService from './lastfmService.js';

const buildError = (message, status = 400) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

/**
 * System instructions - Code A's algorithm as instructions for Gemini
 */
const RECOMMENDATION_ALGORITHM_INSTRUCTIONS = `
Você é um estrategista de recomendações musicais que analisa as solicitações do usuário e cria uma estratégia de busca.

# SUA TAREFA: Analisar a solicitação do usuário e determinar a estratégia de recomendação

## PASSO 1: CLASSIFICAR O TIPO DE SOLICITAÇÃO

Analise a solicitação do usuário e classifique-a como uma das seguintes:

**BUSCA POR ARTISTA:**
- O usuário menciona o nome de um artista/banda (ex: "músicas como Radiohead", "música semelhante a Taylor Swift")
- Intenção: encontrar músicas de artistas semelhantes
- Extrair: nome do artista

**BUSCA POR FAIXA (TRACK):**  
- O usuário menciona uma música específica (ex: "Creep do Radiohead", "músicas como Bohemian Rhapsody")
- Padrões: "[faixa] de [artista]", "[faixa] - [artista]", "músicas como [faixa]"
- Intenção: encontrar faixas com som semelhante
- Extrair: nome da faixa, nome do artista (se fornecido)

**BUSCA POR GÊNERO/HUMOR:**
- O usuário menciona um gênero, humor (mood) ou vibe (ex: "indie rock", "música relaxante para estudar", "rock animado dos anos 80")
- Inclui: nomes de gêneros, humores (relaxante, animado, triste), atividades (treino, estudo), décadas
- Intenção: encontrar faixas que correspondam a esse estilo/vibe
- Extrair: descritor de gênero/tag/humor

Se a solicitação for ambígua ou conversacional, escolha a intenção mais provável.

## PASSO 2: RETORNAR A ESTRATÉGIA

Retorne um objeto JSON com a estratégia de busca. Exemplos:

**Para "músicas como Radiohead":**
{
  "type": "artist",
  "searchTerm": "Radiohead",
  "explanation": "O usuário quer artistas semelhantes a Radiohead"
}

**Para "Creep do Radiohead" ou "músicas como Creep":**
{
  "type": "track", 
  "trackName": "Creep",
  "artistName": "Radiohead",
  "explanation": "O usuário quer faixas semelhantes a Creep"
}

**Para "vibe indie relaxante" ou "rock animado anos 80":**
{
  "type": "genre",
  "searchTerm": "indie",
  "modifier": "relaxante",
  "explanation": "O usuário quer música indie relaxante"
}

CRÍTICO: Retorne APENAS JSON válido, sem nenhum outro texto.
`.trim();

/**
 * Code A's filtering utilities
 */
class RecommendationFilters {
    /**
     * Normalize string for comparison (Code A's normalizeString)
     */
    static normalizeString(str) {
        if (!str) return '';
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    /**
     * Clean track name (Code A's cleanTrackName)
     */
    static cleanTrackName(name) {
        if (!name) return '';
        let cleaned = name;

        // Remove production credits, features, etc.
        cleaned = cleaned.replace(/\s(prod\.|feat\.|ft\.|with).*/gi, '');

        // Remove square brackets (metadata)
        cleaned = cleaned.replace(/\[.*?\]/g, '');

        // Remove garbage patterns
        cleaned = cleaned
            .replace(/\*\*.*?\*\*/g, '')
            .replace(/EP OUT NOW/gi, '')
            .replace(/\(LQ\)/gi, '')
            .replace(/\(HQ\)/gi, '');

        // Remove parentheses with specific keywords
        const keywords = ['prod', 'feat', 'ft', 'bootleg', 'remix', 'edit', 'demo',
            'version', 'slowed', 'reverb', 'mix', 'vip', 'live', 'session'];
        const noiseRegex = new RegExp(`\\(.*?\\b(?:${keywords.join('|')})\\b.*?\\)`, 'gi');
        cleaned = cleaned.replace(noiseRegex, '');

        // Remove dates
        cleaned = cleaned.replace(/\d{2}\.\d{2}\.\d{4}/g, '');
        cleaned = cleaned.replace(/\d{4}/g, '');

        // Remove part numbers
        cleaned = cleaned.replace(/\bp\d+\b/gi, '');
        cleaned = cleaned.replace(/\bpt\.?\s*\d+\b/gi, '');
        cleaned = cleaned.replace(/\bpart\s*\d+\b/gi, '');

        // Remove trailing dash garbage
        cleaned = cleaned.replace(/\s+-\s+.*$/, '');

        return cleaned.replace(/\s+/g, ' ').trim();
    }

    /**
     * Deduplicate tracks (Code A's deduplicateTracks)
     */
    static deduplicateTracks(tracks) {
        const seen = new Map();
        const unique = [];

        for (const track of tracks) {
            const key = `${this.normalizeString(track.name)}_${this.normalizeString(track.artist)}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(track);
            }
        }

        return unique;
    }

    /**
     * Apply diversity filter (Code A's applyDiversityFilter)
     */
    static applyDiversityFilter(tracks, maxPerArtist = 2) {
        const artistCounts = {};
        const filtered = [];

        for (const track of tracks) {
            const artist = this.normalizeString(track.artist);
            const count = artistCounts[artist] || 0;

            if (count < maxPerArtist) {
                artistCounts[artist] = count + 1;
                filtered.push(track);
            }
        }

        return filtered;
    }

    /**
     * Shuffle array (Code A's shuffleArray)
     */
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

/**
 * Enhanced recommendation service using Gemini + Last.fm hybrid approach
 */
export const generateRecommendations = async ({ prompt, limit = 20, context = {} }) => {
    if (!genAI) throw buildError('AI Service not configured', 503);
    if (!prompt || typeof prompt !== 'string') throw buildError('Valid prompt is required', 400);

    prompt = prompt.trim().substring(0, 500);
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 5), 50);

    // STEP 1: Use Gemini to parse the prompt intelligently
    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    type: { type: 'STRING', enum: ['artist', 'track', 'genre'] },
                    searchTerm: { type: 'STRING' },
                    trackName: { type: 'STRING', nullable: true },
                    artistName: { type: 'STRING', nullable: true },
                    modifier: { type: 'STRING', nullable: true },
                    explanation: { type: 'STRING' }
                },
                required: ['type', 'explanation']
            },
        },
        contents: [{
            role: 'user',
            parts: [{
                text: `${RECOMMENDATION_ALGORITHM_INSTRUCTIONS}\n\nUser prompt: "${prompt}"\n\nAnalyze and return the strategy.`
            }]
        }]
    });

    const candidates = response.response?.candidates || response.candidates;
    if (!candidates || !candidates[0] || !candidates[0].content) {
        throw buildError('Invalid response from Gemini API', 500);
    }

    const strategyText = candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    const strategy = JSON.parse(strategyText);

    console.log('[Enhanced AI] Strategy:', strategy);

    // STEP 2: Execute Last.fm queries based on Gemini's strategy
    let lastfmTracks = [];

    try {
        if (strategy.type === 'artist') {
            lastfmTracks = await getRecommendationsByArtist(strategy.searchTerm, limit * 3);
        } else if (strategy.type === 'track') {
            lastfmTracks = await getRecommendationsByTrack(
                strategy.trackName || strategy.searchTerm,
                strategy.artistName,
                limit * 3
            );
        } else if (strategy.type === 'genre') {
            lastfmTracks = await getRecommendationsByGenre(
                strategy.searchTerm,
                strategy.modifier,
                limit * 3
            );
        }
    } catch (error) {
        console.error('[Last.fm Error]', error);
        throw buildError('Failed to fetch music recommendations', 500);
    }

    // Debug info on raw Last.fm result size and sample
    console.log('[Enhanced AI] Last.fm tracks count:', lastfmTracks?.length || 0);
    if (lastfmTracks && lastfmTracks.length > 0) {
        console.log('[Enhanced AI] Sample track:', lastfmTracks[0]);
    }

    // STEP 3: Apply Code A's filtering algorithm
    let filtered = RecommendationFilters.deduplicateTracks(lastfmTracks);
    filtered = RecommendationFilters.applyDiversityFilter(filtered, 2);
    filtered = RecommendationFilters.shuffleArray(filtered);
    filtered = filtered.slice(0, limit);

    console.log('[Enhanced AI] Filtered tracks count:', filtered?.length || 0);

    // If filtered is empty, surface a clear error (no classic fallback)
    if (!filtered || filtered.length === 0) {
        console.warn('[Enhanced AI] Zero tracks after filtering. Strategy:', strategy, 'RawCount:', lastfmTracks?.length || 0);
        throw buildError('AI returned zero tracks after filtering', 502);
    }

    // STEP 4: Return enriched results
    // Note: Frontend or additional service should enrich with Spotify/album art
    return filtered.map(track => ({
        name: track.name,
        artist: track.artist,
        reason: strategy.explanation || 'Recommended based on your taste'
    }));
};

/**
 * Get recommendations by artist (Code A's algorithm)
 */
async function getRecommendationsByArtist(artistName, limit) {
    const normSearchArtist = RecommendationFilters.normalizeString(artistName);

    // Get similar artists
    const similarArtists = await lastfmService.getSimilarArtists(artistName, 60);

    // Filter out the original artist
    const filteredSimilar = similarArtists.filter(a => {
        const norm = RecommendationFilters.normalizeString(a.name);
        return norm !== normSearchArtist && !norm.includes(normSearchArtist);
    });

    // Select 20 random artists for variety
    const selectedArtists = RecommendationFilters.shuffleArray(filteredSimilar).slice(0, 20);

    // Get tracks from each artist (pages 2-10 for variety)
    const promises = selectedArtists.map(async (artist) => {
        const randomPage = Math.floor(Math.random() * 9) + 2; // Pages 2-10
        const tracks = await lastfmService.getTopTracksByArtist(artist.name, 20, randomPage);
        return RecommendationFilters.shuffleArray(tracks).slice(0, 3);
    });

    const allTracks = (await Promise.all(promises)).flat();

    // Filter out original artist's tracks
    return allTracks.filter(track => {
        const normTrackArtist = RecommendationFilters.normalizeString(track.artist);
        return normTrackArtist !== normSearchArtist && !normTrackArtist.includes(normSearchArtist);
    });
}

/**
 * Get recommendations by track (Code A's algorithm)
 */
async function getRecommendationsByTrack(trackName, artistName, limit) {
    try {
        // If no artist provided, search for the track first
        if (!artistName) {
            const searchResults = await lastfmService.searchTrack(trackName, 5);
            if (searchResults.length > 0) {
                trackName = searchResults[0].name;
                artistName = searchResults[0].artist;
            } else {
                // Fallback to artist search with the track name
                return getRecommendationsByArtist(trackName, limit);
            }
        }

        const normSearchArtist = RecommendationFilters.normalizeString(artistName);

        // Get similar tracks
        const similarTracks = await lastfmService.getSimilarTracks(trackName, artistName, 60);

        // Filter out original artist
        return similarTracks.filter(track => {
            const normTrackArtist = RecommendationFilters.normalizeString(track.artist);
            return normTrackArtist !== normSearchArtist && !normTrackArtist.includes(normSearchArtist);
        });
    } catch (error) {
        console.error('[Track Search Error]', error);
        // Fallback to artist search
        return artistName ? getRecommendationsByArtist(artistName, limit) : [];
    }
}

/**
 * Get recommendations by genre/mood (Code A's algorithm)
 */
async function getRecommendationsByGenre(genre, modifier, limit) {
    // Random page for variety
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const tracks = await lastfmService.getTopTracksByTag(genre, 100, randomPage);
    return RecommendationFilters.shuffleArray(tracks);
}

// Export other existing AI functions (keep backward compatibility)
export const analyzeTaste = async ({ topArtists = [], topTracks = [] }) => {
    if (!genAI) throw buildError('AI Service not configured', 503);

    const artistsStr = topArtists.slice(0, 15).map((a) => a.name).join(', ');

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    mainGenres: { type: 'ARRAY', items: { type: 'STRING' } },
                    vibe: { type: 'STRING' },
                    era: { type: 'STRING' },
                },
            },
        },
        contents: [{
            role: 'user',
            parts: [{ text: `Analise o gosto musical de um usuário que ouve estes artistas: ${artistsStr}.` }],
        }],
    });

    const candidates = response.response?.candidates || response.candidates;
    if (!candidates || !candidates[0] || !candidates[0].content) {
        throw buildError('Invalid response from Gemini API', 500);
    }

    let text = candidates[0].content.parts[0].text;
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
};

export const describePlaylist = async ({ name, tracks = [] }) => {
    if (!genAI) throw buildError('AI Service not configured', 503);

    const tracksStr = tracks.slice(0, 20).map(t => `${t.name} by ${t.artist}`).join(', ');

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [{
            role: 'user',
            parts: [{
                text: `Crie uma descrição breve e envolvente (2 a 3 frases) para uma playlist chamada "${name}" que contém estas músicas: ${tracksStr}.`
            }]
        }]
    });

    const candidates = response.response?.candidates || response.candidates;
    if (!candidates || !candidates[0] || !candidates[0].content) {
        throw buildError('Invalid response from Gemini API', 500);
    }

    return candidates[0].content.parts[0].text.trim();
};
