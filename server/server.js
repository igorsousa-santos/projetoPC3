import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from "@google/genai";
import lastfmRoutes from './routes/lastfm.js';
import { md5 } from './utils/crypto.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-123';
const LASTFM_API_KEY = process.env.VITE_LASTFM_API_KEY;
const LASTFM_SHARED_SECRET = process.env.VITE_LASTFM_SHARED_SECRET || '';
const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

// AI Setup
const genAI = process.env.VITE_GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY }) : null;

app.use(cors());
app.use(express.json());


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const signParams = (params) => {
    const keys = Object.keys(params).sort();
    let stringToSign = '';

    keys.forEach(key => {
        if (key !== 'format' && key !== 'callback') {
            stringToSign += key + params[key];
        }
    });

    stringToSign += LASTFM_SHARED_SECRET;
    return md5(stringToSign);
};

// --- Routes ---

app.use('/api/lastfm', lastfmRoutes);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Auth: Last.fm Login (Primary)
app.post('/api/auth/lastfm-login', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: 'Token is required' });
        }

        // 1. Exchange token for session with Last.fm
        const params = {
            api_key: LASTFM_API_KEY,
            method: 'auth.getSession',
            token: token
        };

        const api_sig = signParams(params);
        
        const url = new URL(LASTFM_API_BASE);
        Object.entries({ ...params, api_sig, format: 'json' }).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error || !data.session) {
            console.error('Last.fm Session Error:', data);
            return res.status(401).json({ message: 'Failed to authenticate with Last.fm' });
        }

        const { name: username, key: sessionKey } = data.session;
        
        // Note: auth.getSession doesn't return image usually. We can fetch it later or leave null.
        const image = data.session.image; 

        // 2. Find or Create User
        let user = await prisma.user.findUnique({
            where: { lastfmUsername: username }
        });

        if (!user) {
            // Check if user exists by email (unlikely with just Last.fm, but good practice) or spotifyId if we had it
            // For now, simple creation
            user = await prisma.user.create({
                data: {
                    lastfmUsername: username,
                    name: username, // Default to username
                    image: image && Array.isArray(image) ? image[image.length - 1]['#text'] : null 
                }
            });
        } else {
             // Update session? currently not storing session key in DB, maybe we should?
             // For now, just logging them in.
        }

        // 3. Issue App JWT
        const jwtToken = jwt.sign(
            { id: user.id, lastfmUsername: user.lastfmUsername, spotifyId: user.spotifyId },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return user info and the Last.fm session key (so frontend can still use it for scrobbling if needed directly, though ideally backend proxies it)
        // We'll return the session key so the frontend can store it in localStorage as before for legacy compatibility/hybrid approach
        res.json({ 
            user: { 
                id: user.id, 
                name: user.name, 
                lastfmUsername: user.lastfmUsername,
                spotifyId: user.spotifyId,
                image: user.image 
            }, 
            token: jwtToken,
            lastfmSessionKey: sessionKey 
        });

    } catch (error) {
        console.error('Last.fm Auth Error:', error);
        res.status(500).json({ message: 'Error during authentication' });
    }
});

// Link Spotify Account (Authenticated Users Only)
app.post('/api/auth/spotify', authenticateToken, async (req, res) => {
    try {
        const { accessToken } = req.body;
        
        if (!accessToken) {
            return res.status(400).json({ message: 'Access token required' });
        }

        // 1. Verify token with Spotify
        const spotifyResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!spotifyResponse.ok) {
            return res.status(401).json({ message: 'Invalid Spotify token' });
        }

        const spotifyUser = await spotifyResponse.json();
        
        // 2. Check if this Spotify ID is already used by another user
        const existingUser = await prisma.user.findUnique({
            where: { spotifyId: spotifyUser.id }
        });

        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(409).json({ message: 'This Spotify account is already connected to another user.' });
        }

        // 3. Update Current User
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                spotifyId: spotifyUser.id,
                // We don't overwrite name/image from Spotify anymore, Last.fm is source of truth or user preference
            }
        });

        res.json({ 
            success: true,
            user: { 
                id: updatedUser.id, 
                name: updatedUser.name, 
                email: updatedUser.email, 
                image: updatedUser.image,
                lastfmUsername: updatedUser.lastfmUsername,
                spotifyId: updatedUser.spotifyId 
            }
        });

    } catch (error) {
        console.error('Spotify Link Error:', error);
        res.status(500).json({ message: 'Error linking Spotify account' });
    }
});

