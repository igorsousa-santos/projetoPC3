import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';

function Dashboard() {
    const navigate = useNavigate();

    const handleStartSearch = () => {
        navigate('/search');
    };

    return (
        <>
            <Header title="Início" />
            <div className="p-8 flex-1">
                <div className="max-w-4xl mx-auto space-y-10">
                    {/* Welcome Section */}
                    <section className="text-center py-12">
                        <h2 className="text-4xl font-extrabold text-white mb-4">
                            Bem-vindo ao Music Horizon
                        </h2>
                        <p className="text-xl text-gray-400 mb-8">
                            Descubra novas músicas baseadas nos seus artistas, músicas ou gêneros favoritos
                        </p>
                        <button
                            onClick={handleStartSearch}
                            className="btn-primary text-lg py-4 px-8"
                        >
                            <i className="ph ph-magnifying-glass mr-2"></i>
                            Começar a Buscar
                        </button>
                    </section>

                    {/* Features */}
                    <section className="grid md:grid-cols-3 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg text-center">
                            <i className="ph-fill ph-music-notes text-5xl text-blue-400 mb-4"></i>
                            <h3 className="text-xl font-bold text-white mb-2">Recomendações Inteligentes</h3>
                            <p className="text-gray-400">
                                Descubra novas músicas baseadas no seu gosto
                            </p>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg text-center">
                            <i className="ph-fill ph-spotify-logo text-5xl text-green-400 mb-4"></i>
                            <h3 className="text-xl font-bold text-white mb-2">Integração Spotify</h3>
                            <p className="text-gray-400">
                                Conecte sua conta para recomendações personalizadas
                            </p>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg text-center">
                            <i className="ph-fill ph-spotify-logo text-5xl text-green-500 mb-4"></i>
                            <h3 className="text-xl font-bold text-white mb-2">Exportar para Spotify</h3>
                            <p className="text-gray-400">
                                Salve suas playlists direto no Spotify
                            </p>
                        </div>
                    </section>

                    {/* Quick Start Guide */}
                    <section className="bg-gray-800 p-8 rounded-lg">
                        <h3 className="text-2xl font-bold text-white mb-6">Como Usar</h3>
                        <ol className="space-y-4 text-gray-300">
                            <li className="flex items-start">
                                <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0 font-bold">1</span>
                                <div>
                                    <strong className="text-white">Busque por artista, música ou gênero</strong>
                                    <p className="text-sm text-gray-400">Digite o nome de um artista que você gosta, uma música específica ou um gênero musical</p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0 font-bold">2</span>
                                <div>
                                    <strong className="text-white">Explore as recomendações</strong>
                                    <p className="text-sm text-gray-400">Veja músicas similares e descubra novos artistas</p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0 font-bold">3</span>
                                <div>
                                    <strong className="text-white">Crie e exporte playlists</strong>
                                    <p className="text-sm text-gray-400">Salve suas descobertas em playlists e exporte para o Spotify</p>
                                </div>
                            </li>
                        </ol>
                    </section>
                </div>
            </div>
        </>
    );
}

export default Dashboard;
