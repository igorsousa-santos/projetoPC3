import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from "@google/genai";
import lastfmRoutes from './routes/lastfm.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-123';

// AI Setup
const genAI = process.env.VITE_GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY }) : null;

app.use(cors());
app.use(express.json());

// --- Middleware ---
// ... (rest of middleware)

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

// --- Routes ---

app.use('/api/lastfm', lastfmRoutes);

// ... (keep all other routes: health, auth, playlists...)
// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Auth: Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword
            }
        });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
        res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
        res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in' });
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
            model: 'gemini-2.0-flash',
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
                            
                            Provide a brief 3-5 word reason for each recommendation.`
                        }
                    ]
                }
            ]
        });

        const recommendations = JSON.parse(response.data.candidates[0].content.parts[0].text);
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
            model: 'gemini-2.0-flash',
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

        const analysis = JSON.parse(response.data.candidates[0].content.parts[0].text);
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
            model: 'gemini-2.0-flash',
            contents: [{
                role: 'user',
                parts: [{ text: `Write a short, catchy, 1-sentence description for a playlist named "${name}" containing songs like: ${trackList}. Language: Portuguese.` }]
            }]
        });

        res.json({ description: response.data.candidates[0].content.parts[0].text.trim() });
    } catch (error) {
        console.error('Gemini Description Error:', error);
        res.status(500).json({ message: 'Error generating description' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});