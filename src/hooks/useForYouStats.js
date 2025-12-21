import { useState, useEffect } from 'react';
import useAuthStore from '..//stores/authStore';
import useListeningHistoryStore from '..//stores/listeningHistoryStore';
import lastfmService from '../services/lastfm';
import itunesService from '../services/itunes';

export function useForYouStats(selectedPeriod, selectedWeek) {
    const lastfmUser = useAuthStore(state => state.lastfmUser);
    const hasHistory = useListeningHistoryStore(state => state.hasHistory());
    const getTopArtistsLocal = useListeningHistoryStore(state => state.getTopArtists);
    const getRecentTracksLocal = useListeningHistoryStore(state => state.getRecentTracks);
    const getListeningStats = useListeningHistoryStore(state => state.getListeningStats);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [topTracks, setTopTracks] = useState([]);
    const [topArtists, setTopArtists] = useState([]);
    const [topAlbums, setTopAlbums] = useState([]);
    const [recentTracks, setRecentTracks] = useState([]);
    const [stats, setStats] = useState({ totalScrobbles: 0, topArtist: '-', totalListeningTime: 0 });
    const [userInfo, setUserInfo] = useState(null);

    const loadStats = async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (lastfmUser) {
                console.log('[ForYou] Loading STATS for:', lastfmUser);
                const info = await lastfmService.getUserInfo(lastfmUser);
                setUserInfo(info);

                let artistsData, tracksData, albumsData;

                if (selectedWeek) {
                    [artistsData, tracksData, albumsData] = await Promise.all([
                        lastfmService.getWeeklyArtistChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                        lastfmService.getWeeklyTrackChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                        lastfmService.getWeeklyAlbumChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                    ]);
                } else {
                    [artistsData, tracksData, albumsData] = await Promise.all([
                        lastfmService.getTopArtists(lastfmUser, 20, selectedPeriod),
                        lastfmService.getTopTracks(lastfmUser, 20, selectedPeriod),
                        lastfmService.getTopAlbums(lastfmUser, 20, selectedPeriod),
                    ]);
                }

                const recentData = await lastfmService.getRecentTracks(lastfmUser, 10);

                // Process Artists (simplificado para brevidade - mantenha sua lógica de imagem aqui)
                const processedArtists = await Promise.all(artistsData.slice(0, 15).map(async (a) => {
                     // ... SUA LÓGICA DE IMAGEM DE ARTISTA AQUI ...
                     let image = a.image?.[3]?.['#text']; // Exemplo simplificado
                     return { name: a.name, playcount: parseInt(a.playcount) || 0, image, mbid: a.mbid };
                }));
                setTopArtists(processedArtists);

                // Process Tracks
                const processedTracks = await Promise.all(tracksData.slice(0, 20).map(async (t) => {
                    // ... SUA LÓGICA DE IMAGEM DE TRACK AQUI ...
                    return { name: t.name, artist: t.artist?.name || t.artist, playcount: parseInt(t.playcount), image: t.image };
                }));
                setTopTracks(processedTracks);

                // Process Albums
                const processedAlbums = await Promise.all(albumsData.slice(0, 15).map(async (a) => {
                    // ... SUA LÓGICA DE IMAGEM DE ÁLBUM AQUI ...
                    return { name: a.name, artist: a.artist?.name || a.artist, playcount: parseInt(a.playcount), image: a.image?.[3]?.['#text'] };
                }));
                setTopAlbums(processedAlbums);

                // Process Recent
                const processedRecent = recentData.map(t => ({
                    id: t.mbid || t.name, name: t.name, artist: t.artist?.['#text'] || t.artist?.name, imageUrl: t.image?.[2]?.['#text']
                }));
                setRecentTracks(processedRecent);

                // Stats
                const periodScrobbles = tracksData.reduce((sum, t) => sum + (parseInt(t.playcount) || 0), 0);
                setStats({
                    totalScrobbles: periodScrobbles,
                    topArtist: processedArtists[0]?.name || '-',
                    totalListeningTime: Math.round(periodScrobbles * 3.5 * 60)
                });

            } else if (hasHistory) {
                const localArtists = getTopArtistsLocal(10);
                const localRecent = getRecentTracksLocal(10);
                const localStats = getListeningStats();

                setTopArtists(localArtists.map(a => ({ name: a.artist, playcount: a.count, image: null })));
                setRecentTracks(localRecent);
                setStats(localStats);
                setTopTracks([]);
                setTopAlbums([]);
            }
        } catch (err) {
            console.error('[ForYou] Error:', err);
            setError(err.message || 'Erro ao carregar estatísticas');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (lastfmUser || hasHistory) {
            loadStats();
        }
    }, [lastfmUser, hasHistory, selectedPeriod, selectedWeek]);

    return { isLoading, error, topTracks, topArtists, topAlbums, recentTracks, stats, userInfo, loadStats };
}