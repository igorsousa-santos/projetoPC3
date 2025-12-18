/**
 * Gemini AI Service
 * Handles interactions with Google's Gemini API for music recommendations and analysis.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

class GeminiService {
    constructor() {
        this.apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
        this.model = this.genAI ? this.genAI.getGenerativeModel({ model: "gemini-pro" }) : null;
    }

    isAvailable() {
        return !!this.model;
    }

    async generatePlaylistSuggestions(topArtists, topTracks, limit = 20) {
        if (!this.isAvailable()) {
            console.warn("Gemini API key not found. Skipping AI recommendations.");
            return [];
        }

        try {
            const artistsStr = topArtists.slice(0, 10).map(a => a.name).join(", ");
            const tracksStr = topTracks.slice(0, 10).map(t => `${t.name} by ${t.artist}`).join(", ");

            const prompt = `
                Act as a music expert DJ. Based on the following user listening history, suggest ${limit} song recommendations.
                User's Top Artists: ${artistsStr}
                User's Top Tracks: ${tracksStr}

                Rules:
                1. Recommend songs that fit the user's style but are NOT in the top tracks list.
                2. Include a mix of popular hits and hidden gems.
                3. Provide a brief 3-5 word reason for each recommendation.
                4. Output strictly in JSON format as an array of objects: [{ "name": "Song Name", "artist": "Artist Name", "reason": "Reason" }]
                5. Do not include markdown formatting (like \`\`\`json). Just the raw JSON array.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json|```/g, '').trim();
            
            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini AI Error:", error);
            throw error;
        }
    }

    async analyzeMusicalTaste(topArtists, topTracks) {
        if (!this.isAvailable()) return null;

        try {
            const artistsStr = topArtists.slice(0, 15).map(a => a.name).join(", ");

            const prompt = `
                Analyze the musical taste of a user who listens to these artists: ${artistsStr}.
                
                Provide a JSON response with:
                1. "mainGenres": Array of 3-5 distinct genres/subgenres.
                2. "vibe": A 1-sentence description of their musical vibe.
                3. "era": Dominant decade or era (e.g., "90s", "Modern", "Mix of 70s and 2010s").
                
                Output raw JSON only.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().replace(/```json|```/g, '').trim();

            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini Analysis Error:", error);
            return null;
        }
    }

    async generatePlaylistDescription(playlistName, tracks) {
        if (!this.isAvailable()) return `Playlist gerada automaticamente com ${tracks.length} músicas.`;

        try {
            const trackList = tracks.slice(0, 5).map(t => `${t.name} - ${t.artist}`).join(", ");
            const prompt = `Write a short, catchy, 1-sentence description for a playlist named "${playlistName}" containing songs like: ${trackList}. Language: Portuguese.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("Gemini Description Error:", error);
            return `Playlist com músicas como ${tracks[0]?.name || 'várias faixas legais'}.`;
        }
    }
}

export default new GeminiService();
