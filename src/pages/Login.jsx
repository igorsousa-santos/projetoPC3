import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

export default function Login() {
    const login = useAuthStore(state => state.login);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-bg via-dark-card to-dark-bg p-4">
            <div className="max-w-md w-full space-y-8">
                {/* Header */}
                <div className="text-center">
                    <div className="flex justify-center mb-4">
                        <i className="ph-fill ph-headphones text-6xl text-accent-blue"></i>
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">Music Horizon</h1>
                    <p className="text-dark-text-muted text-lg">Descubra novas fronteiras musicais</p>
                </div>

                {/* Login Card */}
                <div className="bg-dark-card p-8 rounded-2xl border border-dark-border shadow-2xl">
                    <h2 className="text-2xl font-bold text-white mb-6 text-center">Entrar</h2>

                    <p className="text-center text-dark-text-muted mb-8">
                        Conecte-se com sua conta Last.fm para começar a explorar seu universo musical.
                    </p>

                    {/* Last.fm Login */}
                    <button
                        onClick={login}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-6 rounded-full transition-all transform hover:scale-105 flex items-center justify-center space-x-3 shadow-lg hover:shadow-red-600/20"
                    >
                        <i className="ph-fill ph-music-notes text-3xl"></i>
                        <span className="text-lg">Continuar com Last.fm</span>
                    </button>
                    
                    <div className="mt-6 text-center">
                         <p className="text-xs text-dark-text-muted">
                            Você poderá conectar seu Spotify para reprodução após o login.
                        </p>
                    </div>
                </div>

                {/* Terms */}
                <p className="text-center text-sm text-dark-text-muted">
                    Ao entrar, você concorda com nossos termos de uso
                </p>
            </div>
        </div>
    );
}
