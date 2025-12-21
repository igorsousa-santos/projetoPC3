import { useState, useEffect } from 'react';
import usePlayerStore from '../stores/playerStore';
import useAuthStore from '../stores/authStore';
import usePreviewStore from '../stores/previewStore';

export default function TrackCard({ track, rank, onPlay, disabled = false }) {
    // --- 1. LÓGICA DO PLAYER (Mantida e funcional) ---
    const playTrack = usePlayerStore(state => state.playTrack);
    const spotifyConnected = useAuthStore(state => state.spotifyConnected);
    const { playPreview, currentTrack, isPlaying: isPreviewPlaying } = usePreviewStore();
    
    const isThisPreviewPlaying = isPreviewPlaying && currentTrack?.id === track.id;
    const canPlay = !!(spotifyConnected && (track.uri || track.spotifyUri));
    const hasPreview = !!track.previewUrl;

    const handlePlay = (e) => {
        e?.stopPropagation();
        const isActuallyConnected = spotifyConnected && localStorage.getItem('spotify_token');

        if (!isActuallyConnected) {
            if (track.previewUrl) {
                playPreview(track);
            } else {
                alert(localStorage.getItem('spotify_token') 
                    ? 'Sua sessão do Spotify expirou. Por favor, recarregue a página.' 
                    : 'Conecte o Spotify para reproduzir músicas completas'
                );
            }
            return;
        }

        if (track.uri || track.spotifyUri) {
            onPlay ? onPlay() : playTrack(track);
        } else {
            alert('Esta música não está disponível no Spotify');
        }
    };

    const handlePreviewToggle = (e) => {
        e.stopPropagation();
        playPreview(track);
    };

    // --- 2. LÓGICA VISUAL (REFATORADA PARA BUSCAR IMAGEM ATIVAMENTE) ---
    const [finalImage, setFinalImage] = useState(null);
    const [isLoadingImage, setIsLoadingImage] = useState(true);
    const [imgLoaded, setImgLoaded] = useState(false);

    useEffect(() => {
        let isMounted = true;
        
        const resolveImage = async () => {
            setIsLoadingImage(true);

            // A. Tenta usar a imagem que já veio no objeto track (Prioridade)
            // Verifica Last.fm array, string direta ou objeto do Spotify
            let initialImage = null;
            
            if (track.imageUrl) initialImage = track.imageUrl;
            else if (typeof track.image === 'string' && track.image.length > 0) initialImage = track.image;
            else if (Array.isArray(track.image)) initialImage = track.image[3]?.['#text'] || track.image[2]?.['#text'];
            else if (track.album?.images?.[0]?.url) initialImage = track.album.images[0].url;

            // Se a imagem inicial for válida e não for o placeholder quebrado do Last.fm
            if (initialImage && !initialImage.includes('2a96cbd8b46e442fc41c2b86b821562f') && initialImage !== '') {
                setFinalImage(initialImage);
                setIsLoadingImage(false);
                return;
            }

            // B. Se não tem imagem, BUSCA NO DEEZER (Igual ao ArtistCard)
            try {
                const artistName = track.artist?.name || track.artist || '';
                const trackName = track.name || '';
                
                // Query precisa: artist:"Nome" track:"Nome"
                const query = encodeURIComponent(`artist:"${artistName}" track:"${trackName}"`);
                const targetUrl = `https://api.deezer.com/search?q=${query}&limit=1`;
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

                const res = await fetch(proxyUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0) {
                        const song = data.data[0];
                        // Pega a capa do álbum
                        const deezerImg = song.album?.cover_xl || song.album?.cover_big || song.album?.cover_medium;
                        if (isMounted && deezerImg) {
                            setFinalImage(deezerImg);
                            setIsLoadingImage(false);
                            return;
                        }
                    }
                }
            } catch (e) {
                // Falha silenciosa no Deezer, tenta iTunes
            }

            // C. Fallback final: iTunes
            try {
                const artistName = track.artist?.name || track.artist || '';
                const trackName = track.name || '';
                const searchTerm = encodeURIComponent(`${trackName} ${artistName}`);
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${searchTerm}&media=music&limit=1`);
                
                if (itunesRes.ok) {
                    const data = await itunesRes.json();
                    if (data.results && data.results.length > 0) {
                        // Pega imagem de alta resolução (substitui 100x100 por 600x600)
                        const itunesImg = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                        if (isMounted && itunesImg) {
                            setFinalImage(itunesImg);
                            setIsLoadingImage(false);
                            return;
                        }
                    }
                }
            } catch (e) {}

            if (isMounted) setIsLoadingImage(false);
        };

        resolveImage();

        return () => { isMounted = false; };
    }, [track]);

    // --- 3. RENDERIZAÇÃO ---
    return (
        <div className={`flex-shrink-0 w-36 group cursor-pointer ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
            
            <div className="relative mb-3 group/image">
                {/* Container da Imagem */}
                <div className="w-36 h-36 rounded-xl overflow-hidden bg-gradient-to-br from-green-500/30 to-accent-purple/30 shadow-lg relative border border-white/5">
                    
                    {/* Skeleton de Carregamento */}
                    {isLoadingImage && (
                        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center z-10">
                            <i className="ph-fill ph-spinner animate-spin text-2xl text-gray-500"></i>
                        </div>
                    )}

                    {/* Imagem Real */}
                    {finalImage && !isLoadingImage ? (
                        <>
                            <img 
                                src={finalImage} 
                                alt={track.name}
                                className={`w-full h-full object-cover transition-transform duration-300 ${imgLoaded ? 'group-hover/image:scale-105 opacity-100' : 'opacity-0'}`}
                                onLoad={() => setImgLoaded(true)}
                                loading="lazy"
                            />
                            {/* Fundo escuro enquanto a imagem decodifica o jpg */}
                            {!imgLoaded && <div className="absolute inset-0 bg-gray-800" />}
                        </>
                    ) : !isLoadingImage && (
                        // Fallback se NADA funcionar (Gradient Genérico)
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                            <i className="ph-fill ph-music-note text-5xl text-white/20"></i>
                        </div>
                    )}

                    {/* OVERLAY PLAY/PREVIEW (Sempre renderizado por cima) */}
                    <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px] z-20 ${isThisPreviewPlaying ? 'opacity-100' : ''}`}>
                        {hasPreview && (
                            <button
                                onClick={handlePreviewToggle}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg border border-white/20 ${
                                    isThisPreviewPlaying ? 'bg-blue-500 text-white' : 'bg-white/20 text-white hover:bg-blue-500 backdrop-blur-sm'
                                }`}
                                title="Ouvir prévia"
                            >
                                <i className={`ph-fill ${isThisPreviewPlaying ? 'ph-stop' : 'ph-speaker-high'} text-sm`}></i>
                            </button>
                        )}
                        <button
                            onClick={handlePlay}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg border border-white/20 ${
                                canPlay ? 'bg-green-500 text-white hover:bg-green-400' : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                            }`}
                            disabled={!canPlay && !hasPreview}
                            title={canPlay ? "Reproduzir no Spotify" : "Indisponível no Spotify"}
                        >
                            <i className={`ph-fill ${canPlay ? 'ph-play' : 'ph-spotify-logo'} text-lg ml-0.5`}></i>
                        </button>
                    </div>

                    {/* VISUAL EQ */}
                    {isThisPreviewPlaying && (
                        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-0.5 items-end h-3 pointer-events-none z-20">
                            <div className="w-1 bg-blue-400 animate-[bounce_1s_infinite] h-2"></div>
                            <div className="w-1 bg-blue-400 animate-[bounce_1.2s_infinite] h-3"></div>
                            <div className="w-1 bg-blue-400 animate-[bounce_0.8s_infinite] h-2"></div>
                        </div>
                    )}
                </div>

                {rank && (
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold text-sm shadow-lg z-30">
                        #{rank}
                    </div>
                )}
            </div>

            {/* Informações de Texto */}
            <h4 className="font-semibold text-white text-sm truncate group-hover:text-green-400 transition-colors" title={track.name}>
                {track.name}
            </h4>
            
            <p className="text-xs text-gray-500 truncate" title={track.artist?.name || track.artist}>
                {track.artist?.name || track.artist?.['#text'] || track.artist || 'Artista Desconhecido'}
            </p>
            
            <p className="text-xs text-gray-600 mt-0.5">
                {track.playcount ? `${Number(track.playcount).toLocaleString()} plays` : (track.album || '')}
            </p>
        </div>
    );
}