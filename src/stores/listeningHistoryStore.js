import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import spotifyService from '../services/spotify';

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
                        // Simple check: playTime
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
                        // Merge and Sort
                        const merged = [...newPlays, ...currentPlays]
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                            .slice(0, 100);

                        // Recalculate Stats (Simplified: Just rebuild from merged plays)
                        const topArtists = new Map();
                        const uniqueTracks = new Set();
                        let totalTime = 0;

                        merged.forEach(play => {
                            const artist = play.track.artist;
                            topArtists.set(artist, (topArtists.get(artist) || 0) + 1);
                            uniqueTracks.add(play.track.id);
                            totalTime += (play.duration || 0);
                        });

                        set({
                            plays: merged,
                            stats: {
                                ...get().stats,
                                topArtists,
                                totalListeningTime: totalTime,
                                uniqueTracks,
                            }
                        });
                        
                        console.log(`[History] Synced ${newPlays.length} new plays from Spotify.`);
                    }
                } catch (e) {
                    console.error('Error syncing history with Spotify:', e);
                }
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

                // Update unique tracks
                const uniqueTracks = new Set(stats.uniqueTracks);
                uniqueTracks.add(track.id);

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
            // Custom serializer to handle Map and Set
            serialize: (state) => {
                const serialized = {
                    ...state,
                    state: {
                        ...state.state,
                        stats: {
                            ...state.state.stats,
                            topArtists: Array.from(state.state.stats.topArtists.entries()),
                            topGenres: Array.from(state.state.stats.topGenres.entries()),
                            uniqueTracks: Array.from(state.state.stats.uniqueTracks),
                        },
                    },
                };
                return JSON.stringify(serialized);
            },
            deserialize: (str) => {
                const parsed = JSON.parse(str);
                return {
                    ...parsed,
                    state: {
                        ...parsed.state,
                        stats: {
                            ...parsed.state.stats,
                            topArtists: new Map(parsed.state.stats.topArtists),
                            topGenres: new Map(parsed.state.stats.topGenres),
                            uniqueTracks: new Set(parsed.state.stats.uniqueTracks),
                        },
                    },
                };
            },
        }
    )
);

export default useListeningHistoryStore;
