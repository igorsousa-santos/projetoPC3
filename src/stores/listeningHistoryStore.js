import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createMapSetJSONStorage } from './persistStorage';

import spotifyService from '../services/spotify';
import lastfmService from '../services/lastfm';
import useAuthStore from './authStore';
import useGamificationStore from './gamificationStore';

const useListeningHistoryStore = create(
    persist(
        (set, get) => ({
            // State
            plays: [], // Array of play objects: { track, timestamp, duration }
            stats: {
                topArtists: new Map(), // artist -> play count
                topGenres: new Map(), // genre -> play count (will need to fetch from API)
                totalListeningTime: 0, // in seconds
                uniqueTracks: new Set(),
            },

            // Sync History (Prioritize Last.fm)
            syncHistory: async () => {
                const { user, isAuthenticated } = useAuthStore.getState();
                
                if (isAuthenticated && user?.lastfmUsername) {
                    return get().syncWithLastFM(user.lastfmUsername);
                } else {
                    return get().syncWithSpotify();
                }
            },

            // Sync with Last.fm Recent Tracks
            syncWithLastFM: async (username) => {
                if (!username) return;
                
                try {
                    const recent = await lastfmService.getRecentTracks(username, 50);
                    const currentPlays = get().plays;
                    const newPlays = [];

                    for (const item of recent) {
                        // Skip "now playing" track which has no date (or handle it differently)
                        if (item['@attr']?.nowplaying) continue;

                        const playTime = parseInt(item.date.uts) * 1000;
                        
                        // Check if we already have this play (timestamp match)
                        const exists = currentPlays.some(p => Math.abs(new Date(p.timestamp).getTime() - playTime) < 1000);

                        if (!exists) {
                            newPlays.push({
                                track: {
                                    id: item.mbid || `${item.name}-${item.artist['#text']}`, // Fallback ID
                                    name: item.name,
                                    artist: item.artist['#text'],
                                    album: item.album['#text'],
                                    image: item.image[2]['#text'], // Medium/Large image
                                },
                                timestamp: new Date(playTime).toISOString(),
                                duration: 0 // Last.fm doesn't always give duration in recent tracks
                            });
                        }
                    }

                    if (newPlays.length > 0) {
                        get().mergePlays(newPlays);
                        console.log(`[History] Synced ${newPlays.length} new plays from Last.fm.`);
                    }

                } catch (e) {
                    console.error('Error syncing history with Last.fm:', e);
                }
            },

            // Sync with Spotify Recently Played
            syncWithSpotify: async () => {
                if (!spotifyService.isConnected()) return;

                try {
                    const recent = await spotifyService.getRecentlyPlayed(50);
                    const currentPlays = get().plays;
                    const newPlays = [];

                    // Spotify returns { track, played_at, context }
                    for (const item of recent) {
                        const playTime = new Date(item.played_at).getTime();
                        
                        // Check if we already have this play (timestamp match)
                        const exists = currentPlays.some(p => Math.abs(new Date(p.timestamp).getTime() - playTime) < 1000); // 1s tolerance

                        if (!exists) {
                            newPlays.push({
                                track: {
                                    id: item.track.id,
                                    name: item.track.name,
                                    artist: item.track.artists[0].name,
                                    album: item.track.album.name,
                                    image: item.track.album.images[0]?.url,
                                },
                                timestamp: item.played_at,
                                duration: item.track.duration_ms / 1000
                            });
                        }
                    }

                    if (newPlays.length > 0) {
                        get().mergePlays(newPlays);
                        console.log(`[History] Synced ${newPlays.length} new plays from Spotify.`);
                    }
                } catch (e) {
                    console.error('Error syncing history with Spotify:', e);
                }
            },

            // Helper to merge and sort plays
            mergePlays: (newPlays) => {
                const currentPlays = get().plays;
                const merged = [...newPlays, ...currentPlays]
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 100);

                // Recalculate Stats
                const topArtists = new Map();
                const uniqueTracks = new Set();
                let totalTime = 0;

                merged.forEach(play => {
                    const artist = play.track.artist;
                    topArtists.set(artist, (topArtists.get(artist) || 0) + 1);
                    uniqueTracks.add(play.track.id);
                    totalTime += (play.duration || 0);
                });

                // Gamification: Check for new discoveries
                const previousUniqueCount = get().stats.uniqueTracks.size;
                const newUniqueCount = uniqueTracks.size;
                if (newUniqueCount > previousUniqueCount) {
                    useGamificationStore.getState().trackTracksDiscovered(newUniqueCount - previousUniqueCount);
                }

                set({
                    plays: merged,
                    stats: {
                        ...get().stats,
                        topArtists,
                        totalListeningTime: totalTime,
                        uniqueTracks,
                    }
                });
            },

            // Track a play event
            trackPlay: (track, duration = 0) => {
                const plays = get().plays;
                const stats = get().stats;

                const playEvent = {
                    track: {
                        id: track.id,
                        name: track.name,
                        artist: track.artist,
                        album: track.album,
                        image: track.image,
                    },
                    timestamp: new Date().toISOString(),
                    duration,
                };

                // Update plays (keep last 100)
                const updatedPlays = [playEvent, ...plays].slice(0, 100);

                // Update top artists
                const topArtists = new Map(stats.topArtists);
                const artistCount = topArtists.get(track.artist) || 0;
                topArtists.set(track.artist, artistCount + 1);

                // Update unique tracks & Gamification
                const uniqueTracks = new Set(stats.uniqueTracks);
                if (!uniqueTracks.has(track.id)) {
                    uniqueTracks.add(track.id);
                    useGamificationStore.getState().trackTracksDiscovered(1);
                }
                
                // Track listening time gamification
                if (duration > 0) {
                    useGamificationStore.getState().trackListeningTime(duration);
                } else {
                    // Fallback for tracks without duration
                    useGamificationStore.getState().addPoints(2, 'Música ouvida');
                }

                // Update total listening time
                const totalListeningTime = stats.totalListeningTime + duration;

                set({
                    plays: updatedPlays,
                    stats: {
                        ...stats,
                        topArtists,
                        uniqueTracks,
                        totalListeningTime,
                    },
                });
            },

            // Get top artists
            getTopArtists: (limit = 5) => {
                const topArtists = get().stats.topArtists;
                if (!(topArtists instanceof Map)) return [];
                return Array.from(topArtists.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, limit)
                    .map(([artist, count]) => ({ artist, count }));
            },

            // Get recent tracks
            getRecentTracks: (limit = 20) => {
                return get().plays.slice(0, limit).map(play => play.track);
            },

            // Get listening stats
            getListeningStats: () => {
                const stats = get().stats;
                const topArtists = get().getTopArtists(1);

                return {
                    totalTracks: stats.uniqueTracks.size,
                    totalPlays: get().plays.length,
                    totalListeningTime: stats.totalListeningTime,
                    topArtist: topArtists[0]?.artist || null,
                    topArtistCount: topArtists[0]?.count || 0,
                };
            },

            // Check if user has listening history
            hasHistory: () => {
                return get().plays.length > 0;
            },

            // Clear history
            clearHistory: () => {
                set({
                    plays: [],
                    stats: {
                        topArtists: new Map(),
                        topGenres: new Map(),
                        totalListeningTime: 0,
                        uniqueTracks: new Set(),
                    },
                });
            },
        }),
        {
            name: 'music-horizon-listening-history',
            version: 2,
            storage: createMapSetJSONStorage(() => localStorage),

            // Stats are derived from plays; only persist plays.
            partialize: (state) => ({ plays: state.plays }),

            // Recompute stats on hydration (also fixes old corrupted localStorage).
            merge: (persistedState, currentState) => {
                const plays = (persistedState && Array.isArray(persistedState.plays))
                    ? persistedState.plays
                    : currentState.plays;

                const topArtists = new Map();
                const uniqueTracks = new Set();
                let totalListeningTime = 0;

                for (const play of plays) {
                    const artist = play?.track?.artist;
                    if (artist) {
                        topArtists.set(artist, (topArtists.get(artist) || 0) + 1);
                    }
                    const trackId = play?.track?.id;
                    if (trackId) uniqueTracks.add(trackId);
                    totalListeningTime += (play?.duration || 0);
                }

                return {
                    ...currentState,
                    ...persistedState,
                    plays,
                    stats: {
                        ...currentState.stats,
                        topArtists,
                        topGenres: new Map(),
                        uniqueTracks,
                        totalListeningTime,
                    },
                };
            },
        }
    )
);

export default useListeningHistoryStore;
