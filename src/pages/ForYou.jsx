import { useState, useEffect } from 'react';

// Layout & Global Components
import Header from '../components/Layout/Header'; // Ajuste o caminho se necessário
import TrackListItem from '../components/Player/TrackListItem'; // Ajuste o caminho se necessário

// Stores
import useAuthStore from '../stores/authStore';
import useListeningHistoryStore from '../stores/listeningHistoryStore';
import usePlaylistStore from '../stores/playlistStore';
import useGamificationStore from '../stores/gamificationStore';

// Services
import lastfmService from '../services/lastfm';
import { aiAPI } from '../services/api';

// --- CUSTOM HOOKS (Criados na modularização) ---
import { useForYouStats } from '../hooks/useForYouStats';
import { useForYouRecommendations } from '../hooks/useForYouRecommendations';

// --- COMPONENTES LOCAIS (Criados na modularização) ---
import PeriodSelector from '../components/PeriodSelector';
import TabButton from '../components/TabButton';
import StatCard from '../components/StatCard';
import TrackCard from '../components/TrackCard';
import ArtistCard from '../components/ArtistCard';
import AlbumCard from '../components/AlbumCard';
import RecommendedArtistItem from '../components/RecommendedArtistItem';
import RecommendedAlbumItem from '../components/RecommendedAlbumItem';

// Configuração
const PERIOD_OPTIONS = [
    { id: '7day', label: '7 dias', type: 'preset' },
    { id: '1month', label: '1 mês', type: 'preset' },
    { id: '3month', label: '3 meses', type: 'preset' },
    { id: '6month', label: '6 meses', type: 'preset' },
    { id: '12month', label: '1 ano', type: 'preset' },
    { id: 'overall', label: 'Todo período', type: 'preset' },
];


