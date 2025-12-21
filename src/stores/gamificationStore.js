import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createMapSetJSONStorage } from './persistStorage';

// Badge definitions
const BADGES = [
    { id: 'first_search', name: 'Primeiro Passo', icon: 'music-note', description: 'Fez sua primeira busca', condition: (stats) => stats.searchesCount >= 1 },
    { id: 'first_playlist', name: 'Curador', icon: 'list-checks', description: 'Criou sua primeira playlist', condition: (stats) => stats.playlistsCreated >= 1 },
    { id: 'explorer', name: 'Explorador', icon: 'compass', description: 'Buscou 10 artistas diferentes', condition: (stats) => stats.artistsSearched >= 10 },
    { id: 'collector', name: 'Colecionador', icon: 'books', description: 'Criou 5 playlists', condition: (stats) => stats.playlistsCreated >= 5 },
    { id: 'discoverer', name: 'Descobridor', icon: 'gem', description: 'Descobriu 50 músicas', condition: (stats) => stats.tracksDiscovered >= 50 },
    { id: 'connected', name: 'Conectado', icon: 'spotify-logo', description: 'Conectou o Spotify', condition: (stats) => stats.spotifyConnected },
    { id: 'diverse', name: 'Diverso', icon: 'palette', description: 'Buscou 5 gêneros diferentes', condition: (stats) => stats.genresSearched >= 5 },
    { id: 'audiophile', name: 'Audiófilo', icon: 'trophy', description: 'Descobriu 100 músicas', condition: (stats) => stats.tracksDiscovered >= 100 },
    { id: 'master_curator', name: 'Mestre Curador', icon: 'star', description: 'Criou 10 playlists', condition: (stats) => stats.playlistsCreated >= 10 },
    { id: 'legend', name: 'Lenda Musical', icon: 'crown', description: 'Alcançou o nível 6', condition: (stats, level) => level >= 6 }
];

// Level thresholds
const LEVELS = [
    { level: 1, name: 'Novato', minPoints: 0, maxPoints: 99, color: '#9CA3AF' },
    { level: 2, name: 'Entusiasta', minPoints: 100, maxPoints: 299, color: '#3B82F6' },
    { level: 3, name: 'Conhecedor', minPoints: 300, maxPoints: 599, color: '#8B5CF6' },
    { level: 4, name: 'Expert', minPoints: 600, maxPoints: 999, color: '#EC4899' },
    { level: 5, name: 'Mestre', minPoints: 1000, maxPoints: 1499, color: '#F59E0B' },
    { level: 6, name: 'Lenda Musical', minPoints: 1500, maxPoints: Infinity, color: '#FBBF24' }
];

