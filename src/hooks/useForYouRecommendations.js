import { useState, useEffect } from 'react';
import useAuthStore from '../stores/authStore';
import lastfmService from '../services/lastfm';
import itunesService from '../services/itunes';
import cacheService from '../services/cache';
import { aiAPI } from '../services/api';

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

    // Lógica de Fallback
    const loadFallbackRecommendations = async (artists) => {
        try {
            const trackRecs = [];
            const artistRecs = [];
            
            for (const artist of artists.slice(0, 5)) {
                let similar = [];
                try { similar = await lastfmService.getSimilarArtists(artist.name, 3); } catch (e) { continue; }
                
                for (const simArtist of similar) {
                    if (!artists.find(a => a.name.toLowerCase() === simArtist.name.toLowerCase()) && 
                        !artistRecs.find(a => a.name === simArtist.name)) {
                        const info = await lastfmService.getArtistInfo(simArtist.name);
                        artistRecs.push({
                            name: simArtist.name,
                            image: info?.image?.[4]?.['#text'] || info?.image?.[3]?.['#text'],
                            reason: `Similar a ${artist.name}`
                        });
                    }
                    try {
                        const tracks = await lastfmService.getTopTracksByArtist(simArtist.name, 2);
                        trackRecs.push(...tracks.map(t => ({
                            id: t.mbid || `${t.name}-${simArtist.name}`,
                            name: t.name,
                            artist: simArtist.name,
                            imageUrl: t.image?.[2]?.['#text']
                        })));
                    } catch (e) { }
                }
            }

            const candidateArtists = artistRecs.length > 0 ? artistRecs.map(a => a.name) : artists.map(a => a.name);
            const albumRecs = await fetchAlbumsForDisplay(candidateArtists);

            setRecommendations({ tracks: trackRecs.slice(0, 20), artists: artistRecs.slice(0, 15), albums: albumRecs });
        } catch (error) { console.error('[ForYou] Fallback error:', error); }
    };

    // Lógica Principal
    const generateRecommendations = async () => {
        if (!topArtists || topArtists.length === 0) return;

        setIsRecLoading(true);
        setRecommendations({ tracks: [], artists: [], albums: [] });

        try {
            if (useGemini) {
                // ... MODO IA (Copie sua lógica completa do último passo aqui) ...
                // LEMBRETE: Use fetchAlbumsForDisplay e NÃO chame loadFallbackRecommendations no catch
                // (Vou omitir o bloco grande para não ficar repetitivo, use o código que acabamos de corrigir)
                
                // Exemplo curto:
                const cacheKey = cacheService.generateKey('foryou', lastfmUser, selectedPeriod, selectedWeek?.from || 'none', 'gemini-v7-modular');
                // ... verificação de cache ...
                // ... chamadas API ...
                // ... enriquecimento ...
                // ... fetchAlbumsForDisplay ...
                
            } else {
                setMusicalAnalysis(null);
                await loadFallbackRecommendations(topArtists);
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