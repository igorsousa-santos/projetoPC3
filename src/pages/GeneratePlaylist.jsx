import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import TrackCard from '../components/Player/TrackCard';
import recommendationService from '../services/recommendations';
import usePlaylistStore from '../stores/playlistStore';
import usePlayerStore from '../stores/playerStore';

function GeneratePlaylist() {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedTracks, setGeneratedTracks] = useState([]);
    const [playlistName, setPlaylistName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    
    const navigate = useNavigate();
    const addPlaylist = usePlaylistStore(state => state.addPlaylist);
    const playTracks = usePlayerStore(state => state.playTracks);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setGeneratedTracks([]);
        
        try {
            const tracks = await recommendationService.getRecommendations(prompt);
            setGeneratedTracks(tracks);
            // Suggest a name based on the prompt
            setPlaylistName(prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt);
        } catch (error) {
            console.error('Error generating playlist:', error);
            alert('Erro ao gerar playlist. Tente novamente.');
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
                        <form onSubmit={handleGenerate} className="space-y-4">
                            <div>
                                <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                                    O que você quer ouvir hoje?
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="prompt"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                        placeholder="Ex: Rock clássico dos anos 80, Músicas tristes para dias chuvosos..."
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
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
                            </div>
                            <div className="flex flex-wrap gap-2 text-sm text-gray-400">
                                <span>Sugestões:</span>
                                <button type="button" onClick={() => setPrompt("Melhores do Queen")} className="hover:text-white hover:underline">Queen</button>
                                <span>•</span>
                                <button type="button" onClick={() => setPrompt("Indie Rock 2023")} className="hover:text-white hover:underline">Indie Rock</button>
                                <span>•</span>
                                <button type="button" onClick={() => setPrompt("Relaxing Jazz")} className="hover:text-white hover:underline">Jazz</button>
                            </div>
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
