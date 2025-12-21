export default function TabButton({ active, icon, label, count, onClick }) {
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