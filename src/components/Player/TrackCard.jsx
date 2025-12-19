import usePlayerStore from '../../stores/playerStore';
import useAuthStore from '../../stores/authStore';
import usePreviewStore from '../../stores/previewStore';

function TrackCard({ track, onPlay }) {
    const playTrack = usePlayerStore(state => state.playTrack);
    const spotifyConnected = useAuthStore(state => state.spotifyConnected);

    // Preview Store
    const { playPreview, currentTrack, isPlaying: isPreviewPlaying } = usePreviewStore();
    const isThisPreviewPlaying = isPreviewPlaying && currentTrack?.id === track.id;

    const handlePlay = (e) => {
        e?.stopPropagation(); // Prevent card click

        // Check actual connection status (token + expiry)
        const isActuallyConnected = spotifyConnected && localStorage.getItem('spotify_token');

        if (!isActuallyConnected) {
            // Fallback to preview if Spotify not connected
            if (track.previewUrl) {
                playPreview(track);
            } else {
                // Check if it's just expired
                if (localStorage.getItem('spotify_token')) {
                    alert('Sua sessão do Spotify expirou. Por favor, recarregue a página ou reconecte.');
                } else {
                    alert('Conecte o Spotify para reproduzir músicas completas');
                }
            }
            return;
        }

        if (track.uri || track.spotifyUri) {
            if (onPlay) {
                onPlay();
            } else {
                playTrack(track);
            }
        } else {
            alert('Esta música não está disponível no Spotify para reprodução');
        }
    };

    const handlePreviewToggle = (e) => {
        e.stopPropagation();
        playPreview(track);
    };

    const canPlay = spotifyConnected && (track.uri || track.spotifyUri);
    const hasPreview = !!track.previewUrl;

    // Generate a consistent color based on track name
    const getGradientColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 40%))`;
    };

    const imageSrc = track.imageUrl || track.image;
    const hasImage = imageSrc && imageSrc !== '' && imageSrc !== 'undefined' && imageSrc !== '/default-album.png';

    return (
        <div className="bg-gray-800 p-4 rounded-lg card-hover-effect cursor-pointer group hover:bg-gray-750 transition-colors">
            <div className="relative mb-4 group/image">
                {hasImage ? (
                    <img
                        src={imageSrc}
                        alt={track.name}
                        className="w-full rounded-md aspect-square object-cover shadow-md"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="w-full rounded-md aspect-square flex items-center justify-center shadow-inner"
                    style={{
                        background: getGradientColor(track.name),
                        display: hasImage ? 'none' : 'flex'
                    }}
                >
                    <i className="ph-fill ph-music-note text-white text-6xl opacity-50"></i>
                </div>

                {/* Overlay Gradient on Hover */}
                <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-3 ${isThisPreviewPlaying ? 'opacity-100' : ''}`}>

                    {/* Preview Button */}
                    {hasPreview && (
                        <button
                            onClick={handlePreviewToggle}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg border border-white/20 ${isThisPreviewPlaying
                                ? 'bg-blue-500 text-white'
                                : 'bg-white/20 text-white hover:bg-blue-500 backdrop-blur-sm'
                                }`}
                            title="Ouvir Prévia (30s)"
                        >
                            {isThisPreviewPlaying ? (
                                <i className="ph-fill ph-stop text-lg"></i>
                            ) : (
                                <i className="ph-fill ph-speaker-high text-lg"></i>
                            )}
                        </button>
                    )}

                    {/* Spotify Play Button */}
                    <button
                        onClick={handlePlay}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg border border-white/20 ${canPlay
                            ? 'bg-green-500 text-white hover:bg-green-400'
                            : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                            }`}
                        disabled={!canPlay && !hasPreview}
                        title={canPlay ? "Reproduzir no Spotify" : "Spotify não conectado"}
                    >
                        <i className={`ph-fill ${canPlay ? 'ph-play' : 'ph-spotify-logo'} text-xl`}></i>
                    </button>
                </div>

                {/* Playing Indicator (Visual EQ) */}
                {isThisPreviewPlaying && (
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1 items-end h-4">
                        <div className="w-1 bg-blue-400 animate-[bounce_1s_infinite] h-2"></div>
                        <div className="w-1 bg-blue-400 animate-[bounce_1.2s_infinite] h-4"></div>
                        <div className="w-1 bg-blue-400 animate-[bounce_0.8s_infinite] h-3"></div>
                    </div>
                )}
            </div>

            <h4 className="text-lg font-bold text-white truncate leading-tight mb-1" title={track.name}>{track.name}</h4>
            <p className="text-sm text-gray-400 truncate hover:text-gray-300" title={track.artist}>{track.artist}</p>

            {track.reason && (
                <div className="mt-3 flex items-start gap-2 bg-gray-900/50 p-2 rounded-md border border-gray-700/50">
                    <i className="ph-fill ph-sparkle text-blue-400 text-xs mt-0.5 flex-shrink-0"></i>
                    <p className="text-xs text-gray-400 italic leading-tight line-clamp-2">{track.reason}</p>
                </div>
            )}

            {!track.reason && track.album && (
                <p className="text-xs text-gray-500 truncate mt-1">{track.album}</p>
            )}
        </div>
    );
}

export default TrackCard;
