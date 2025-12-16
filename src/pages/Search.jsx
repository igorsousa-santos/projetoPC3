import { useState } from 'react';
import Header from '../components/Layout/Header';
import TrackListItem from '../components/Player/TrackListItem';
import Toast from '../components/Toast';
import AchievementToast from '../components/Gamification/AchievementToast';
import spotifyService from '../services/spotify';
import usePlaylistStore from '../stores/playlistStore';
import useGamificationStore from '../stores/gamificationStore';
import useAuthStore from '../stores/authStore';

// Accordion Section Component
function AccordionSection({ title, icon, color, count, totalCount, isExpanded, onToggle, onLoadMore, isLoadingMore, hasMore, children }) {
    return (
        <div className="bg-dark-card/50 border border-white/5 rounded-2xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${color}`}>
                        <i className={`ph-fill ${icon} text-xl`}></i>
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                        <p className="text-sm text-gray-500">
                            {count} de {totalCount > 1000 ? '1000+' : totalCount} resultados
                        </p>
                    </div>
                </div>
                <i className={`ph ph-caret-down text-2xl text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}></i>
            </button>
            
            {isExpanded && (
                <div className="px-6 pb-6 space-y-4">
                    {children}
                    
                    {hasMore && (
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={onLoadMore}
                                disabled={isLoadingMore}
                                className="btn-secondary px-6"
                            >
                                {isLoadingMore ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                                        Carregando...
                                    </>
                                ) : (
                                    <>
                                        <i className="ph ph-plus mr-2"></i>
                                        Carregar mais
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Spotify Artist Card Component
function ArtistResultCard({ artist, onClick }) {
    const image = artist.images?.[0]?.url || artist.images?.[1]?.url;

    return (
        <div 
            onClick={onClick}
            className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group"
        >
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-accent-purple/30 to-accent-blue/30 flex-shrink-0">
                {image ? (
                    <img 
                        src={image} 
                        alt={artist.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <i className="ph-fill ph-user text-2xl text-white/50"></i>
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white truncate group-hover:text-accent-purple transition-colors">
                    {artist.name}
                </h4>
                <p className="text-sm text-gray-500">
                    {artist.followers?.total?.toLocaleString() || 0} seguidores
                </p>
                {artist.genres?.length > 0 && (
                    <p className="text-xs text-gray-600 truncate">
                        {artist.genres.slice(0, 2).join(', ')}
                    </p>
                )}
            </div>
            <i className="ph ph-arrow-right text-xl text-gray-600 group-hover:text-white transition-colors"></i>
        </div>
    );
}

// Spotify Album Card Component
function AlbumResultCard({ album }) {
    const image = album.images?.[0]?.url || album.images?.[1]?.url;
    const artistName = album.artists?.map(a => a.name).join(', ') || '';

    return (
        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-accent-blue/30 to-green-500/30 flex-shrink-0 shadow-lg">
                {image ? (
                    <img 
                        src={image} 
                        alt={album.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <i className="ph-fill ph-vinyl-record text-2xl text-white/50"></i>
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white truncate group-hover:text-accent-blue transition-colors">
                    {album.name}
                </h4>
                <p className="text-sm text-gray-500 truncate">
                    {artistName}
                </p>
                <p className="text-xs text-gray-600">
                    {album.release_date?.split('-')[0]} • {album.total_tracks} faixas
                </p>
            </div>
        </div>
    );
}

// Convert Spotify track to app format
function normalizeSpotifyTrack(track) {
    return {
        id: track.id,
        name: track.name,
        artist: track.artists?.map(a => a.name).join(', ') || '',
        album: track.album?.name || '',
        imageUrl: track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || null,
        spotifyUri: track.uri,
        previewUrl: track.preview_url,
        duration: track.duration_ms,
        popularity: track.popularity
    };
}

function Search() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // Check if Spotify is connected - verify actual token exists
    const spotifyConnectedStore = useAuthStore(state => state.spotifyConnected);
    const spotifyConnected = spotifyConnectedStore && spotifyService.isConnected();
    
    // Search results state
    const [artists, setArtists] = useState([]);
    const [tracks, setTracks] = useState([]);
    const [albums, setAlbums] = useState([]);
    
    // Pagination state (Spotify uses offset)
    const [artistsOffset, setArtistsOffset] = useState(0);
    const [tracksOffset, setTracksOffset] = useState(0);
    const [albumsOffset, setAlbumsOffset] = useState(0);
    
    // Total counts
    const [artistsTotal, setArtistsTotal] = useState(0);
    const [tracksTotal, setTracksTotal] = useState(0);
    const [albumsTotal, setAlbumsTotal] = useState(0);
    
    // Loading more state
    const [loadingMoreArtists, setLoadingMoreArtists] = useState(false);
    const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
    const [loadingMoreAlbums, setLoadingMoreAlbums] = useState(false);
    
    // Accordion states
    const [expandedArtists, setExpandedArtists] = useState(true);
    const [expandedTracks, setExpandedTracks] = useState(true);
    const [expandedAlbums, setExpandedAlbums] = useState(true);
    
    // Playlist modal
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [playlistName, setPlaylistName] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [newBadges, setNewBadges] = useState([]);
    
    const addPlaylist = usePlaylistStore(state => state.addPlaylist);
    const { trackSearch, trackTracksDiscovered, trackPlaylistCreated } = useGamificationStore();

    // Main search function
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        if (!spotifyConnected) {
            setError('Conecte sua conta do Spotify para buscar músicas.');
            return;
        }

        setIsLoading(true);
        setError(null);
        
        // Reset states
        setArtists([]);
        setTracks([]);
        setAlbums([]);
        setArtistsOffset(0);
        setTracksOffset(0);
        setAlbumsOffset(0);

        try {
            // Search all categories at once
            const result = await spotifyService.searchAll(searchQuery, 10, 0);

            // Set totals
            setArtistsTotal(result.artists.total);
            setTracksTotal(result.tracks.total);
            setAlbumsTotal(result.albums.total);

            // Set results (limit initial display)
            setArtists(result.artists.items.slice(0, 3));
            setTracks(result.tracks.items.map(normalizeSpotifyTrack).slice(0, 7));
            setAlbums(result.albums.items.slice(0, 7));

            // Track gamification
            trackSearch(searchQuery);
            if (result.tracks.items.length > 0) {
                trackTracksDiscovered(result.tracks.items.length);
            }

            // Check for badges
            const badges = useGamificationStore.getState().checkAndUnlockBadges();
            if (badges.length > 0) {
                setNewBadges(badges);
            }

        } catch (err) {
            console.error('Search error:', err);
            if (err.message?.includes('401')) {
                setError('Sessão expirada. Por favor, reconecte sua conta do Spotify.');
            } else {
                setError('Erro ao buscar. Tente novamente.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Load more artists
    const loadMoreArtists = async () => {
        if (loadingMoreArtists) return;
        setLoadingMoreArtists(true);
        
        try {
            const newOffset = artists.length;
            const result = await spotifyService.searchArtists(searchQuery, 10, newOffset);
            
            if (result.artists.length === 0) {
                setArtistsTotal(artists.length);
                return;
            }
            
            setArtists(prev => [...prev, ...result.artists]);
            setArtistsOffset(newOffset);
        } catch (err) {
            console.error('Error loading more artists:', err);
        } finally {
            setLoadingMoreArtists(false);
        }
    };

    // Load more tracks
    const loadMoreTracks = async () => {
        if (loadingMoreTracks) return;
        setLoadingMoreTracks(true);
        
        try {
            const newOffset = tracks.length;
            const result = await spotifyService.searchTracks(searchQuery, 10, newOffset);
            
            if (result.tracks.length === 0) {
                setTracksTotal(tracks.length);
                return;
            }
            
            setTracks(prev => [...prev, ...result.tracks.map(normalizeSpotifyTrack)]);
            setTracksOffset(newOffset);
        } catch (err) {
            console.error('Error loading more tracks:', err);
        } finally {
            setLoadingMoreTracks(false);
        }
    };

    // Load more albums
    const loadMoreAlbums = async () => {
        if (loadingMoreAlbums) return;
        setLoadingMoreAlbums(true);
        
        try {
            const newOffset = albums.length;
            const result = await spotifyService.searchAlbums(searchQuery, 10, newOffset);
            
            if (result.albums.length === 0) {
                setAlbumsTotal(albums.length);
                return;
            }
            
            setAlbums(prev => [...prev, ...result.albums]);
            setAlbumsOffset(newOffset);
        } catch (err) {
            console.error('Error loading more albums:', err);
        } finally {
            setLoadingMoreAlbums(false);
        }
    };

    // Search by artist (when clicking on an artist)
    const searchByArtist = async (artist) => {
        setSearchQuery(artist.name);
        setIsLoading(true);
        setError(null);
        
        try {
            // Get top tracks by this artist
            const topTracks = await spotifyService.getArtistTopTracks(artist.id);
            
            setTracks(topTracks.map(normalizeSpotifyTrack));
            setTracksTotal(topTracks.length);
            setTracksOffset(0);
            
            // Keep artists but collapse
            setExpandedArtists(false);
            setExpandedTracks(true);
            setExpandedAlbums(false);
            
        } catch (err) {
            console.error('Error searching by artist:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Create playlist from tracks
    const handleCreatePlaylist = async () => {
        if (!playlistName.trim() || tracks.length === 0) return;

        try {
            await addPlaylist({
                name: playlistName,
                tracks: tracks,
                created: new Date().toISOString()
            });

            trackPlaylistCreated();
            const badges = useGamificationStore.getState().checkAndUnlockBadges();
            if (badges.length > 0) {
                setNewBadges(badges);
            }

            setPlaylistName('');
            setShowPlaylistModal(false);
            setShowToast(true);
        } catch (error) {
            console.error('Erro ao criar playlist:', error);
            alert('Erro ao criar playlist: ' + error.message);
        }
    };

    const hasResults = artists.length > 0 || tracks.length > 0 || albums.length > 0;

    return (
        <>
            <Header title="Buscar" />
            <div className="p-8 flex-1 pb-20">
                <div className="max-w-5xl mx-auto space-y-8">
                    
                    {/* Search Bar */}
                    <section>
                        <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
                            <div className="flex gap-4">
                                <div className="flex-1 relative">
                                    <i className="ph ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Busque por artista, música ou álbum..."
                                        className="w-full bg-dark-card border border-dark-border rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading || !spotifyConnected}
                                    className="btn-primary px-8 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <i className="ph-fill ph-spotify-logo mr-2"></i>
                                            Buscar
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                        
                        {!spotifyConnected && (
                            <p className="text-center text-yellow-500 mt-4 text-sm">
                                <i className="ph ph-warning mr-2"></i>
                                Conecte sua conta do Spotify para buscar músicas
                            </p>
                        )}
                    </section>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl max-w-3xl mx-auto">
                            <i className="ph ph-warning mr-2"></i>
                            {error}
                        </div>
                    )}

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-400 mt-4 animate-pulse">Buscando no Spotify...</p>
                        </div>
                    )}

                    {/* Results */}
                    {!isLoading && hasResults && (
                        <div className="space-y-6">
                            
                            {/* Header with playlist button */}
                            {tracks.length > 0 && (
                                <div className="flex justify-between items-center">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <i className="ph-fill ph-spotify-logo text-green-500"></i>
                                        Resultados para "{searchQuery}"
                                    </h2>
                                    <button
                                        onClick={() => setShowPlaylistModal(true)}
                                        className="btn-primary"
                                    >
                                        <i className="ph ph-playlist mr-2"></i>
                                        Criar Playlist ({tracks.length} faixas)
                                    </button>
                                </div>
                            )}

                            {/* Artists Accordion */}
                            {artistsTotal > 0 && (
                                <AccordionSection
                                    title="Artistas"
                                    icon="ph-user"
                                    color="text-accent-purple"
                                    count={artists.length}
                                    totalCount={artistsTotal}
                                    isExpanded={expandedArtists}
                                    onToggle={() => setExpandedArtists(!expandedArtists)}
                                    onLoadMore={loadMoreArtists}
                                    isLoadingMore={loadingMoreArtists}
                                    hasMore={artists.length < artistsTotal}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {artists.map((artist, i) => (
                                            <ArtistResultCard 
                                                key={`artist-${artist.id}-${i}`} 
                                                artist={artist}
                                                onClick={() => searchByArtist(artist)}
                                            />
                                        ))}
                                    </div>
                                </AccordionSection>
                            )}

                            {/* Tracks Accordion */}
                            {tracksTotal > 0 && (
                                <AccordionSection
                                    title="Faixas"
                                    icon="ph-music-note"
                                    color="text-green-400"
                                    count={tracks.length}
                                    totalCount={tracksTotal}
                                    isExpanded={expandedTracks}
                                    onToggle={() => setExpandedTracks(!expandedTracks)}
                                    onLoadMore={loadMoreTracks}
                                    isLoadingMore={loadingMoreTracks}
                                    hasMore={tracks.length < tracksTotal}
                                >
                                    <div className="space-y-2">
                                        {tracks.map((track, index) => (
                                            <TrackListItem 
                                                key={`track-${track.id}-${index}`} 
                                                track={track} 
                                                index={index} 
                                            />
                                        ))}
                                    </div>
                                </AccordionSection>
                            )}

                            {/* Albums Accordion */}
                            {albumsTotal > 0 && (
                                <AccordionSection
                                    title="Álbuns"
                                    icon="ph-vinyl-record"
                                    color="text-accent-blue"
                                    count={albums.length}
                                    totalCount={albumsTotal}
                                    isExpanded={expandedAlbums}
                                    onToggle={() => setExpandedAlbums(!expandedAlbums)}
                                    onLoadMore={loadMoreAlbums}
                                    isLoadingMore={loadingMoreAlbums}
                                    hasMore={albums.length < albumsTotal}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {albums.map((album, i) => (
                                            <AlbumResultCard 
                                                key={`album-${album.id}-${i}`} 
                                                album={album}
                                            />
                                        ))}
                                    </div>
                                </AccordionSection>
                            )}
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && !hasResults && !error && (
                        <div className="text-center py-20">
                            <div className="w-24 h-24 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <i className="ph-fill ph-spotify-logo text-5xl text-green-500"></i>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-400 mb-2">
                                Busque no Spotify
                            </h3>
                            <p className="text-gray-500 max-w-md mx-auto">
                                Digite o nome de um artista, música ou álbum para encontrar no catálogo do Spotify
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Playlist Modal */}
            {showPlaylistModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-card rounded-2xl p-6 max-w-md w-full border border-dark-border">
                        <h3 className="text-xl font-bold text-white mb-4">Criar Playlist</h3>
                        <input
                            type="text"
                            value={playlistName}
                            onChange={(e) => setPlaylistName(e.target.value)}
                            placeholder="Nome da playlist"
                            className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white mb-4"
                            autoFocus
                        />
                        <p className="text-sm text-gray-400 mb-4">
                            {tracks.length} faixas serão adicionadas
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowPlaylistModal(false)} className="btn-secondary flex-1">
                                Cancelar
                            </button>
                            <button onClick={handleCreatePlaylist} className="btn-primary flex-1" disabled={!playlistName.trim()}>
                                Criar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {showToast && (
                <Toast
                    message="Playlist criada com sucesso!"
                    type="success"
                    onClose={() => setShowToast(false)}
                />
            )}

            {/* Achievement Toasts */}
            {newBadges.map((badge, index) => (
                <AchievementToast
                    key={badge.id}
                    badge={badge}
                    onClose={() => setNewBadges(prev => prev.filter(b => b.id !== badge.id))}
                    duration={5000 + (index * 1000)}
                />
            ))}
        </>
    );
}

export default Search;
