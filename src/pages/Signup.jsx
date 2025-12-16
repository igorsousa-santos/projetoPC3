import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const signupLocal = useAuthStore(state => state.signupLocal);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!name.trim() || !email.trim()) {
            setError('Por favor, preencha todos os campos');
            return;
        }

        if (!email.includes('@')) {
            setError('Por favor, insira um email válido');
            return;
        }

        setIsLoading(true);
        try {
            await signupLocal(name, email, password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message || 'Erro ao criar conta. Tente novamente.');
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

                {/* Signup Form Card */}
                <div className="bg-dark-card p-8 rounded-2xl border border-dark-border shadow-2xl">
                    <h2 className="text-2xl font-bold text-white mb-6">Criar Conta</h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Name Input */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-dark-text mb-2">
                                Nome
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-all"
                                placeholder="Seu nome"
                                required
                                disabled={isLoading}
                            />
                        </div>

                        {/* Email Input */}
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
                                required
                                disabled={isLoading}
                            />
                        </div>

                        {/* Password Input */}
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

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="w-full btn-primary text-lg py-3"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Criando conta...' : 'Criar Conta'}
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

                    {/* Already have account */}
                    <div className="text-center">
                        <p className="text-dark-text-muted">
                            Já tem uma conta?{' '}
                            <Link to="/login" className="text-accent-blue hover:underline font-medium">
                                Entrar
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Terms */}
                <p className="text-center text-sm text-dark-text-muted">
                    Ao criar uma conta, você concorda com nossos termos de uso
                </p>
            </div>
        </div>
    );
}
