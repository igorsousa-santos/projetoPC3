import genAI from '../config/genai.js';
import lastfmService from './lastfmService.js';

const buildError = (message, status = 400) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

/**
 * System instructions for Gemini to generate track recommendations directly
 */
const TRACK_GENERATION_INSTRUCTIONS = `
Você é um especialista em recomendações musicais. Sua tarefa é gerar uma lista de músicas reais e conhecidas.

# REGRAS IMPORTANTES:
1. Retorne APENAS músicas que existem de verdade em serviços de streaming (Spotify, Deezer, Apple Music).
2. Use os nomes OFICIAIS das faixas e artistas (como aparecem no Spotify/Deezer).
3. Evite remixes, versões ao vivo, covers ou bootlegs (a menos que especificamente pedido).
4. Varie os artistas - não repita o mesmo artista mais que 2-3 vezes.
5. Misture músicas populares com algumas menos conhecidas para variedade.
6. Se o usuário mencionar artistas específicos, inclua músicas de artistas SIMILARES, não apenas dos mencionados.

# FORMATO DE SAÍDA:
Retorne um array JSON de objetos, cada um com:
- "name": nome exato da música (string)
- "artist": nome exato do artista principal (string)
- "reason": breve explicação de por que essa música foi escolhida (string, opcional)

Exemplo:
[
  {"name": "Creep", "artist": "Radiohead", "reason": "Clássico do rock alternativo dos anos 90"},
  {"name": "Paranoid Android", "artist": "Radiohead", "reason": "Obra-prima experimental"},
  {"name": "Bitter Sweet Symphony", "artist": "The Verve", "reason": "Som similar ao Radiohead"}
]

CRÍTICO: Retorne APENAS o array JSON válido, sem markdown, sem explicações extras.
`.trim();

/**
 * Filtering and normalization utilities
 */
class RecommendationFilters {
    /**
     * Normalize string for comparison
     */
    static normalizeString(str) {
        if (!str) return '';
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    /**
     * Clean track name for deduplication
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
            'version', 'slowed', 'reverb', 'mix', 'vip', 'live', 'session', 'remaster', 'remastered'];
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
     * Generate a deduplication key for a track
     */
    static getTrackKey(name, artist) {
        return `${this.normalizeString(this.cleanTrackName(name))}::${this.normalizeString(artist)}`;
    }

    /**
     * Apply diversity filter (max tracks per artist)
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
     * Shuffle array
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
 * AI-powered recommendation service: Gemini generates tracks → Last.fm validates → return validated list
 * Best-effort policy: returns whatever valid tracks found (no failure on low count)
 */
export const generateRecommendations = async ({ prompt, limit = 20, context = {}, minTracks = 1, maxRetries = 0 }) => {
    if (!genAI) throw buildError('AI Service not configured', 503);
    if (!prompt || typeof prompt !== 'string') throw buildError('Valid prompt is required', 400);

    prompt = prompt.trim().substring(0, 1000);
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 5), 50);
    minTracks = Math.min(Math.max(parseInt(minTracks, 10) || 1, 1), limit);
    maxRetries = Math.min(Math.max(parseInt(maxRetries, 10) || 0, 0), 3);

    // Build context string from user's top artists if available
    let contextStr = '';
    if (context.topArtists && Array.isArray(context.topArtists) && context.topArtists.length > 0) {
        const artistNames = context.topArtists.slice(0, 15).join(', ');
        contextStr = `\n\nContexto: O usuário gosta destes artistas: ${artistNames}`;
    }

    // Accumulator for validated tracks across retries (dedupe by key)
    const seenKeys = new Set();
    const validatedTracks = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        console.log(`[AI Recs] Attempt ${attempt + 1}/${maxRetries + 1}, have ${validatedTracks.length}/${minTracks} tracks`);

        // STEP 1: Ask Gemini to generate track recommendations
        const geminiTracks = await generateTracksFromGemini(prompt, limit, contextStr, attempt);
        
        if (!geminiTracks || geminiTracks.length === 0) {
            console.warn('[AI Recs] Gemini returned no tracks on attempt', attempt + 1);
            continue;
        }

        console.log(`[AI Recs] Gemini returned ${geminiTracks.length} candidates`);

        // STEP 2: Validate each track against Last.fm (ground truth)
        let newTracksThisAttempt = 0;
        for (const track of geminiTracks) {
            if (!track.name || !track.artist) continue;

            const key = RecommendationFilters.getTrackKey(track.name, track.artist);
            if (seenKeys.has(key)) continue; // Dedupe across attempts

            const validated = await validateTrackWithLastFm(track.name, track.artist);
            if (validated) {
                seenKeys.add(key);
                validatedTracks.push({
                    name: validated.name || track.name,
                    artist: validated.artist || track.artist,
                    reason: track.reason || 'Recomendado com base no seu gosto'
                });
                newTracksThisAttempt++;

                // Stop early if we have enough
                if (validatedTracks.length >= limit) break;
            }
        }

