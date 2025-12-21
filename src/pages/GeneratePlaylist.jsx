import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import TrackCard from '../components/Player/TrackCard';
import CategorySelector from '../components/CategorySelector';
import recommendationService from '../services/recommendations';
import usePlaylistStore from '../stores/playlistStore';
import usePlayerStore from '../stores/playerStore';
import useGamificationStore from '../stores/gamificationStore';
import useToastStore from '../stores/toastStore';
import cacheService from '../services/cache';

function GeneratePlaylist() {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedTracks, setGeneratedTracks] = useState([]);
    const [playlistName, setPlaylistName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);

    // Category selection state
    const [inputMode, setInputMode] = useState('text'); // 'text' or 'categories'
    const [selectedMood, setSelectedMood] = useState(null);
    const [geminiAvailable, setGeminiAvailable] = useState(true);

    const navigate = useNavigate();
    const addPlaylist = usePlaylistStore(state => state.addPlaylist);
    const playTracks = usePlayerStore(state => state.playTracks);
    const showToast = useToastStore(state => state.addToast);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setGeneratedTracks([]);

        try {
            // Check cache first
            // const cacheKey = cacheService.generateKey('playlist-gen', prompt.trim());
            // const cachedTracks = cacheService.get(cacheKey);

            // if (cachedTracks) {
            //     console.log('[GeneratePlaylist] Loading from cache:', cacheKey);
            //     // Brief delay to show visual feedback even for cached results
            //     await new Promise(resolve => setTimeout(resolve, 300));
            //     setGeneratedTracks(cachedTracks);
            //     setPlaylistName(prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt);
            //     setIsGenerating(false);
            //     return;
            // }

            console.log('[GeneratePlaylist] Cache miss. Generating...');
            const { tracks = [], artists = [], albums = [] } = await recommendationService.getAIRecommendations(prompt);
            setGeneratedTracks(tracks);

            // Suggest a name based on the prompt
            setPlaylistName(prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt);
        } catch (error) {
            console.error('Error generating playlist:', error);

            // Check if it's a Gemini quota error
            if (error.message?.includes('quota') || error.message?.includes('AI')) {
                setGeminiAvailable(false);
                setInputMode('categories');
                showToast('Gemini indisponível. Use as categorias para gerar playlists.', 'warning');
            } else {
                showToast('Erro ao gerar playlist. Tente novamente.', 'error');
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSavePlaylist = async () => {
        if (!playlistName.trim()) return;

        try {
            await addPlaylist({
                name: playlistName,
                description: `Gerada a partir de: "${prompt}"`,
                tracks: generatedTracks,
                isPublic: false
            });
            useGamificationStore.getState().trackPlaylistCreated();
            navigate('/playlists');
        } catch (error) {
            console.error('Error saving playlist:', error);
            alert('Erro ao salvar playlist.');
        }
    };

    return (
        <>
            <Header title="Gerar Playlist com IA" />
            <div className="p-8 flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-8">

                    {/* Input Section */}
                    <div className="bg-gray-800 p-8 rounded-xl shadow-lg">
                        <form onSubmit={handleGenerate} className="space-y-6">
                            {/* Mode Toggle */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-white">
                                    Como você quer gerar?
                                </h2>
                                <div className="flex gap-2 bg-gray-900 p-1 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setInputMode('text')}
                                        disabled={!geminiAvailable}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'text'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-white'
                                            } ${!geminiAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        Texto Livre
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInputMode('categories')}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'categories'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        Categorias
                                    </button>
                                </div>
                            </div>

                            {/* Gemini Unavailable Warning */}
                            {!geminiAvailable && (
                                <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 text-sm text-yellow-200">
                                    <div className="flex items-start gap-3">
                                        <i className="ph-fill ph-warning text-yellow-500 text-xl mt-0.5"></i>
                                        <div>
                                            <p className="font-medium">IA temporariamente indisponível</p>
                                            <p className="text-yellow-300/80 mt-1">
                                                Use as categorias para gerar playlists ou busque artistas/bandas específicos.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Text Input Mode */}
                            {inputMode === 'text' && (
                                <div>
                                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                                        O que você quer ouvir hoje?
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="prompt"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                            placeholder="Ex: Rock clássico dos anos 80, Queen, Músicas tristes..."
                                            value={prompt}
                                            onChange={(e) => {
                                                setPrompt(e.target.value);
                                                setSelectedMood(null); // Clear mood selection when typing
                                            }}
                                            disabled={isGenerating}
                                        />
                                        <button
                                            type="submit"
                                            disabled={isGenerating || !prompt.trim()}
                                            className="absolute right-2 top-2 bottom-2 btn-primary px-6"
                                        >
                                            {isGenerating ? (
                                                <div className="flex items-center">
                                                    <div className="loader w-4 h-4 mr-2"></div>
                                                    Gerando...
                                                </div>
                                            ) : (
                                                <div className="flex items-center">
                                                    <i className="ph-fill ph-sparkle mr-2"></i>
                                                    Gerar
                                                </div>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-sm text-gray-400 mt-3">
                                        <span>Sugestões:</span>
                                        <button type="button" onClick={() => setPrompt("Melhores do Queen")} className="hover:text-white hover:underline">Queen</button>
                                        <span>•</span>
                                        <button type="button" onClick={() => setPrompt("Indie Rock 2023")} className="hover:text-white hover:underline">Indie Rock</button>
                                        <span>•</span>
                                        <button type="button" onClick={() => setPrompt("Relaxing Jazz")} className="hover:text-white hover:underline">Jazz</button>
                                    </div>
                                </div>
                            )}

                            {/* Category Selection Mode */}
                            {inputMode === 'categories' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-3">
                                        Escolha uma categoria e um mood
                                    </label>
                                    <CategorySelector
                                        onSelect={(promptText, moodData) => {
                                            setPrompt(promptText);
                                            setSelectedMood(moodData);
                                        }}
                                        selectedMood={selectedMood}
                                    />
                                    {selectedMood && prompt && (
                                        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg text-sm text-blue-200">
                                            <strong>Selecionado:</strong> {prompt}
                                        </div>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={isGenerating || !prompt.trim()}
                                        className="w-full btn-primary mt-4 py-4 text-lg"
                                    >
                                        {isGenerating ? (
                                            <div className="flex items-center justify-center">
                                                <div className="loader w-5 h-5 mr-2"></div>
                                                Gerando...
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center">
                                                <i className="ph-fill ph-sparkle mr-2 text-xl"></i>
                                                Gerar Playlist
                                            </div>
                                        )}
                                    </button>
                                    <p className="text-xs text-gray-500 mt-3 text-center">
                                        💡 Dica: Você também pode buscar artistas/bandas específicos digitando no modo texto livre
                                    </p>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Results Section */}
                    {generatedTracks.length > 0 && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white flex items-center">
                                    <i className="ph-fill ph-playlist mr-3 text-blue-400"></i>
                                    Resultado ({generatedTracks.length} músicas)
                                </h3>
                                <button
                                    onClick={() => setShowSaveModal(true)}
                                    className="btn-primary"
                                >
                                    <i className="ph-fill ph-floppy-disk mr-2"></i>
                                    Salvar Playlist
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {generatedTracks.map((track, index) => (
                                    <TrackCard
                                        key={`${track.id}-${index}`}
                                        track={track}
                                        onPlay={() => playTracks(generatedTracks, index)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-4">Salvar Playlist</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nome da Playlist</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={playlistName}
                                    onChange={(e) => setPlaylistName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3 justify-end mt-6">
                                <button
                                    onClick={() => setShowSaveModal(false)}
                                    className="btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSavePlaylist}
                                    className="btn-primary"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default GeneratePlaylist;
