import { create } from 'zustand';
import spotifyService from '../services/spotify';
import { playlistAPI } from '../services/api';

const usePlaylistStore = create((set, get) => ({
    playlists: [],
    isLoading: false,

    // Carregar playlists do backend
    loadPlaylists: async () => {
        set({ isLoading: true });
        try {
            const response = await playlistAPI.getAll();
            if (response.success) {
                set({ playlists: response.data || [] });
            }
        } catch (error) {
            console.error('Erro ao carregar playlists:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    // Add playlist - INTEGRADO COM BACKEND
    addPlaylist: async (playlist) => {
        try {
            const response = await playlistAPI.create(
                playlist.name,
                playlist.description || '',
                playlist.tracks || [],
                playlist.isPublic || false
            );
            if (response.success && response.data) {
                set(state => ({
                    playlists: [...state.playlists, response.data]
                }));
                return response.data;
            }
            throw new Error(response.message || 'Erro ao criar playlist');
        } catch (error) {
            console.error('Erro ao criar playlist:', error);
            throw error;
        }
    },

    // Remove playlist - INTEGRADO COM BACKEND
    removePlaylist: async (id) => {
        try {
            const response = await playlistAPI.delete(id);
            if (response.success) {
                set(state => ({
                    playlists: state.playlists.filter(p => p.id !== id)
                }));
            }
        } catch (error) {
            console.error('Erro ao remover playlist:', error);
            throw error;
        }
    },

    // Update playlist - INTEGRADO COM BACKEND
    updatePlaylist: async (id, updates) => {
        try {
            const response = await playlistAPI.update(id, updates);
            if (response.success && response.data) {
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === id ? response.data : p
                    )
                }));
                return response.data;
            }
        } catch (error) {
            console.error('Erro ao atualizar playlist:', error);
            throw error;
        }
    },

    // Add track to playlist - INTEGRADO COM BACKEND
    addTrackToPlaylist: async (playlistId, track) => {
        try {
            const response = await playlistAPI.addTrack(playlistId, track);
            if (response.success && response.data) {
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === playlistId ? response.data : p
                    )
                }));
                return response.data;
            }
        } catch (error) {
            console.error('Erro ao adicionar track:', error);
            throw error;
        }
    },

    // Remove track from playlist - INTEGRADO COM BACKEND
    removeTrackFromPlaylist: async (playlistId, trackId) => {
        try {
            const response = await playlistAPI.removeTrack(playlistId, trackId);
            if (response.success && response.data) {
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === playlistId ? response.data : p
                    )
                }));
                return response.data;
            }
        } catch (error) {
            console.error('Erro ao remover track:', error);
            throw error;
        }
    },

    // Export playlist to Spotify
    exportToSpotify: async (playlistId, userId) => {
        // Check if Spotify is connected first
        if (!spotifyService.isConnected()) {
            throw new Error('Spotify não está conectado. Por favor, reconecte sua conta.');
        }

        const playlist = get().playlists.find(p => p.id === playlistId);
        if (!playlist) {
            throw new Error('Playlist not found');
        }

        try {
            // Create playlist on Spotify
            const spotifyPlaylist = await spotifyService.createPlaylist(
                userId,
                playlist.name,
                `Created by Music Horizon - ${playlist.tracks.length} tracks`,
                true
            );

            // Get Spotify URIs for tracks
            const trackUris = playlist.tracks
                .filter(track => track.uri || track.spotifyUri)
                .map(track => track.uri || track.spotifyUri);

            if (trackUris.length > 0) {
                await spotifyService.addTracksToPlaylist(spotifyPlaylist.id, trackUris);
            }

            // Atualizar no backend
            await playlistAPI.update(playlistId, {
                spotifyId: spotifyPlaylist.id,
                exported: true
            });

            // Update local state
            set(state => ({
                playlists: state.playlists.map(p =>
                    p.id === playlistId
                        ? { ...p, spotifyId: spotifyPlaylist.id, exported: true }
                        : p
                )
            }));

            return spotifyPlaylist;
        } catch (error) {
            console.error('Error exporting playlist:', error);
            throw error;
        }
    },

    // Remove playlist from Spotify (Unfollow)
    removePlaylistFromSpotify: async (playlistId) => {
        const playlist = get().playlists.find(p => p.id === playlistId);
        if (!playlist || !playlist.spotifyId) {
            throw new Error('Playlist not found or not exported');
        }

        try {
            await spotifyService.unfollowPlaylist(playlist.spotifyId);

            // Atualizar no backend
            await playlistAPI.update(playlistId, {
                spotifyId: null,
                exported: false
            });

            // Update local state
            set(state => ({
                playlists: state.playlists.map(p =>
                    p.id === playlistId
                        ? { ...p, spotifyId: null, exported: false }
                        : p
                )
            }));
        } catch (error) {
            console.error('Error removing playlist from Spotify:', error);
            throw error;
        }
    }
}));

export default usePlaylistStore;
