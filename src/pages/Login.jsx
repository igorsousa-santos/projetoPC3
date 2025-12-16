import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const loginLocal = useAuthStore(state => state.loginLocal);
    const loginSpotify = useAuthStore(state => state.loginSpotify);

    const handleLocalLogin = async (e) => {
        e.preventDefault();
        setError('');

        if (!email.trim()) {
            setError('Por favor, insira seu email');
            return;
        }

        setIsLoading(true);
        try {
            const success = await loginLocal(email, password);
            if (success) {
                navigate('/dashboard');
            } else {
                setError('Conta não encontrada ou credenciais inválidas.');
            }
        } catch (err) {
            setError(err.message || 'Erro ao fazer login. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

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
                    <h2 className="text-2xl font-bold text-white mb-6">Entrar</h2>

                    {/* Local Login Form */}
                    <form onSubmit={handleLocalLogin} className="space-y-4 mb-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-dark-text mb-2">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-all"
                                placeholder="seu@email.com"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-dark-text mb-2">
                                Senha (opcional)
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-all"
                                placeholder="Sua senha"
                                disabled={isLoading}
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button type="submit" className="w-full btn-primary" disabled={isLoading}>
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-dark-border"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-dark-card text-dark-text-muted">ou</span>
                        </div>
                    </div>

                    {/* Spotify Login */}
                    <button
                        onClick={loginSpotify}
                        className="w-full bg-green-500 hover:bg-green-400 text-white font-bold py-3 px-6 rounded-full transition-all transform hover:scale-105 flex items-center justify-center space-x-3"
                    >
                        <i className="ph-fill ph-spotify-logo text-2xl"></i>
                        <span>Conectar com Spotify</span>
                    </button>

                    {/* Sign up link */}
                    <div className="mt-6 text-center">
                        <p className="text-dark-text-muted">
                            Não tem uma conta?{' '}
                            <Link to="/signup" className="text-accent-blue hover:underline font-medium">
                                Criar conta
                            </Link>
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
