import { useState, useEffect } from 'react';

export default function RecommendedAlbumItem({ album }) {
    const [imageUrl, setImageUrl] = useState(null);

    useEffect(() => {
        let isMounted = true;
        // Se a imagem já vier populada do hook, usa ela
        const initial = album.image || album.imageUrl;
        if (initial && !initial.includes('2a96cbd8') && initial !== '') {
            setImageUrl(initial);
        }
        // Nota: O hook useForYouRecommendations já tenta buscar a melhor imagem.
        // Se ainda assim vier vazio, poderíamos tentar fetch aqui, mas vamos confiar no hook.
        
        return () => { isMounted = false; };
    }, [album]);

    return (
        <div className="flex-shrink-0 w-40 group cursor-pointer">
            <div className="w-40 h-40 rounded-xl overflow-hidden bg-gradient-to-br from-accent-blue/30 to-green-500/30 mb-3 relative shadow-lg">
                {imageUrl ? (
                    <img src={imageUrl} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <i className="ph-fill ph-vinyl-record text-4xl text-white/50"></i>
                    </div>
                )}
            </div>
            <h5 className="font-semibold text-white text-sm truncate">{album.name}</h5>
            <p className="text-xs text-gray-500 truncate">{album.artist}</p>
        </div>
    );
}