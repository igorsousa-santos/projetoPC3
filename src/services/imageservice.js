import useAuthStore from '../stores/authStore';

class ImageService {
    
    /**
     * Busca a melhor imagem possível para um ARTISTA.
     * Ordem: Spotify (HD) -> Deezer (HD) -> iTunes (Fallback)
     */
    async getArtistImage(artistName) {
        if (!artistName) return null;
        
        // 1. TENTA SPOTIFY (Requer Login/Token)
        const spotifyImage = await this.fetchFromSpotify(artistName);
        if (spotifyImage) return spotifyImage;

        // 2. TENTA DEEZER (Público via Proxy)
        const deezerImage = await this.fetchFromDeezer(artistName);
        if (deezerImage) return deezerImage;

        // 3. TENTA ITUNES (Via Capa de Álbum - Quebra-galho)
        const itunesImage = await this.fetchFromItunes(artistName);
        if (itunesImage) return itunesImage;

        return null;
    }

    // --- MÉTODOS INTERNOS ---

    async fetchFromSpotify(artistName) {
        try {
            const token = localStorage.getItem('spotify_token');
            if (!token) return null;

            const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const items = data.artists?.items;
                if (items && items.length > 0 && items[0].images.length > 0) {
                    return items[0].images[0].url; // Retorna a maior imagem
                }
            }
        } catch (e) {
            console.warn(`[ImageService] Erro Spotify para ${artistName}:`, e);
        }
        return null;
    }

    async fetchFromDeezer(artistName) {
        try {
            const query = encodeURIComponent(artistName);
            // Usa proxy para evitar CORS no navegador
            const targetUrl = `https://api.deezer.com/search/artist?q=${query}&limit=1`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const res = await fetch(proxyUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    const artist = data.data[0];
                    return artist.picture_xl || artist.picture_big || artist.picture_medium;
                }
            }
        } catch (e) {
            console.warn(`[ImageService] Erro Deezer para ${artistName}:`, e);
        }
        return null;
    }

    async fetchFromItunes(artistName) {
        try {
            // iTunes não tem busca direta de imagem de artista, busca um álbum dele
            const query = encodeURIComponent(artistName);
            const url = `https://itunes.apple.com/search?term=${query}&entity=album&limit=1`;
            
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // Pega a capa do álbum e aumenta a resolução
                    return data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                }
            }
        } catch (e) {
            // Silencioso
        }
        return null;
    }
}

export default new ImageService();