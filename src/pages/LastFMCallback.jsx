import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

function LastFMCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const handleLastFMCallback = useAuthStore(state => state.handleLastFMCallback);
    const [status, setStatus] = useState('Conectando ao Last.fm...');
    const [error, setError] = useState(null);
    const processed = useRef(false);

    useEffect(() => {
        if (processed.current) return;
        
        const token = searchParams.get('token');

        if (!token) {
            setError('Token não encontrado.');
            return;
        }

        processed.current = true;

        const connect = async () => {
            const result = await handleLastFMCallback(token);
            if (result.success) {
                setStatus('Conectado com sucesso! Redirecionando...');
                setTimeout(() => navigate('/for-you'), 1500);
            } else {
                setError(result.error || 'Falha na conexão.');
                // Optional: allow retry if it was a network blip, but for token errors, retry won't work.
            }
        };

        connect();
    }, [searchParams, handleLastFMCallback, navigate]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-dark-bg text-white">
                <div className="text-center">
                    <i className="ph ph-warning text-4xl text-red-500 mb-4"></i>
                    <h2 className="text-xl font-bold mb-2">Erro na conexão</h2>
                    <p className="text-gray-400 mb-4">{error}</p>
                    <button onClick={() => navigate('/login')} className="btn-primary">
                        Voltar para Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-dark-bg text-white">
            <div className="text-center">
                <div className="loader mx-auto mb-4"></div>
                <h2 className="text-xl font-bold">{status}</h2>
            </div>
        </div>
    );
}

export default LastFMCallback;
