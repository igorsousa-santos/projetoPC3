import { NavLink } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';

function Sidebar() {
    const logout = useAuthStore(state => state.logout);

    const navItems = [
        { to: '/dashboard', icon: 'ph-house', label: 'Início' },
        { to: '/search', icon: 'ph-magnifying-glass', label: 'Buscar' },
        { to: '/for-you', icon: 'ph-sparkle', label: 'Para Você' },
        { to: '/generate', icon: 'ph-magic-wand', label: 'Gerar Playlist' },
        { to: '/playlists', icon: 'ph-music-notes', label: 'Playlists' },
        { to: '/profile', icon: 'ph-user', label: 'Perfil' }
    ];

    return (
        <nav className="w-64 bg-black/50 p-6 flex flex-col flex-shrink-0 border-r border-gray-800">
            <div className="flex items-center space-x-2 mb-10">
                <i className="ph-fill ph-headphones text-3xl text-blue-500"></i>
                <span className="text-2xl font-extrabold text-white">Music Horizon</span>
            </div>

            <div className="space-y-2 flex-grow">
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `sidebar-nav-item ${isActive ? 'active' : ''}`
                        }
                    >
                        <i className={`ph-fill ${item.icon}`}></i>
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </div>

            <div className="mt-auto">
                <button onClick={logout} className="sidebar-nav-item w-full">
                    <i className="ph-fill ph-sign-out"></i>
                    <span>Sair</span>
                </button>
            </div>
        </nav>
    );
}

export default Sidebar;
