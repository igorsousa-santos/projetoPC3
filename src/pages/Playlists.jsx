import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import usePlaylistStore from '../stores/playlistStore';
import useAuthStore from '../stores/authStore';
import usePlayerStore from '../stores/playerStore';
import TrackCard from '../components/Player/TrackCard';
import spotifyService from '../services/spotify';

function Playlists() {
    const playlists = usePlaylistStore(state => state.playlists);
    const isLoading = usePlaylistStore(state => state.isLoading);
    const loadPlaylists = usePlaylistStore(state => state.loadPlaylists);
    const exportToSpotify = usePlaylistStore(state => state.exportToSpotify);
    const removePlaylistFromSpotify = usePlaylistStore(state => state.removePlaylistFromSpotify);
    const removePlaylist = usePlaylistStore(state => state.removePlaylist);
    const playTracks = usePlayerStore(state => state.playTracks);
    const spotifyUserId = useAuthStore(state => state.spotifyUserId);
    const spotifyConnectedStore = useAuthStore(state => state.spotifyConnected);
    const [expandedId, setExpandedId] = useState(null);
    const [exporting, setExporting] = useState(null);

    // Check if Spotify is actually connected with a valid token
    const spotifyConnected = spotifyConnectedStore && spotifyService.isConnected();

    // Carregar playlists ao montar o componente
    useEffect(() => {
        loadPlaylists();
    }, [loadPlaylists]);

    const handleExport = async (playlistId) => {
        let currentSpotifyUserId = spotifyUserId;

        // Lazy fetch: If ID is missing but we have a token, try to fetch it now
        if (!currentSpotifyUserId && useAuthStore.getState().token) {
            try {
                await useAuthStore.getState().fetchSpotifyUser();
                currentSpotifyUserId = useAuthStore.getState().spotifyUserId;
            } catch (e) {
                console.error('Failed to lazy fetch Spotify user', e);
            }
        }

        if (!currentSpotifyUserId) {
            alert('Erro: Usuário não identificado no Spotify. Tente reconectar.');
            return;
        }

        setExporting(playlistId);
        try {
            await exportToSpotify(playlistId, currentSpotifyUserId);
            alert('Playlist exportada com sucesso para o Spotify!');
        } catch (error) {
            alert('Erro ao exportar playlist: ' + error.message);
        } finally {
            setExporting(null);
        }
    };

    const handleRemoveFromSpotify = async (playlistId) => {
        if (confirm('Tem certeza que deseja remover esta playlist do seu Spotify? (Ela continuará salva aqui no app)')) {
            try {
                await removePlaylistFromSpotify(playlistId);
                alert('Playlist removida do Spotify com sucesso!');
            } catch (error) {
                alert('Erro ao remover do Spotify: ' + error.message);
            }
        }
    };

    const handleDelete = async (playlistId) => {
        if (confirm('Tem certeza que deseja excluir esta playlist?')) {
            try {
                await removePlaylist(playlistId);
            } catch (error) {
                alert('Erro ao excluir playlist: ' + error.message);
            }
        }
    };

    return (
        <>
            <Header title="Minhas Playlists" />
            <div className="p-8 flex-1">
                <div className="max-w-7xl mx-auto space-y-6">
                    {playlists.length === 0 ? (
                        <div className="text-center py-16">
                            <i className="ph ph-music-notes text-8xl text-gray-700 mb-4"></i>
                            <h3 className="text-2xl font-bold text-gray-400">
                                Nenhuma playlist ainda
                            </h3>
                            <p className="text-gray-500 mt-2">
                                Crie playlists a partir das suas buscas
                            </p>
                        </div>
                    ) : (
                        playlists.map((playlist) => (
                            <div
                                key={playlist.id}
                                className="bg-gray-800 p-6 rounded-lg card-hover-effect"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center">
                                        <i className="ph-fill ph-music-notes text-4xl text-blue-400 mr-4"></i>
                                        <div>
                                            <h4 className="text-xl font-bold text-white">{playlist.name}</h4>
                                            <p className="text-sm text-gray-400">
                                                {playlist.tracks.length} músicas
                                                {playlist.exported && ' • Exportada para Spotify'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setExpandedId(expandedId === playlist.id ? null : playlist.id)}
                                            className="btn-secondary"
                                        >
                                            <i className={`ph ${expandedId === playlist.id ? 'ph-caret-up' : 'ph-caret-down'}`}></i>
                                        </button>
                                        {!playlist.exported ? (
                                            spotifyConnected ? (
                                                <button
                                                    onClick={() => handleExport(playlist.id)}
                                                    disabled={exporting === playlist.id}
                                                    className="btn-primary"
                                                >
                                                    {exporting === playlist.id ? (
                                                        <div className="loader w-4 h-4"></div>
                                                    ) : (
                                                        <>
                                                            <i className="ph ph-spotify-logo mr-2"></i>
                                                            Exportar
                                                        </>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn-secondary text-yellow-400 opacity-50 cursor-not-allowed"
                                                    title="Conecte o Spotify para exportar"
                                                    disabled
                                                >
                                                    <i className="ph ph-spotify-logo mr-2"></i>
                                                    Conectar Spotify
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                onClick={() => handleRemoveFromSpotify(playlist.id)}
                                                className="btn-secondary text-green-400 hover:bg-green-900/20 border-green-500/30"
                                                title="Remover do Spotify"
                                            >
                                                <i className="ph-fill ph-spotify-logo mr-2"></i>
                                                No Spotify
                                                <i className="ph ph-x ml-2 text-xs"></i>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(playlist.id)}
                                            className="btn-secondary text-red-400 hover:bg-red-900/20"
                                        >
                                            <i className="ph ph-trash"></i>
                                        </button>
                                    </div>
                                </div>

                                {expandedId === playlist.id && (
                                    <div className="mt-6 pt-6 border-t border-gray-700">
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                            {playlist.tracks.map((track, index) => (
                                                <TrackCard
                                                    key={`${track.id}-${index}`}
                                                    track={track}
                                                    onPlay={() => playTracks(playlist.tracks, index)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}

export default Playlists;
