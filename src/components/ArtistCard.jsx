import { useState, useEffect } from 'react';

export default function ArtistCard({ artist, rank }) {
    const [imageUrl, setImageUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [imgLoaded, setImgLoaded] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (!artist?.name) { setIsLoading(false); return; }

        const fetchDeezerImage = async () => {
            // Se já veio com imagem boa do hook, usa ela
            if (artist.image && !artist.image.includes('2a96cbd8')) {
                 setImageUrl(artist.image);
                 setIsLoading(false);
                 return;
            }

            setIsLoading(true);
            try {
                const query = encodeURIComponent(artist.name);
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://api.deezer.com/search/artist?q=${query}&limit=1`)}`;
                const response = await fetch(proxyUrl);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.data && data.data.length > 0) {
                        const img = data.data[0].picture_xl || data.data[0].picture_big || data.data[0].picture_medium;
                        if (isMounted && img) setImageUrl(img);
                    }
                }
            } catch (error) {
                // Silencioso
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchDeezerImage();
        return () => { isMounted = false; };
    }, [artist]);

    return (
        <div className="flex-shrink-0 w-40 group cursor-pointer">
            <div className="relative mb-3">
                <div className="w-40 h-40 rounded-2xl overflow-hidden bg-gray-800 shadow-lg relative border border-white/5">
                    {isLoading && (
                        <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center z-10">
                            <i className="ph-fill ph-spinner animate-spin text-2xl text-gray-500"></i>
                        </div>
                    )}

                    {imageUrl && !isLoading ? (
                        <>
                            <img 
                                src={imageUrl} 
                                alt={artist.name}
                                className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                                onLoad={() => setImgLoaded(true)}
                                loading="lazy"
                            />
                            {!imgLoaded && <div className="absolute inset-0 bg-gray-800" />}
                        </>
                    ) : !isLoading && (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                            <span className="text-4xl font-bold text-white/20 uppercase">
                                {artist.name ? artist.name.charAt(0) : '?'}
                            </span>
                        </div>
                    )}
                </div>
                
                {rank && (
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md z-20">
                        #{rank}
                    </div>
                )}
            </div>
            
            <h4 className="font-semibold text-white truncate text-sm group-hover:text-blue-400 transition-colors text-center" title={artist.name}>
                {artist.name}
            </h4>
            <p className="text-xs text-gray-500 text-center mt-0.5">
                {artist.playcount ? `${Number(artist.playcount).toLocaleString()} scrobbles` : ''}
            </p>
        </div>
    );
}