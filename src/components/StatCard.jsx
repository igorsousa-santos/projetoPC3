export default function StatCard({ icon, value, label, color }) {
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