const useGamificationStore = create(
    persist(
        (set, get) => ({
            // State
            points: 0,
            level: 1,
            unlockedBadges: [],
            stats: {
                searchesCount: 0,
                playlistsCreated: 0,
                tracksDiscovered: 0,
                artistsSearched: 0,
                genresSearched: 0,
                spotifyConnected: false,
                searchedArtists: new Set(),
                searchedGenres: new Set()
            },

            // Add points
            addPoints: (amount, reason) => {
                const currentPoints = get().points;
                const newPoints = currentPoints + amount;

                set({ points: newPoints });

                // Check for level up
                const newLevel = get().calculateLevel(newPoints);
                if (newLevel > get().level) {
                    set({ level: newLevel });
                }

                // Check for new badges
                get().checkAndUnlockBadges();

                return { newPoints, newLevel };
            },

            // Calculate level based on points
            calculateLevel: (points) => {
                const levelInfo = LEVELS.find(l => points >= l.minPoints && points <= l.maxPoints);
                return levelInfo ? levelInfo.level : 1;
            },

            // Get current level info
            getLevelInfo: () => {
                const currentLevel = get().level;
                const currentPoints = get().points;
                const levelData = LEVELS.find(l => l.level === currentLevel);

                const nextLevel = LEVELS.find(l => l.level === currentLevel + 1);
                const pointsToNextLevel = nextLevel ? nextLevel.minPoints - currentPoints : 0;
                const progressPercentage = nextLevel
                    ? ((currentPoints - levelData.minPoints) / (nextLevel.minPoints - levelData.minPoints)) * 100
                    : 100;

                return {
                    level: currentLevel,
                    name: levelData.name,
                    color: levelData.color,
                    currentPoints,
                    minPoints: levelData.minPoints,
                    maxPoints: levelData.maxPoints,
                    nextLevel: nextLevel?.level,
                    nextLevelName: nextLevel?.name,
                    pointsToNextLevel,
                    progressPercentage
                };
            },

            // Check and unlock badges
            checkAndUnlockBadges: () => {
                const { stats, level, unlockedBadges } = get();
                const newBadges = [];

                BADGES.forEach(badge => {
                    // Skip if already unlocked
                    if (unlockedBadges.includes(badge.id)) return;

                    // Check condition
                    if (badge.condition(stats, level)) {
                        newBadges.push(badge.id);
                    }
                });

                if (newBadges.length > 0) {
                    set({ unlockedBadges: [...unlockedBadges, ...newBadges] });
                    return newBadges.map(id => BADGES.find(b => b.id === id));
                }

                return [];
            },

            // Get all badges with unlock status
            getAllBadges: () => {
                const { unlockedBadges } = get();
                return BADGES.map(badge => ({
                    ...badge,
                    unlocked: unlockedBadges.includes(badge.id)
                }));
            },

            // Track actions
            trackSearch: (query) => {
                const stats = get().stats;
                set({
                    stats: {
                        ...stats,
                        searchesCount: stats.searchesCount + 1
                    }
                });
                get().addPoints(10, 'Busca realizada');
            },

            trackPlaylistCreated: () => {
                const stats = get().stats;
                set({
                    stats: {
                        ...stats,
                        playlistsCreated: stats.playlistsCreated + 1
                    }
                });
                get().addPoints(50, 'Playlist criada');
            },

            trackTracksDiscovered: (count) => {
                const stats = get().stats;
                set({
                    stats: {
                        ...stats,
                        tracksDiscovered: stats.tracksDiscovered + count
                    }
                });
                get().addPoints(count * 5, count === 1 ? 'Nova música descoberta' : `${count} músicas descobertas`);
            },

            trackListeningTime: (durationSeconds) => {
                // Reward 1 point for every 30 seconds of music
                const points = Math.floor(durationSeconds / 30);
                if (points > 0) {
                    get().addPoints(points, 'Tempo de audição');
                }
            },

            trackArtistSearched: (artistName) => {
                const stats = get().stats;
                const searchedArtists = new Set(stats.searchedArtists);

                if (!searchedArtists.has(artistName.toLowerCase())) {
                    searchedArtists.add(artistName.toLowerCase());
                    set({
                        stats: {
                            ...stats,
                            searchedArtists,
                            artistsSearched: searchedArtists.size
                        }
                    });
                }
            },

            trackGenreSearched: (genre) => {
                const stats = get().stats;
                const searchedGenres = new Set(stats.searchedGenres);

                if (!searchedGenres.has(genre.toLowerCase())) {
                    searchedGenres.add(genre.toLowerCase());
                    set({
                        stats: {
                            ...stats,
                            searchedGenres,
                            genresSearched: searchedGenres.size
                        }
                    });
                }
            },

            trackSpotifyConnected: () => {
                const stats = get().stats;
                if (!stats.spotifyConnected) {
                    set({
                        stats: {
                            ...stats,
                            spotifyConnected: true
                        }
                    });
                    get().addPoints(100, 'Spotify conectado');
                }
            },

            // Reset (for testing)
            reset: () => {
                set({
                    points: 0,
                    level: 1,
                    unlockedBadges: [],
                    stats: {
                        searchesCount: 0,
                        playlistsCreated: 0,
                        tracksDiscovered: 0,
                        artistsSearched: 0,
                        genresSearched: 0,
                        spotifyConnected: false,
                        searchedArtists: new Set(),
                        searchedGenres: new Set()
                    }
                });
            }
        }),
        {
            name: 'music-horizon-gamification',
            version: 2,
            storage: createMapSetJSONStorage(() => localStorage),

            // Ensure Sets exist even if old localStorage had corrupted values.
            merge: (persistedState, currentState) => {
                const merged = { ...currentState, ...persistedState };
                const persistedStats = persistedState?.stats || {};
                const stats = { ...currentState.stats, ...persistedStats };

                if (!(stats.searchedArtists instanceof Set)) {
                    stats.searchedArtists = new Set(Array.isArray(stats.searchedArtists) ? stats.searchedArtists : []);
                }
                if (!(stats.searchedGenres instanceof Set)) {
                    stats.searchedGenres = new Set(Array.isArray(stats.searchedGenres) ? stats.searchedGenres : []);
                }

                merged.stats = stats;
                return merged;
            },
        }
    )
);

export default useGamificationStore;
export { BADGES, LEVELS };