export default function ForYou() {
    // --- GLOBAL STORE STATE ---
    const user = useAuthStore(state => state.user);
    const lastfmUser = useAuthStore(state => state.lastfmUser);
    const loginLastFM = useAuthStore(state => state.loginLastFM);
    const disconnectLastFM = useAuthStore(state => state.disconnectLastFM);
    const hasHistory = useListeningHistoryStore(state => state.hasHistory());
    const addPlaylist = usePlaylistStore(state => state.addPlaylist);

    // --- UI LOCAL STATE ---
    const [activeTab, setActiveTab] = useState('tracks'); // 'tracks' | 'artists' | 'albums'
    const [selectedPeriod, setSelectedPeriod] = useState('7day');
    const [availableWeeks, setAvailableWeeks] = useState([]);
    const [selectedWeek, setSelectedWeek] = useState(null);
    const [useGemini, setUseGemini] = useState(true);
    
    // Modal State
    const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
    const [playlistName, setPlaylistName] = useState('');

    // --- HOOK 1: ESTATÍSTICAS (Last.fm / Histórico) ---
    // Gerencia o carregamento da parte de cima (Stats)
    const { 
        isLoading, 
        error, 
        topTracks, 
        topArtists, 
        topAlbums, 
        recentTracks, 
        stats, 
        loadStats 
    } = useForYouStats(selectedPeriod, selectedWeek);

    // --- HOOK 2: RECOMENDAÇÕES (IA / Fallback) ---
    // Gerencia o carregamento da parte de baixo (Recomendações)
    // Monitora automaticamente 'topArtists' e 'useGemini'
    const { 
        isRecLoading, 
        recommendations, 
        musicalAnalysis, 
        generateRecommendations 
    } = useForYouRecommendations(topArtists, topTracks, selectedPeriod, selectedWeek, useGemini);

    // Carrega semanas disponíveis para o seletor
    useEffect(() => {
        if (lastfmUser) {
            lastfmService.getWeeklyChartList(lastfmUser)
                .then(setAvailableWeeks)
                .catch(err => console.warn('[ForYou] Failed to load weeks', err));
        }
    }, [lastfmUser]);

    // --- HELPER FUNCTIONS ---

    const handleCreatePlaylist = async () => {
        if (!playlistName.trim() || recommendations.tracks.length === 0) return;
        
        try {
            let description = `Playlist gerada pelo Music Horizon com ${recommendations.tracks.length} músicas.`;
            
            // Tenta gerar descrição com IA se possível
            if (useGemini) {
                try {
                    const descRes = await aiAPI.describePlaylist(playlistName, recommendations.tracks);
                    if (descRes.success) description = descRes.data.description;
                } catch (e) { /* Silent fail */ }
            }

            await addPlaylist({
                name: playlistName,
                description,
                tracks: recommendations.tracks,
                isPublic: false
            });

            useGamificationStore.getState().trackPlaylistCreated();

            setShowCreatePlaylist(false);
            setPlaylistName('');
            alert('Playlist criada com sucesso!');
        } catch (error) {
            alert('Erro ao criar playlist: ' + error.message);
        }
    };

    const formatTime = (seconds) => {
        if (!seconds) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const getPeriodLabel = () => {
        if (selectedWeek) {
            const from = new Date(parseInt(selectedWeek.from) * 1000);
            const to = new Date(parseInt(selectedWeek.to) * 1000);
            return `${from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${to.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
        }
        return PERIOD_OPTIONS.find(p => p.id === selectedPeriod)?.label || selectedPeriod;
    };

    // --- RENDER: EMPTY STATE ---
    if (!hasHistory && !lastfmUser) {
        return (
            <>
                <Header title="Para Você" />
                <div className="p-8 flex-1 flex items-center justify-center min-h-[80vh]">
                    <div className="text-center max-w-md">
                        <div className="w-24 h-24 bg-gradient-to-br from-accent-blue to-accent-purple rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-accent-purple/20">
                            <i className="ph-fill ph-headphones text-4xl text-white"></i>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-4">Descubra Novas Músicas</h2>
                        <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                            Conecte seu Last.fm para importar seu histórico musical e receber recomendações personalizadas com IA.
                        </p>
                        <div className="flex flex-col gap-4">
                            <button 
                                onClick={loginLastFM} 
                                className="btn-primary bg-[#d51007] hover:bg-[#ba0000] border-none text-white w-full py-4 text-lg shadow-lg"
                            >
                                <i className="ph-fill ph-lastfm-logo mr-3 text-xl"></i>
                                Conectar com Last.fm
                            </button>
                            <a href="/search" className="btn-secondary w-full py-4 text-lg">
                                <i className="ph ph-magnifying-glass mr-3 text-xl"></i>
                                Buscar Músicas
                            </a>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // --- RENDER: MAIN CONTENT ---
    return (
        <>
            <Header title="Para Você" />
            <div className="p-8 flex-1 space-y-8 pb-20">

                {/* 1. HERO SECTION */}
                <section className="relative rounded-3xl overflow-hidden p-8 min-h-[240px] flex flex-col justify-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-black to-black opacity-90 z-0"></div>
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent-blue/30 rounded-full blur-3xl z-0"></div>
                    <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-accent-purple/30 rounded-full blur-3xl z-0"></div>

                    <div className="relative z-10 flex justify-between items-start">
                        <div className="flex-1">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium text-white mb-4 backdrop-blur-md">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                {lastfmUser ? `Sincronizado: ${lastfmUser}` : 'Histórico Local'}
                                <span className="mx-1">•</span>
                                <span className="text-accent-purple">{getPeriodLabel()}</span>
                            </div>
                            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
                                Olá, {user?.name?.split(' ')[0] || 'Ouvinte'}
                            </h1>
                            <p className="text-lg text-gray-300 max-w-xl font-light">
                                {useGemini && import.meta.env.VITE_GEMINI_API_KEY
                                    ? '🤖 Recomendações geradas por IA baseadas no seu gosto musical.'
                                    : 'Recomendações baseadas nos seus artistas favoritos.'
                                }
                            </p>
                            
                            {musicalAnalysis?.mainGenres && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {musicalAnalysis.mainGenres.map((genre, i) => (
                                        <span key={i} className="px-3 py-1 rounded-full bg-accent-purple/20 text-accent-purple text-sm">
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            {!lastfmUser ? (
                                <button onClick={loginLastFM} className="btn-primary bg-[#d51007] hover:bg-[#ba0000] border-none text-white">
                                    <i className="ph-fill ph-lastfm-logo mr-2"></i> Conectar Last.fm
                                </button>
                            ) : (
                                <button onClick={disconnectLastFM} className="btn-secondary hover:bg-red-500/10 hover:text-red-400 text-sm">
                                    <i className="ph ph-sign-out mr-2"></i> Desconectar
                                </button>
                            )}
                            <button onClick={loadStats} disabled={isLoading} className="btn-secondary text-sm">
                                <i className={`ph ph-arrows-clockwise mr-2 ${isLoading ? 'animate-spin' : ''}`}></i>
                                Atualizar
                            </button>
                        </div>
                    </div>
                </section>

                {/* 2. LAYOUT GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* LEFT SIDEBAR */}
                    {/* LEFT SIDEBAR */}
<div className="lg:col-span-1 space-y-6">
    <PeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        availableWeeks={availableWeeks}
        onWeekSelect={setSelectedWeek}
        selectedWeek={selectedWeek}
        PERIOD_OPTIONS={PERIOD_OPTIONS}
    />

    {/* AI Toggle - REMOVIDA A CONDIÇÃO QUE ESCONDIA A CAIXA */}
    <div className="bg-dark-card/50 border border-white/5 rounded-2xl p-4">
        <label className="flex items-center justify-between cursor-pointer">
            <span className="text-white flex items-center gap-2">
                <i className="ph ph-robot text-xl text-accent-purple"></i>
                Usar IA
            </span>
            <input 
                type="checkbox" 
                checked={useGemini} 
                onChange={(e) => setUseGemini(e.target.checked)}
                className="w-5 h-5 rounded accent-accent-purple"
            />
        </label>
        <p className="text-xs text-gray-500 mt-2">
            Recomendações mais criativas e inteligentes.
        </p>
        
        {/* Opcional: Aviso visual se a chave não estiver configurada */}
        {!import.meta.env.VITE_GEMINI_API_KEY && (
            <p className="text-xs text-red-400 mt-2 font-semibold">
                ⚠ API Key não detectada
            </p>
        )}
    </div>

    {/* Recent Tracks */}
    <div className="bg-dark-card/50 border border-white/5 rounded-2xl p-4">
        <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
            <i className="ph-fill ph-clock-counter-clockwise text-accent-blue"></i>
            Recentes
        </h4>
        <div className="space-y-1">
            {recentTracks.length > 0 ? (
                recentTracks.slice(0, 6).map((track, index) => (
                    <TrackListItem key={`recent-${track.id}-${index}`} track={track} index={index} compact />
                ))
            ) : (
                <p className="text-gray-500 text-center py-4 text-sm">Nada ouvido recentemente</p>
            )}
        </div>
    </div>
</div>

                    {/* MAIN CONTENT AREA */}
                    <div className="lg:col-span-3 space-y-8">
                        
                        {/* A. Stats Cards */}
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard
                                icon="ph-music-notes"
                                value={stats.totalScrobbles?.toLocaleString() || 0}
                                label={`Scrobbles (${getPeriodLabel()})`}
                                color="text-accent-blue"
                            />
                            <StatCard
                                icon="ph-crown"
                                value={stats.topArtist || '-'}
                                label="Artista #1"
                                color="text-accent-purple"
                            />
                            <StatCard
                                icon="ph-clock"
                                value={formatTime(stats.totalListeningTime)}
                                label="Tempo Estimado"
                                color="text-green-400"
                            />
                        </section>

                        {/* B. Top Content Tabs (Mais Ouvidos) */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white">Mais Ouvidos</h3>
                                <div className="flex gap-2">
                                    <TabButton 
                                        active={activeTab === 'tracks'} 
                                        icon="ph-music-note" 
                                        label="Faixas" 
                                        count={topTracks.length}
                                        onClick={() => setActiveTab('tracks')} 
                                    />
                                    <TabButton 
                                        active={activeTab === 'artists'} 
                                        icon="ph-user" 
                                        label="Artistas" 
                                        count={topArtists.length}
                                        onClick={() => setActiveTab('artists')} 
                                    />
                                    <TabButton 
                                        active={activeTab === 'albums'} 
                                        icon="ph-vinyl-record" 
                                        label="Álbuns" 
                                        count={topAlbums.length}
                                        onClick={() => setActiveTab('albums')} 
                                    />
                                </div>
                            </div>

                            {/* Loading State APENAS para Stats */}
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-12 h-12 border-4 border-accent-purple border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-gray-400 mt-4 animate-pulse">Carregando histórico...</p>
                                </div>
                            ) : error ? (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                                    <p className="text-red-400 mb-2">{error}</p>
                                    <button onClick={loadStats} className="text-sm text-white underline">Tentar novamente</button>
                                </div>
                            ) : (
                                <>
                                    {/* Top Tracks List */}
                                    {activeTab === 'tracks' && (
                                        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                                            {topTracks.length > 0 ? (
                                                topTracks.map((track, i) => (
                                                    <TrackCard key={`top-track-${i}`} track={track} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhuma faixa encontrada</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Top Artists List */}
                                    {activeTab === 'artists' && (
                                        <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                                            {topArtists.length > 0 ? (
                                                topArtists.map((artist, i) => (
                                                    <ArtistCard key={`top-artist-${i}`} artist={artist} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhum artista encontrado</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Top Albums List */}
                                    {activeTab === 'albums' && (
                                        <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
                                            {topAlbums.length > 0 ? (
                                                topAlbums.map((album, i) => (
                                                    <AlbumCard key={`top-album-${i}`} album={album} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhum álbum encontrado</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        {/* C. Recommendations Section */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                                    <i className="ph-fill ph-sparkle text-yellow-400"></i>
                                    Recomendado Para Você
                                    {useGemini && <span className="text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white px-2 py-1 rounded-full ml-2">IA</span>}
                                </h3>
                                {recommendations.tracks.length > 0 && !isRecLoading && (
                                    <button onClick={() => setShowCreatePlaylist(true)} className="btn-primary text-sm">
                                        <i className="ph ph-playlist mr-2"></i> Criar Playlist
                                    </button>
                                )}
                            </div>

                            {/* Loading State APENAS para Recomendações */}
                            {isRecLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="w-10 h-10 border-4 border-accent-purple border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p className="text-gray-400 animate-pulse">
                                        {useGemini ? 'A Inteligência Artificial está analisando seu gosto musical...' : 'Buscando recomendações...'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* 1. Faixas */}
                                    {recommendations.tracks.length > 0 && (
    <div className="animate-fade-in">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <i className="ph-fill ph-music-note text-green-400"></i>
            Faixas Recomendadas 
            <span className="text-xs text-gray-500 font-normal ml-1 border border-white/10 px-2 py-0.5 rounded-full">
                {recommendations.tracks.length}
            </span>
        </h4>
        
        {/* CONTAINER DE SCROLL VERTICAL */}
        <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* REMOVIDO O .slice(0, 12). Agora mostra TODAS. */}
                {recommendations.tracks.map((track, index) => (
                    <div key={track.id || index}>
                        <TrackListItem track={track} index={index} />
                    </div>
                ))}
            </div>
        </div>
    </div>
)}

                                    {/* 2. Álbuns */}
                                    {recommendations.albums.length > 0 && (
                                        <div className="animate-fade-in delay-100">
                                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                                <i className="ph-fill ph-disc text-accent-blue"></i>
                                                Álbuns Sugeridos
                                            </h4>
                                            <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
                                                {recommendations.albums.map((album, i) => (
                                                    <RecommendedAlbumItem key={`rec-album-${i}`} album={album} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Artistas */}
                                    {recommendations.artists.length > 0 && (
                                        <div className="animate-fade-in delay-200">
                                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                                <i className="ph-fill ph-user text-accent-purple"></i>
                                                Artistas Para Descobrir
                                            </h4>
                                            <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                                                {recommendations.artists.map((artist, i) => (
                                                    <RecommendedArtistItem key={`rec-artist-${i}`} artist={artist} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Empty / Error State (Apenas Rec) */}
                                    {recommendations.tracks.length === 0 && 
                                     recommendations.artists.length === 0 && 
                                     recommendations.albums.length === 0 && (
                                        <div className="text-center py-12 text-gray-500 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                                            <i className="ph ph-robot text-5xl mb-4 opacity-50 text-red-400"></i>
                                            <p className="text-lg text-gray-300">Não foi possível gerar recomendações.</p>
                                            <p className="text-sm text-gray-500 mb-4">
                                                {useGemini ? 'A IA pode estar indisponível no momento.' : 'Tente ouvir mais músicas para gerar dados.'}
                                            </p>
                                            <button onClick={generateRecommendations} className="btn-secondary text-sm">
                                                Tentar novamente
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    </div>
                </div>
            </div>

            {/* Create Playlist Modal */}
            {showCreatePlaylist && (
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
                            {recommendations.tracks.length} músicas serão adicionadas
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowCreatePlaylist(false)} className="btn-secondary flex-1">
                                Cancelar
                            </button>
                            <button onClick={handleCreatePlaylist} className="btn-primary flex-1">
                                Criar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}