// Get Current User
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ id: user.id, name: user.name, email: user.email });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

// Playlists: Get All (for current user)
app.get('/api/playlists', authenticateToken, async (req, res) => {
    try {
        const playlists = await prisma.playlist.findMany({
            where: { userId: req.user.id }
        });
        
        // Parse tracks JSON
        const parsedPlaylists = playlists.map(p => ({
            ...p,
            tracks: JSON.parse(p.tracks || '[]')
        }));
        
        res.json(parsedPlaylists);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching playlists' });
    }
});

// Playlists: Create
app.post('/api/playlists', authenticateToken, async (req, res) => {
    try {
        const { name, description, tracks, isPublic } = req.body;
        
        const playlist = await prisma.playlist.create({
            data: {
                name,
                description,
                tracks: JSON.stringify(tracks || []),
                isPublic: !!isPublic,
                userId: req.user.id
            }
        });

        res.json({ ...playlist, tracks: tracks || [] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating playlist' });
    }
});

// Playlists: Update
app.put('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Ensure tracks are stringified if present
        if (updates.tracks) {
            updates.tracks = JSON.stringify(updates.tracks);
        }

        const playlist = await prisma.playlist.update({
            where: { id: parseInt(id), userId: req.user.id },
            data: updates
        });

        res.json({ ...playlist, tracks: JSON.parse(playlist.tracks) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating playlist' });
    }
});

// Playlists: Delete
app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.playlist.delete({
            where: { id: parseInt(id), userId: req.user.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting playlist' });
    }
});

// --- AI Routes ---

app.post('/api/recommendations/generate', authenticateToken, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ message: 'AI Service not configured' });
    }

    try {
        let { prompt, limit = 20, context = {} } = req.body;

        // --- Input Sanitization & Validation ---
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ message: 'Valid prompt is required' });
        }

        // 1. Trim and limit length (max 500 chars for prompt to prevent abuse)
        prompt = prompt.trim().substring(0, 500);

        // 2. Limit the number of songs (max 50)
        limit = Math.min(Math.max(parseInt(limit) || 20, 5), 50);

        // 3. Sanitize Context (Limit array sizes to 5 items each to control token usage)
        const { genres = [], albums = [], recentSongs = [] } = context;
        const safeGenres = Array.isArray(genres) ? genres.slice(0, 5).map(s => String(s).substring(0, 50)) : [];
        const safeAlbums = Array.isArray(albums) ? albums.slice(0, 5).map(s => String(s).substring(0, 100)) : [];
        const safeRecent = Array.isArray(recentSongs) ? recentSongs.slice(0, 5).map(s => String(s).substring(0, 100)) : [];

        let contextPrompt = '';
        if (safeGenres.length > 0 || safeAlbums.length > 0 || safeRecent.length > 0) {
            contextPrompt = `\n\nUser Context (Musical History):
            ${safeGenres.length > 0 ? `- Top Genres: ${safeGenres.join(', ')}` : ''}
            ${safeAlbums.length > 0 ? `- Recent/Top Albums: ${safeAlbums.join(', ')}` : ''}
            ${safeRecent.length > 0 ? `- Recently Played: ${safeRecent.join(', ')}` : ''}
            
            Use this context to influence the vibe of the recommendations while strictly following the user's prompt.`;
        }

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

                                    reason: { type: 'STRING' }

                                }

                            }

                        }

                    },

                                contents: [

                                    {

                                        role: 'user',

                                        parts: [

                                            {

                                                text: `Act as a music expert DJ. Based on the following prompt, suggest ${limit} song recommendations: "${prompt}".${contextPrompt}

                                                

                                                                            Rules:

                                                

                                                                            1. For the 'reason' field, describe the song's actual sound, mood, or instrumentals (e.g., "Sintetizadores sonhadores", "Riffs de guitarra agressivos", "Ritmo funk animado").

                                                

                                                                            2. Do NOT say "Because you liked..." or "Similar to...". Focus on the music itself.

                                                

                                                                            3. Keep the reason under 6 words.

                                                

                                                                            4. The reason MUST be in Portuguese.`

                                            }

                                        ]

                                    }

                                ]

                });

        

                const candidates = response.response?.candidates || response.candidates;

                

                if (!candidates || !candidates[0] || !candidates[0].content) {

                     console.error('Gemini Invalid Response (Recs):', JSON.stringify(response, null, 2));

                     throw new Error('Invalid response from Gemini API');

                }

        

                const text = candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();

                const recommendations = JSON.parse(text);

                

                res.json(recommendations);

            } catch (error) {

                console.error('Gemini AI Error:', error);

                res.status(500).json({ message: 'Error generating recommendations' });

            }

        });

