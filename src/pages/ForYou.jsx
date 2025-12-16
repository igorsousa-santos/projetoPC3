import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Layout/Header';
import TrackListItem from '../components/Player/TrackListItem';
import useAuthStore from '../stores/authStore';
import useListeningHistoryStore from '../stores/listeningHistoryStore';
import usePlaylistStore from '../stores/playlistStore';
import lastfmService from '../services/lastfm';
import itunesService from '../services/itunes';
import geminiService from '../services/gemini';

// Period configurations
const PERIOD_OPTIONS = [
    { id: '7day', label: '7 dias', type: 'preset' },
    { id: '1month', label: '1 mês', type: 'preset' },
    { id: '3month', label: '3 meses', type: 'preset' },
    { id: '6month', label: '6 meses', type: 'preset' },
    { id: '12month', label: '1 ano', type: 'preset' },
    { id: 'overall', label: 'Todo período', type: 'preset' },
];

// Stat Card Component
function StatCard({ icon, value, label, color }) {
    return (
        <div className="bg-dark-card/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm hover:border-white/10 transition-all">
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${color}`}>
                    <i className={`ph-fill ${icon} text-2xl`}></i>
                </div>
                <div>
                    <p className="text-2xl font-bold text-white">{value}</p>
                    <p className="text-sm text-gray-400">{label}</p>
                </div>
            </div>
        </div>
    );
}

// Artist Card Component with better image handling
function ArtistCard({ artist, rank, disabled = false }) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    
    const hasValidImage = artist.image && 
        artist.image !== '' && 
        !artist.image.includes('2a96cbd8b46e442fc41c2b86b821562f') && // Last.fm default
        !imgError;

    return (
        <div className={`flex-shrink-0 w-40 group cursor-pointer ${disabled ? 'opacity-40 grayscale' : ''}`}>
            <div className="relative mb-3">
                <div className="w-40 h-40 rounded-2xl overflow-hidden bg-gradient-to-br from-accent-purple/30 to-accent-blue/30">
                    {hasValidImage ? (
                        <>
                            {!imgLoaded && (
                                <div className="w-full h-full flex items-center justify-center absolute inset-0">
                                    <i className="ph-fill ph-user text-4xl text-gray-600 animate-pulse"></i>
                                </div>
                            )}
                            <img 
                                src={artist.image} 
                                alt={artist.name}
                                className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? '' : 'opacity-0'}`}
                                onError={() => setImgError(true)}
                                onLoad={() => setImgLoaded(true)}
                                loading="lazy"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-purple/40 to-accent-blue/40">
                            <i className="ph-fill ph-user text-5xl text-white/60"></i>
                        </div>
                    )}
                </div>
                {rank && (
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-lg bg-accent-purple flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        #{rank}
                    </div>
                )}
            </div>
            <h4 className="font-semibold text-white truncate group-hover:text-accent-blue transition-colors">{artist.name}</h4>
            <p className="text-sm text-gray-500">{artist.playcount?.toLocaleString() || artist.count?.toLocaleString() || 0} plays</p>
        </div>
    );
}

// Album Card Component
function AlbumCard({ album, rank, disabled = false }) {
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
            <h4 className="font-semibold text-white truncate group-hover:text-accent-blue transition-colors">{album.name}</h4>
            <p className="text-sm text-gray-500 truncate">{album.artist?.name || album.artist}</p>
            <p className="text-xs text-gray-600">{album.playcount?.toLocaleString() || 0} plays</p>
        </div>
    );
}

