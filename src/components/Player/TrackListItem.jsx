import usePlayerStore from '../../stores/playerStore';
import useAuthStore from '../../stores/authStore';
import usePreviewStore from '../../stores/previewStore';

export default function TrackListItem({ track, index, compact = false }) {
    const playTrack = usePlayerStore(state => state.playTrack);
    const spotifyConnected = useAuthStore(state => state.spotifyConnected);
    const { playPreview, currentTrack, isPlaying, isLoading } = usePreviewStore();

    const handlePlay = () => {
        if (!spotifyConnected) {
            alert('Conecte o Spotify para reproduzir músicas');
            return;
        }

        if (track.spotifyUri) {
            playTrack(track);
        } else {
            alert('Esta música não está disponível no Spotify para reprodução');
        }
    };

    const handlePreview = () => {
        playPreview(track);
    };

    const canPlay = spotifyConnected && track.spotifyUri;
    const hasPreview = track.previewUrl;
    const isCurrentTrack = currentTrack?.id === track.id;
    const isPlayingPreview = isCurrentTrack && isPlaying;
    const isLoadingPreview = isCurrentTrack && isLoading;

    // Generate a consistent color based on track name
    const getGradientColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 40%))`;
    };

    const hasImage = track.imageUrl && track.imageUrl !== '' && track.imageUrl !== 'undefined' && track.imageUrl !== '/default-album.png';

    // Compact version for sidebars
    if (compact) {
        return (
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer" onClick={handlePreview}>
                <div
                    className="w-10 h-10 rounded flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: hasImage ? 'transparent' : getGradientColor(track.name) }}
                >
                    {hasImage ? (
                        <img src={track.imageUrl} alt={track.name} className="w-full h-full object-cover" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = getGradientColor(track.name); }} />
                    ) : (
                        <i className="ph-fill ph-music-note text-white text-lg opacity-70"></i>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{track.name}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-dark-card border border-dark-border rounded-lg p-3 hover:bg-dark-bg transition-colors group">
            <div className="flex items-center space-x-4">
                {/* Index Number */}
                <div className="text-dark-text-muted text-sm font-semibold w-8 text-center">
                    {index + 1}
                </div>

                {/* Album Art */}
                <div className="relative flex-shrink-0">
                    <div
                        className="w-14 h-14 rounded flex items-center justify-center overflow-hidden"
                        style={{
                            background: hasImage ? 'transparent' : getGradientColor(track.name)
                        }}
                    >
                        {hasImage ? (
                            <img
                                src={track.imageUrl}
                                alt={track.name}
                                className="w-full h-full object-cover"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.style.background = getGradientColor(track.name);
                                }}
                            />
                        ) : (
                            <i className="ph-fill ph-music-note text-white text-2xl opacity-70"></i>
                        )}
                    </div>
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold truncate">{track.name}</h4>
                    <p className="text-dark-text-muted text-sm truncate">{track.artist}</p>
                    {track.album && (
                        <p className="text-dark-text-muted text-xs truncate">{track.album}</p>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                    {/* Preview Button */}
                    {hasPreview && (
                        <button
                            onClick={handlePreview}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isPlayingPreview || isLoadingPreview
                                    ? 'bg-accent-green'
                                    : 'bg-gray-700 hover:bg-gray-600 opacity-0 group-hover:opacity-100'
                                }`}
                            title="Preview (30s)"
                            disabled={isLoadingPreview}
                        >
                            {isLoadingPreview ? (
                                <i className="ph ph-spinner animate-spin text-white"></i>
                            ) : (
                                <i className={`ph-fill ${isPlayingPreview ? 'ph-pause' : 'ph-speaker-high'} text-white`}></i>
                            )}
                        </button>
                    )}

                    {/* Play Button (Full Spotify Playback) */}
                    <button
                        onClick={handlePlay}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${canPlay
                            ? 'bg-accent-blue hover:bg-accent-green opacity-0 group-hover:opacity-100'
                            : 'bg-dark-border cursor-not-allowed opacity-50'
                            }`}
                        disabled={!canPlay}
                        title={!spotifyConnected ? 'Conecte o Spotify para reproduzir' : !track.spotifyUri ? 'Não disponível no Spotify' : 'Reproduzir no Spotify'}
                    >
                        <i className="ph-fill ph-play text-white"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}