        console.log(`[AI Recs] Validated ${newTracksThisAttempt} new tracks, total: ${validatedTracks.length}`);

        // Stop retrying if we have enough or no progress was made
        if (validatedTracks.length >= minTracks) break;
        if (newTracksThisAttempt === 0) {
            console.log('[AI Recs] No new tracks validated, stopping retries');
            break;
        }
    }

    // STEP 3: Apply diversity filter and shuffle
    let finalTracks = RecommendationFilters.applyDiversityFilter(validatedTracks, 3);
    finalTracks = RecommendationFilters.shuffleArray(finalTracks);
    finalTracks = finalTracks.slice(0, limit);

    console.log(`[AI Recs] Returning ${finalTracks.length} tracks (requested: ${limit}, min: ${minTracks})`);

    // Best-effort: return whatever we have (even if empty)
    return finalTracks;
};

/**
 * Generate track recommendations using Gemini
 */
async function generateTracksFromGemini(prompt, limit, contextStr, attemptNumber) {
    // Adjust instructions slightly on retries to encourage different results
    const retryHint = attemptNumber > 0 
        ? `\n\nIMPORTANTE: Esta é uma nova tentativa. Sugira músicas DIFERENTES das anteriores. Tente artistas menos óbvios mas ainda conhecidos.`
        : '';

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-flash-lite-latest',
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            name: { type: 'STRING' },
                            artist: { type: 'STRING' },
                            reason: { type: 'STRING', nullable: true }
                        },
                        required: ['name', 'artist']
                    }
                },
            },
            contents: [{
                role: 'user',
                parts: [{
                    text: `${TRACK_GENERATION_INSTRUCTIONS}${contextStr}${retryHint}\n\nSolicitação do usuário: "${prompt}"\n\nGere ${limit} recomendações de músicas.`
                }]
            }]
        });

        const candidates = response.response?.candidates || response.candidates;
        if (!candidates || !candidates[0] || !candidates[0].content) {
            return [];
        }

        const text = candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const tracks = JSON.parse(text);
        
        return Array.isArray(tracks) ? tracks : [];
    } catch (error) {
        console.error('[AI Recs] Gemini error:', error.message);
        return [];
    }
}

/**
 * Validate a track exists using Last.fm track.search
 * Returns normalized track info if found, null otherwise
 */
async function validateTrackWithLastFm(trackName, artistName) {
    try {
        const searchQuery = `${trackName} ${artistName}`;
        const results = await lastfmService.searchTrack(searchQuery, 5);
        
        if (!results || results.length === 0) return null;

        // Find a match where artist name is similar
        const normalizedArtist = RecommendationFilters.normalizeString(artistName);
        const normalizedTrack = RecommendationFilters.normalizeString(trackName);

        for (const result of results) {
            const resultArtist = RecommendationFilters.normalizeString(result.artist);
            const resultTrack = RecommendationFilters.normalizeString(result.name);

            // Check if artist matches (contains or is contained)
            const artistMatch = resultArtist.includes(normalizedArtist) || 
                                normalizedArtist.includes(resultArtist) ||
                                similarity(resultArtist, normalizedArtist) > 0.7;

            // Check if track name is similar
            const trackMatch = resultTrack.includes(normalizedTrack) ||
                               normalizedTrack.includes(resultTrack) ||
                               similarity(resultTrack, normalizedTrack) > 0.6;

            if (artistMatch && trackMatch) {
                return {
                    name: result.name,
                    artist: result.artist
                };
            }
        }

        return null;
    } catch (error) {
        // On error, skip this track (don't block the whole process)
        console.warn('[AI Recs] Last.fm validation error:', error.message);
        return null;
    }
}

/**
 * Simple string similarity (Dice coefficient)
 */
function similarity(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    const bigrams1 = new Set();
    const bigrams2 = new Set();
    
    for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
    for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.substring(i, i + 2));
    
    let intersection = 0;
    for (const bigram of bigrams1) {
        if (bigrams2.has(bigram)) intersection++;
    }
    
    return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

// Export other existing AI functions (keep backward compatibility)
export const analyzeTaste = async ({ topArtists = [], topTracks = [] }) => {
    if (!genAI) throw buildError('AI Service not configured', 503);

    const artistsStr = topArtists.slice(0, 15).map((a) => a.name).join(', ');

    const response = await genAI.models.generateContent({
        model: 'gemini-flash-lite-latest',
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
        model: 'gemini-flash-lite-latest',
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