// Track Card Component for horizontal scroll
function TrackCard({ track, rank, disabled = false }) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    
    const imageUrl = track.image?.[2]?.['#text'] || track.image?.[3]?.['#text'] || track.imageUrl;
    const hasValidImage = imageUrl && 
        imageUrl !== '' && 
        !imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f') &&
        !imgError;

    return (
        <div className={`flex-shrink-0 w-36 group cursor-pointer ${disabled ? 'opacity-40 grayscale' : ''}`}>
            <div className="relative mb-3">
                <div className="w-36 h-36 rounded-xl overflow-hidden bg-gradient-to-br from-green-500/30 to-accent-purple/30 shadow-lg">
                    {hasValidImage ? (
                        <>
                            {!imgLoaded && (
                                <div className="w-full h-full flex items-center justify-center absolute inset-0">
                                    <i className="ph-fill ph-music-note text-4xl text-gray-600 animate-pulse"></i>
                                </div>
                            )}
                            <img 
                                src={imageUrl} 
                                alt={track.name}
                                className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? '' : 'opacity-0'}`}
                                onError={() => setImgError(true)}
                                onLoad={() => setImgLoaded(true)}
                                loading="lazy"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500/40 to-accent-purple/40">
                            <i className="ph-fill ph-music-note text-5xl text-white/60"></i>
                        </div>
                    )}
                </div>
                {rank && (
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        #{rank}
                    </div>
                )}
            </div>
            <h4 className="font-semibold text-white text-sm truncate group-hover:text-green-400 transition-colors">{track.name}</h4>
            <p className="text-xs text-gray-500 truncate">{track.artist?.name || track.artist?.['#text'] || track.artist}</p>
            <p className="text-xs text-gray-600">{track.playcount?.toLocaleString() || 0} plays</p>
        </div>
    );
}

// Period Selector Component
function PeriodSelector({ selectedPeriod, onPeriodChange, availableWeeks, onWeekSelect, selectedWeek }) {
    const [showCustom, setShowCustom] = useState(false);
    const [customYear, setCustomYear] = useState(new Date().getFullYear());
    const [customMonth, setCustomMonth] = useState(new Date().getMonth());

    // Group weeks by year and month
    const weeksByPeriod = useMemo(() => {
        if (!availableWeeks?.length) return {};
        
        const grouped = {};
        availableWeeks.forEach(week => {
            const date = new Date(parseInt(week.from) * 1000);
            const year = date.getFullYear();
            const month = date.getMonth();
            const key = `${year}-${month}`;
            
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(week);
        });
        return grouped;
    }, [availableWeeks]);

    const years = Object.keys(weeksByPeriod).sort((a, b) => b - a);
    const months = weeksByPeriod[customYear] ? Object.keys(weeksByPeriod[customYear]).sort((a, b) => b - a) : [];

    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return (
        <div className="bg-dark-card/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <i className="ph ph-calendar text-accent-purple"></i>
                Período
            </h4>
            
            {/* Preset periods */}
            <div className="flex flex-wrap gap-2 mb-4">
                {PERIOD_OPTIONS.map(option => (
                    <button
                        key={option.id}
                        onClick={() => {
                            onPeriodChange(option.id);
                            onWeekSelect(null);
                            setShowCustom(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            selectedPeriod === option.id && !selectedWeek
                                ? 'bg-accent-purple text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
                <button
                    onClick={() => setShowCustom(!showCustom)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        showCustom || selectedWeek
                            ? 'bg-accent-blue text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                >
                    <i className="ph ph-calendar-blank mr-1"></i>
                    Personalizado
                </button>
            </div>

            {/* Custom period selector */}
            {showCustom && availableWeeks?.length > 0 && (
                <div className="border-t border-white/5 pt-4 space-y-3">
                    <div className="flex gap-2">
                        <select
                            value={customYear}
                            onChange={(e) => setCustomYear(parseInt(e.target.value))}
                            className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm"
                        >
                            {years.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                        <select
                            value={customMonth}
                            onChange={(e) => setCustomMonth(parseInt(e.target.value))}
                            className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm"
                        >
                            {months.map(month => (
                                <option key={month} value={month}>{monthNames[month]}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Available weeks for selected month */}
                    {weeksByPeriod[customYear]?.[customMonth] && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            <p className="text-xs text-gray-500 mb-2">Semanas disponíveis:</p>
                            {weeksByPeriod[customYear][customMonth].map((week, i) => {
                                const fromDate = new Date(parseInt(week.from) * 1000);
                                const toDate = new Date(parseInt(week.to) * 1000);
                                const isSelected = selectedWeek?.from === week.from;
                                
                                return (
                                    <button
                                        key={i}
                                        onClick={() => onWeekSelect(week)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                            isSelected
                                                ? 'bg-accent-blue text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        {fromDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {toDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {selectedWeek && (
                <div className="mt-3 p-2 bg-accent-blue/10 rounded-lg">
                    <p className="text-xs text-accent-blue">
                        Período selecionado: {new Date(parseInt(selectedWeek.from) * 1000).toLocaleDateString('pt-BR')} - {new Date(parseInt(selectedWeek.to) * 1000).toLocaleDateString('pt-BR')}
                    </p>
                </div>
            )}
        </div>
    );
}

// Tab Button Component
function TabButton({ active, icon, label, count, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                active
                    ? 'bg-accent-purple text-white shadow-lg shadow-accent-purple/20'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
        >
            <i className={`ph-fill ${icon}`}></i>
            {label}
            {count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-white/10'}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

export default function ForYou() {
    const user = useAuthStore(state => state.user);
    const lastfmUser = useAuthStore(state => state.lastfmUser);
    const loginLastFM = useAuthStore(state => state.loginLastFM);
    const disconnectLastFM = useAuthStore(state => state.disconnectLastFM);
    
    const hasHistory = useListeningHistoryStore(state => state.hasHistory());
    const getTopArtistsLocal = useListeningHistoryStore(state => state.getTopArtists);
    const getRecentTracksLocal = useListeningHistoryStore(state => state.getRecentTracks);
    const getListeningStats = useListeningHistoryStore(state => state.getListeningStats);
    
    const addPlaylist = usePlaylistStore(state => state.addPlaylist);

    // State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('tracks'); // 'tracks' | 'artists' | 'albums'
    
    // Data states
    const [topTracks, setTopTracks] = useState([]);
    const [topArtists, setTopArtists] = useState([]);
    const [topAlbums, setTopAlbums] = useState([]);
    const [recentTracks, setRecentTracks] = useState([]);
    const [recommendations, setRecommendations] = useState({ tracks: [], artists: [], albums: [] });
    
    // Stats
    const [stats, setStats] = useState({ totalScrobbles: 0, topArtist: '-', totalListeningTime: 0 });
    const [userInfo, setUserInfo] = useState(null);
    
    // Period selection
    const [selectedPeriod, setSelectedPeriod] = useState('7day');
    const [availableWeeks, setAvailableWeeks] = useState([]);
    const [selectedWeek, setSelectedWeek] = useState(null);
    
    // AI
    const [musicalAnalysis, setMusicalAnalysis] = useState(null);
    const [useGemini, setUseGemini] = useState(true);
    
    // Modal
    const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
    const [playlistName, setPlaylistName] = useState('');

    // Load available weeks for custom period selection
    const loadAvailableWeeks = async () => {
        if (!lastfmUser) return;
        try {
            const weeks = await lastfmService.getWeeklyChartList(lastfmUser);
            setAvailableWeeks(weeks);
        } catch (err) {
            console.warn('[ForYou] Could not load weekly charts:', err);
        }
    };

    // Main data loader
    const loadData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (lastfmUser) {
                console.log('[ForYou] Loading data for:', lastfmUser, 'Period:', selectedPeriod, 'Week:', selectedWeek);

                // Load user info
                const info = await lastfmService.getUserInfo(lastfmUser);
                setUserInfo(info);

                let artistsData, tracksData, albumsData;

                if (selectedWeek) {
                    // Load weekly charts for custom period
                    [artistsData, tracksData, albumsData] = await Promise.all([
                        lastfmService.getWeeklyArtistChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                        lastfmService.getWeeklyTrackChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                        lastfmService.getWeeklyAlbumChart(lastfmUser, selectedWeek.from, selectedWeek.to),
                    ]);
                } else {
                    // Load standard period data
                    [artistsData, tracksData, albumsData] = await Promise.all([
                        lastfmService.getTopArtists(lastfmUser, 20, selectedPeriod),
                        lastfmService.getTopTracks(lastfmUser, 20, selectedPeriod),
                        lastfmService.getTopAlbums(lastfmUser, 20, selectedPeriod),
                    ]);
                }

                // Load recent tracks (always current)
                const recentData = await lastfmService.getRecentTracks(lastfmUser, 10);

                // Process artists - fetch better images
                const processedArtists = await Promise.all(
                    artistsData.slice(0, 15).map(async (a) => {
                        let image = a.image?.[3]?.['#text'] || a.image?.[2]?.['#text'];
                        
                        // If no image or default image, try to get from artist info
                        if (!image || image.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                            try {
                                const artistInfo = await lastfmService.getArtistInfo(a.name);
                                image = artistInfo?.image?.[4]?.['#text'] || artistInfo?.image?.[3]?.['#text'] || image;
                            } catch (e) {
                                // Keep original image
                            }
                        }
                        
                        return {
                            name: a.name,
                            playcount: parseInt(a.playcount) || 0,
                            image: image,
                            mbid: a.mbid
                        };
                    })
                );
                setTopArtists(processedArtists);

                // Process tracks - fetch images from iTunes if needed
                const processedTracks = await Promise.all(
                    tracksData.slice(0, 20).map(async (t) => {
                        const artistName = t.artist?.name || t.artist?.['#text'] || t.artist;
                        let imageUrl = t.image?.[2]?.['#text'] || t.image?.[3]?.['#text'];
                        
                        // If no valid image, try iTunes
                        if (!imageUrl || imageUrl === '' || imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                            try {
                                const itunesData = await itunesService.searchTrack(t.name, artistName);
                                if (itunesData?.imageUrl) {
                                    imageUrl = itunesData.imageUrl;
                                }
                            } catch (e) {
                                // Silent fail
                            }
                        }
                        
                        return {
                            name: t.name,
                            artist: artistName,
                            playcount: parseInt(t.playcount) || 0,
                            image: t.image,
                            imageUrl: imageUrl,
                            mbid: t.mbid
                        };
                    })
                );
                setTopTracks(processedTracks);

                // Process albums - fetch images from iTunes if needed
                const processedAlbums = await Promise.all(
                    albumsData.slice(0, 15).map(async (a) => {
                        const artistName = a.artist?.name || a.artist?.['#text'] || a.artist;
                        let image = a.image?.[3]?.['#text'] || a.image?.[2]?.['#text'];
                        
                        // If no valid image, try to get album info or iTunes
                        if (!image || image === '' || image.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                            try {
                                // Try Last.fm album info first
                                const albumInfo = await lastfmService.getAlbumInfo(a.name, artistName);
                                image = albumInfo?.image?.[4]?.['#text'] || albumInfo?.image?.[3]?.['#text'];
                                
                                // If still no image, try iTunes
                                if (!image || image.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                                    const itunesData = await itunesService.searchTrack(a.name, artistName);
                                    if (itunesData?.imageUrl) {
                                        image = itunesData.imageUrl;
                                    }
                                }
                            } catch (e) {
                                // Silent fail
                            }
                        }
                        
                        return {
                            name: a.name,
                            artist: artistName,
                            playcount: parseInt(a.playcount) || 0,
                            image: image,
                            mbid: a.mbid
                        };
                    })
                );
                setTopAlbums(processedAlbums);

                // Process recent tracks - fetch images from iTunes if needed
                const processedRecent = await Promise.all(
                    recentData.map(async (t) => {
                        const artistName = t.artist?.['#text'] || t.artist?.name || t.artist;
                        let imageUrl = t.image?.[2]?.['#text'] || t.image?.[1]?.['#text'];
                        
                        // If no valid image, try iTunes
                        if (!imageUrl || imageUrl === '' || imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                            try {
                                const itunesData = await itunesService.searchTrack(t.name, artistName);
                                if (itunesData?.imageUrl) {
                                    imageUrl = itunesData.imageUrl;
                                }
                            } catch (e) {
                                // Silent fail
                            }
                        }
                        
                        return {
                            id: t.mbid || `${t.name}-${artistName}`,
                            name: t.name,
                            artist: artistName,
                            imageUrl: imageUrl
                        };
                    })
                );
                setRecentTracks(processedRecent);

                // Stats
                const periodScrobbles = tracksData.reduce((sum, t) => sum + (parseInt(t.playcount) || 0), 0);
                setStats({
                    totalScrobbles: periodScrobbles,
                    topArtist: processedArtists[0]?.name || '-',
                    totalListeningTime: Math.round(periodScrobbles * 3.5 * 60) // Estimate: avg 3.5 min per track
                });

                // Generate AI recommendations
                if (useGemini && import.meta.env.VITE_GEMINI_API_KEY && processedArtists.length > 0) {
                    try {
                        console.log('[ForYou] Generating AI recommendations...');
                        
                        const [trackSuggestions, analysis] = await Promise.all([
                            geminiService.generatePlaylistSuggestions(processedArtists, processedTracks, 20),
                            geminiService.analyzeMusicalTaste(processedArtists, processedTracks)
                        ]);
                        
                        // Enrich track suggestions with images
                        const enrichedTracks = await Promise.all(
                            trackSuggestions.map(async (s, index) => {
                                try {
                                    const searchData = await lastfmService.searchTrack(`${s.name} ${s.artist}`, 1);
                                    const trackInfo = (searchData.tracks || searchData)[0];
                                    return {
                                        id: `rec-${index}`,
                                        name: s.name,
                                        artist: s.artist,
                                        reason: s.reason,
                                        imageUrl: trackInfo?.image?.[2]?.['#text'] || null
                                    };
                                } catch {
                                    return { id: `rec-${index}`, name: s.name, artist: s.artist, reason: s.reason, imageUrl: null };
                                }
                            })
                        );

                        // Generate artist recommendations from similar artists
                        const artistRecs = [];
                        for (const artist of processedArtists.slice(0, 3)) {
                            try {
                                const similar = await lastfmService.getSimilarArtists(artist.name, 5);
                                for (const sim of similar) {
                                    if (!processedArtists.find(a => a.name.toLowerCase() === sim.name.toLowerCase())) {
                                        const info = await lastfmService.getArtistInfo(sim.name);
                                        artistRecs.push({
                                            name: sim.name,
                                            image: info?.image?.[4]?.['#text'] || info?.image?.[3]?.['#text'],
                                            reason: `Similar a ${artist.name}`
                                        });
                                    }
                                }
                            } catch (e) {
                                console.warn('Error getting similar artists:', e);
                            }
                        }

                        // Generate album recommendations
                        const albumRecs = [];
                        for (const track of enrichedTracks.slice(0, 5)) {
                            try {
                                const trackInfo = await lastfmService.getTrackInfo(track.name, track.artist);
                                if (trackInfo?.album) {
                                    albumRecs.push({
                                        name: trackInfo.album.title || trackInfo.album,
                                        artist: track.artist,
                                        image: trackInfo.album.image?.[3]?.['#text'] || trackInfo.album.image?.[2]?.['#text'],
                                        reason: `Por causa de "${track.name}"`
                                    });
                                }
                            } catch (e) {
                                // Skip
                            }
                        }

                        setRecommendations({
                            tracks: enrichedTracks,
                            artists: artistRecs.slice(0, 10),
                            albums: albumRecs.slice(0, 10)
                        });
                        setMusicalAnalysis(analysis);

                    } catch (geminiError) {
                        console.error('[ForYou] AI error:', geminiError);
                        await loadFallbackRecommendations(processedArtists);
                    }
                } else {
                    await loadFallbackRecommendations(processedArtists);
                }

            } else if (hasHistory) {
                // Local history fallback
                const localArtists = getTopArtistsLocal(10);
                const localRecent = getRecentTracksLocal(10);
                const localStats = getListeningStats();

                setTopArtists(localArtists.map(a => ({ name: a.artist, playcount: a.count, image: null })));
                setRecentTracks(localRecent);
                setStats(localStats);
                setTopTracks([]);
                setTopAlbums([]);
            }
        } catch (err) {
            console.error('[ForYou] Error:', err);
            setError(err.message || 'Erro ao carregar dados');
        } finally {
            setIsLoading(false);
        }
    };

    // Fallback recommendations from Last.fm
    const loadFallbackRecommendations = async (artists) => {
        try {
            const trackRecs = [];
            const artistRecs = [];
            
            for (const artist of artists.slice(0, 5)) {
                const similar = await lastfmService.getSimilarArtists(artist.name, 3);
                
                for (const simArtist of similar) {
                    // Add artist recommendation
                    if (!artists.find(a => a.name.toLowerCase() === simArtist.name.toLowerCase())) {
                        const info = await lastfmService.getArtistInfo(simArtist.name);
                        artistRecs.push({
                            name: simArtist.name,
                            image: info?.image?.[4]?.['#text'] || info?.image?.[3]?.['#text'],
                            reason: `Similar a ${artist.name}`
                        });
                    }
                    
                    // Add track recommendations
                    try {
                        const tracks = await lastfmService.getTopTracksByArtist(simArtist.name, 2);
                        trackRecs.push(...tracks.map(t => ({
                            id: t.mbid || `${t.name}-${simArtist.name}`,
                            name: t.name,
                            artist: simArtist.name,
                            imageUrl: t.image?.[2]?.['#text']
                        })));
                    } catch (e) {
                        // Skip
                    }
                }
            }

            setRecommendations({
                tracks: trackRecs.slice(0, 20),
                artists: artistRecs.slice(0, 10),
                albums: []
            });
        } catch (error) {
            console.error('[ForYou] Fallback error:', error);
        }
    };

    // Create playlist from recommendations
    const handleCreatePlaylist = async () => {
        if (!playlistName.trim() || recommendations.tracks.length === 0) return;
        
        try {
            let description = `Playlist gerada pelo Music Horizon com ${recommendations.tracks.length} músicas.`;
            
            if (import.meta.env.VITE_GEMINI_API_KEY) {
                try {
                    description = await geminiService.generatePlaylistDescription(playlistName, recommendations.tracks);
                } catch (e) {
                    console.warn('Could not generate AI description:', e);
                }
            }

            await addPlaylist({
                name: playlistName,
                description,
                tracks: recommendations.tracks,
                isPublic: false
            });

            setShowCreatePlaylist(false);
            setPlaylistName('');
            alert('Playlist criada com sucesso!');
        } catch (error) {
            alert('Erro ao criar playlist: ' + error.message);
        }
    };

    // Effects
    useEffect(() => {
        loadAvailableWeeks();
    }, [lastfmUser]);

    useEffect(() => {
        if (lastfmUser || hasHistory) {
            loadData();
        }
    }, [lastfmUser, hasHistory, selectedPeriod, selectedWeek, useGemini]);

    // Format time
    const formatTime = (seconds) => {
        if (!seconds) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    // Get period label
    const getPeriodLabel = () => {
        if (selectedWeek) {
            const from = new Date(parseInt(selectedWeek.from) * 1000);
            const to = new Date(parseInt(selectedWeek.to) * 1000);
            return `${from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${to.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
        }
        return PERIOD_OPTIONS.find(p => p.id === selectedPeriod)?.label || selectedPeriod;
    };

    // Empty State
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
                        
                        <div className="mt-8 p-4 bg-dark-card rounded-xl border border-dark-border">
                            <p className="text-sm text-gray-500">
                                <i className="ph ph-info mr-2"></i>
                                O Last.fm rastreia suas músicas automaticamente do Spotify, Apple Music e outros players.
                            </p>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="Para Você" />
            <div className="p-8 flex-1 space-y-8 pb-20">

                {/* Hero Section */}
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
                                    <i className="ph-fill ph-lastfm-logo mr-2"></i>
                                    Conectar Last.fm
                                </button>
                            ) : (
                                <button onClick={disconnectLastFM} className="btn-secondary hover:bg-red-500/10 hover:text-red-400 text-sm">
                                    <i className="ph ph-sign-out mr-2"></i>
                                    Desconectar
                                </button>
                            )}
                            <button onClick={loadData} disabled={isLoading} className="btn-secondary text-sm">
                                <i className={`ph ph-arrows-clockwise mr-2 ${isLoading ? 'animate-spin' : ''}`}></i>
                                Atualizar
                            </button>
                        </div>
                    </div>
                </section>

                {/* Main Layout - Sidebar + Content */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* Left Sidebar - Filters */}
                    <div className="lg:col-span-1 space-y-6">
                        <PeriodSelector
                            selectedPeriod={selectedPeriod}
                            onPeriodChange={setSelectedPeriod}
                            availableWeeks={availableWeeks}
                            onWeekSelect={setSelectedWeek}
                            selectedWeek={selectedWeek}
                        />

                        {/* AI Toggle */}
                        {import.meta.env.VITE_GEMINI_API_KEY && (
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
                                    Recomendações mais criativas
                                </p>
                            </div>
                        )}

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

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-8">
                        
                        {/* Stats Grid */}
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

                        {/* Top Content Tabs */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white">
                                    Mais Ouvidos
                                </h3>
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

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-12 h-12 border-4 border-accent-purple border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-gray-400 mt-4 animate-pulse">Carregando...</p>
                                </div>
                            ) : error ? (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                                    <p className="text-red-400 mb-2">{error}</p>
                                    <button onClick={loadData} className="text-sm text-white underline">Tentar novamente</button>
                                </div>
                            ) : (
                                <>
                                    {/* Top Tracks */}
                                    {activeTab === 'tracks' && (
                                        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                                            {topTracks.length > 0 ? (
                                                topTracks.map((track, i) => (
                                                    <TrackCard key={`top-track-${i}`} track={track} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhuma faixa encontrada para este período</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Top Artists */}
                                    {activeTab === 'artists' && (
                                        <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                                            {topArtists.length > 0 ? (
                                                topArtists.map((artist, i) => (
                                                    <ArtistCard key={`top-artist-${i}`} artist={artist} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhum artista encontrado para este período</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Top Albums */}
                                    {activeTab === 'albums' && (
                                        <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
                                            {topAlbums.length > 0 ? (
                                                topAlbums.map((album, i) => (
                                                    <AlbumCard key={`top-album-${i}`} album={album} rank={i + 1} />
                                                ))
                                            ) : (
                                                <p className="text-gray-500 py-8">Nenhum álbum encontrado para este período</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        {/* Recommendations Section */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                                    <i className="ph-fill ph-sparkle text-yellow-400"></i>
                                    Recomendado Para Você
                                    {useGemini && import.meta.env.VITE_GEMINI_API_KEY && (
                                        <span className="text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white px-2 py-1 rounded-full ml-2">
                                            IA
                                        </span>
                                    )}
                                </h3>
                                {recommendations.tracks.length > 0 && (
                                    <button 
                                        onClick={() => setShowCreatePlaylist(true)}
                                        className="btn-primary text-sm"
                                    >
                                        <i className="ph ph-playlist mr-2"></i>
                                        Criar Playlist
                                    </button>
                                )}
                            </div>

                            {/* Recommended Tracks */}
                            {recommendations.tracks.length > 0 && (
                                <div>
                                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <i className="ph-fill ph-music-note text-green-400"></i>
                                        Faixas Recomendadas
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {recommendations.tracks.slice(0, 12).map((track, index) => (
                                            <div key={track.id || index} className="group">
                                                <TrackListItem track={track} index={index} />
                                                {track.reason && (
                                                    <p className="text-xs text-gray-500 ml-14 -mt-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        💡 {track.reason}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommended Artists */}
                            {recommendations.artists.length > 0 && (
                                <div>
                                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <i className="ph-fill ph-user text-accent-purple"></i>
                                        Artistas Para Descobrir
                                    </h4>
                                    <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                                        {recommendations.artists.map((artist, i) => (
                                            <div key={`rec-artist-${i}`} className="flex-shrink-0 w-36 group cursor-pointer">
                                                <div className="w-36 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-accent-purple/30 to-accent-blue/30 mb-3">
                                                    {artist.image && !artist.image.includes('2a96cbd8b46e442fc41c2b86b821562f') ? (
                                                        <img src={artist.image} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <i className="ph-fill ph-user text-4xl text-white/50"></i>
                                                        </div>
                                                    )}
                                                </div>
                                                <h5 className="font-semibold text-white text-sm truncate">{artist.name}</h5>
                                                {artist.reason && (
                                                    <p className="text-xs text-gray-500 truncate">{artist.reason}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommended Albums */}
                            {recommendations.albums.length > 0 && (
                                <div>
                                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <i className="ph-fill ph-vinyl-record text-accent-blue"></i>
                                        Álbuns Para Explorar
                                    </h4>
                                    <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
                                        {recommendations.albums.map((album, i) => (
                                            <div key={`rec-album-${i}`} className="flex-shrink-0 w-40 group cursor-pointer">
                                                <div className="w-40 h-40 rounded-xl overflow-hidden bg-gradient-to-br from-accent-blue/30 to-green-500/30 mb-3 shadow-lg">
                                                    {album.image && !album.image.includes('2a96cbd8b46e442fc41c2b86b821562f') ? (
                                                        <img src={album.image} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <i className="ph-fill ph-vinyl-record text-4xl text-white/50"></i>
                                                        </div>
                                                    )}
                                                </div>
                                                <h5 className="font-semibold text-white text-sm truncate">{album.name}</h5>
                                                <p className="text-xs text-gray-500 truncate">{album.artist}</p>
                                                {album.reason && (
                                                    <p className="text-xs text-gray-600 truncate">{album.reason}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {recommendations.tracks.length === 0 && recommendations.artists.length === 0 && !isLoading && (
                                <div className="text-center py-12 text-gray-500">
                                    <i className="ph ph-music-notes-simple text-5xl mb-4 opacity-50"></i>
                                    <p>Nenhuma recomendação encontrada para este período.</p>
                                    <p className="text-sm mt-2">Tente selecionar um período diferente ou ouça mais músicas!</p>
                                </div>
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