app.post('/api/ai/analyze', authenticateToken, async (req, res) => {
    if (!genAI) return res.status(503).json({ message: 'AI Service not configured' });

    try {
        const { topArtists = [], topTracks = [] } = req.body;
        const artistsStr = topArtists.slice(0, 15).map(a => a.name).join(", ");

        const response = await genAI.models.generateContent({
            model: 'gemini-flash-lite-latest',
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        mainGenres: { type: 'ARRAY', items: { type: 'STRING' } },
                        vibe: { type: 'STRING' },
                        era: { type: 'STRING' }
                    }
                }
            },
            contents: [{
                role: 'user',
                parts: [{ text: `Analyze the musical taste of a user who listens to these artists: ${artistsStr}.` }]
            }]
        });

        // Debug logging
        // console.log('Gemini Raw Response:', JSON.stringify(response, null, 2));

        // Handle potential different response structures or missing candidates
        const candidates = response.response?.candidates || response.candidates;

        if (!candidates || !candidates[0] || !candidates[0].content) {
            console.error('Gemini Invalid Response:', JSON.stringify(response, null, 2));
            throw new Error('Invalid response from Gemini API');
        }

        let text = candidates[0].content.parts[0].text;
        
        // Sometimes structured output includes markdown blocks even if we asked not to
        text = text.replace(/```json|```/g, '').trim();

        const analysis = JSON.parse(text);
        res.json(analysis);
    } catch (error) {
        console.error('Gemini Analysis Error:', error);
        res.status(500).json({ message: 'Error analyzing musical taste' });
    }
});

app.post('/api/ai/describe-playlist', authenticateToken, async (req, res) => {
    if (!genAI) return res.status(503).json({ message: 'AI Service not configured' });

    try {
        const { name, tracks = [] } = req.body;
        const trackList = tracks.slice(0, 5).map(t => `${t.name} - ${t.artist}`).join(", ");

        const response = await genAI.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [{
                role: 'user',
                parts: [{ text: `Write a short, catchy, 1-sentence description for a playlist named "${name}" containing songs like: ${trackList}. Language: Portuguese.` }]
            }]
        });

        const candidates = response.response?.candidates || response.candidates;

        if (!candidates || !candidates[0] || !candidates[0].content) {
            throw new Error('Invalid response from Gemini API');
        }

        res.json({ description: candidates[0].content.parts[0].text.trim() });
    } catch (error) {
        console.error('Gemini Description Error:', error);
        res.status(500).json({ message: 'Error generating description' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});