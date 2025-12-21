import { useState, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import lastfmService from '../services/lastfm';
import { aiAPI } from '../services/api';
import recommendationService from '../services/recommendations';

export function useForYouRecommendations(topArtists, topTracks, selectedPeriod, selectedWeek, useGemini) {
    const lastfmUser = useAuthStore(state => state.lastfmUser);
    const [isRecLoading, setIsRecLoading] = useState(false);
    const [recommendations, setRecommendations] = useState({ tracks: [], artists: [], albums: [] });
    const [musicalAnalysis, setMusicalAnalysis] = useState(null);

    // Build prompt from user's listening data
    const buildPromptFromContext = () => {
        const artistNames = topArtists.slice(0, 15).map(a => a.name).join(', ');
        const trackNames = topTracks.slice(0, 20).map(t => `${t.name} - ${t.artist}`).join(', ');
        
        return `Crie uma seleção de músicas surpreendente considerando os artistas que a pessoa mais ouve (${artistNames}) e as faixas recentes (${trackNames}). Misture novidades com sons parecidos e evite repetir o mesmo artista muitas vezes.`;
    };

    // Lógica Principal - uses recommendationService which handles enrichment & fallback
    const generateRecommendations = async () => {
        if (!topArtists || topArtists.length === 0) return;

        setIsRecLoading(true);
        setRecommendations({ tracks: [], artists: [], albums: [] });

        try {
            if (useGemini) {
                // Use the shared recommendation service (same as GeneratePlaylist)
                const prompt = buildPromptFromContext();
                const result = await recommendationService.getAIRecommendations(
                    prompt, 
                    20, // limit - fewer tracks for ForYou
                    topArtists,
                    { minTracks: 10, maxRetries: 1 } // lighter retry policy
                );
                
                // Set recommendations (service already enriches tracks)
                setRecommendations({
                    tracks: result.tracks || [],
                    artists: result.artists || [],
                    albums: result.albums || []
                });

                // Optionally get musical analysis for UI display
                try {
                    const analysisRes = await aiAPI.analyzeMusicalTaste(topArtists, topTracks);
                    if (analysisRes.success && analysisRes.data) {
                        setMusicalAnalysis(analysisRes.data);
                    }
                } catch (e) {
                    console.warn('[ForYou] Could not get musical analysis:', e);
                }
            } else {
                // Non-AI mode: use classic algorithm
                setMusicalAnalysis(null);
                const result = await recommendationService.getRecommendations('foryou', 30, topArtists);
                setRecommendations({
                    tracks: result.tracks || [],
                    artists: result.artists || [],
                    albums: result.albums || []
                });
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