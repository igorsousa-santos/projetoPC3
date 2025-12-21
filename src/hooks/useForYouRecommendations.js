import { useState, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import lastfmService from '../services/lastfm';
import itunesService from '../services/itunes';
import cacheService from '../services/cache';
import { aiAPI } from '../services/api';
import recommendationService from '../services/recommendations';

// Helper function fora do hook para manter limpo
const fetchAlbumsForDisplay = async (artistNamesSource) => {
    const albumsResult = [];
    const uniqueArtists = [...new Set(artistNamesSource)].filter(Boolean); 
    const selectedArtists = uniqueArtists.sort(() => 0.5 - Math.random()).slice(0, 8);

    for (const artistName of selectedArtists) {
        if (albumsResult.length >= 8) break;
        try {
            const topAlbums = await lastfmService.getTopAlbumsByArtist(artistName, 2);
            if (topAlbums && topAlbums.length > 0) {
                let targetAlbum = topAlbums.find(a => a.image?.[3]?.['#text'] && !a.image?.[3]?.['#text'].includes('2a96cbd8')) || topAlbums[0];
                let img = targetAlbum.image?.[3]?.['#text'];
                
                if (!img || img.includes('2a96cbd8')) {
                    try {
                        const itunesData = await itunesService.searchTrack(targetAlbum.name, artistName);
                        if (itunesData?.imageUrl) img = itunesData.imageUrl;
                    } catch (e) {}
                }

                if (!albumsResult.find(a => a.name === targetAlbum.name)) {
                    albumsResult.push({ name: targetAlbum.name, artist: artistName, image: img, reason: 'Popular de ' + artistName });
                }
            }
        } catch (e) { console.warn(`Erro álbum ${artistName}`, e); }
    }
    return albumsResult;
};

export function useForYouRecommendations(topArtists, topTracks, selectedPeriod, selectedWeek, useGemini) {
    const lastfmUser = useAuthStore(state => state.lastfmUser);
    const [isRecLoading, setIsRecLoading] = useState(false);
    const [recommendations, setRecommendations] = useState({ tracks: [], artists: [], albums: [] });
    const [musicalAnalysis, setMusicalAnalysis] = useState(null);

    // Lógica Principal
    const generateRecommendations = async () => {
        if (!topArtists || topArtists.length === 0) return;

        setIsRecLoading(true);
        setRecommendations({ tracks: [], artists: [], albums: [] });

        try {
            const geminiEnabled = useGemini && Boolean(import.meta.env.VITE_GEMINI_API_KEY);
            const safeTopTracks = Array.isArray(topTracks) ? topTracks : [];

            if (geminiEnabled) {
                const cacheKey = cacheService.generateKey(
                    'foryou',
                    lastfmUser || 'local',
                    selectedPeriod,
                    selectedWeek?.from || 'none',
                    'gemini-v1'
                );

                const cached = cacheService.get(cacheKey);
                if (cached) {
                    setRecommendations(cached.recommendations || { tracks: [], artists: [], albums: [] });
                    setMusicalAnalysis(cached.musicalAnalysis || null);
                    setIsRecLoading(false);
                    return;
                }

                const topArtistNames = topArtists.slice(0, 15).map(a => a.name).filter(Boolean);
                const topTrackPairs = safeTopTracks.slice(0, 20).map(t => `${t.name} - ${t.artist}`).join(', ');

                const prompt = `Crie uma seleção de músicas surpreendente considerando os artistas que a pessoa mais ouve (${topArtistNames.join(', ')}) e as faixas recentes (${topTrackPairs}). Misture novidades com sons parecidos e evite repetir o mesmo artista muitas vezes.`;

                let analysis = null;
                try {
                    const analysisRes = await aiAPI.analyzeMusicalTaste(topArtists, safeTopTracks.slice(0, 30));
                    if (analysisRes.success) {
                        analysis = analysisRes.data;
                        setMusicalAnalysis(analysisRes.data);
                    } else {
                        setMusicalAnalysis(null);
                    }
                } catch (e) {
                    console.warn('[ForYou] analyze taste failed', e);
                    setMusicalAnalysis(null);
                }

                const aiResult = await recommendationService.getAIRecommendations(prompt, 30, topArtists);

                const albumRecs = aiResult.albums?.length > 0
                    ? aiResult.albums
                    : await fetchAlbumsForDisplay(topArtistNames);

                const finalRecs = {
                    tracks: aiResult.tracks || [],
                    artists: aiResult.artists || [],
                    albums: albumRecs || []
                };

                if (finalRecs.tracks.length > 0) {
                    setRecommendations(finalRecs);
                    cacheService.set(cacheKey, { recommendations: finalRecs, musicalAnalysis: analysis }, 10 * 60 * 1000);
                } else {
                    setRecommendations({ tracks: [], artists: [], albums: [] });
                }
            } else {
                setMusicalAnalysis(null);
                setRecommendations({ tracks: [], artists: [], albums: [] });
            }
        } catch (error) {
            console.error('[ForYou] Error:', error);
            setRecommendations({ tracks: [], artists: [], albums: [] });
        } finally {
            setIsRecLoading(false);
        }
    };

    useEffect(() => {
        if (topArtists.length > 0) {
            generateRecommendations();
        }
    }, [useGemini, topArtists]);

    return { isRecLoading, recommendations, musicalAnalysis, generateRecommendations };
}