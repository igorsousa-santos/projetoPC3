import { useState, useEffect } from 'react';

export default function RecommendedArtistItem({ artist }) {
    const [imageUrl, setImageUrl] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const fetchImage = async () => {
            const initial = artist.image || artist.imageUrl;
            if (initial && !initial.includes('2a96cbd8') && initial !== '') {
                setImageUrl(initial);
                return;
            }

            try {
                const query = encodeURIComponent(artist.name);
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://api.deezer.com/search/artist?q=${query}&limit=1`)}`;
                const res = await fetch(proxyUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0) {
                        const img = data.data[0].picture_xl || data.data[0].picture_big || data.data[0].picture_medium;
                        if (isMounted) setImageUrl(img);
                    }
                }
            } catch (e) { }
        };
        fetchImage();
        return () => { isMounted = false; };
    }, [artist]);

    return (
        <div className="flex-shrink-0 w-36 group cursor-pointer">
            <div className="w-36 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-accent-purple/30 to-accent-blue/30 mb-3 relative shadow-lg">
                {imageUrl ? (
                    <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <i className="ph-fill ph-user text-4xl text-white/50"></i>
                    </div>
                )}
            </div>
            <h5 className="font-semibold text-white text-sm truncate">{artist.name}</h5>
            {artist.reason && <p className="text-xs text-gray-500 truncate">{artist.reason}</p>}
        </div>
    );
}