import { useState } from 'react';

export default function AlbumCard({ album, rank, disabled = false }) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    
    const hasValidImage = album.image && 
        album.image !== '' && 
        !album.image.includes('2a96cbd8b46e442fc41c2b86b821562f') &&
        !imgError;

    return (
        <div className={`flex-shrink-0 w-44 group cursor-pointer ${disabled ? 'opacity-40 grayscale' : ''}`}>
            <div className="relative mb-3">
                <div className="w-44 h-44 rounded-xl overflow-hidden bg-gradient-to-br from-accent-blue/30 to-green-500/30 shadow-lg">
                    {hasValidImage ? (
                        <>
                            {!imgLoaded && (
                                <div className="w-full h-full flex items-center justify-center absolute inset-0">
                                    <i className="ph-fill ph-vinyl-record text-4xl text-gray-600 animate-pulse"></i>
                                </div>
                            )}
                            <img 
                                src={album.image} 
                                alt={album.name}
                                className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? '' : 'opacity-0'}`}
                                onError={() => setImgError(true)}
                                onLoad={() => setImgLoaded(true)}
                                loading="lazy"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-blue/40 to-green-500/40">
                            <i className="ph-fill ph-vinyl-record text-5xl text-white/60"></i>
                        </div>
                    )}
                </div>
                {rank && (
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        #{rank}
                    </div>
                )}
            </div>
            <h4 className="font-semibold text-white truncate group-hover:text-accent-blue transition-colors" title={album.name}>{album.name}</h4>
            <p className="text-sm text-gray-500 truncate" title={album.artist?.name || album.artist}>{album.artist?.name || album.artist}</p>
            <p className="text-xs text-gray-600">{album.playcount?.toLocaleString() || 0} plays</p>
        </div>
    );
}