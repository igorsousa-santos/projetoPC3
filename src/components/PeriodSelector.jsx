import { useState, useMemo } from 'react';

const PERIOD_OPTIONS = [
    { id: '7day', label: '7 dias', type: 'preset' },
    { id: '1month', label: '1 mês', type: 'preset' },
    { id: '3month', label: '3 meses', type: 'preset' },
    { id: '6month', label: '6 meses', type: 'preset' },
    { id: '12month', label: '1 ano', type: 'preset' },
    { id: 'overall', label: 'Todo período', type: 'preset' },
];

export default function PeriodSelector({ selectedPeriod, onPeriodChange, availableWeeks, onWeekSelect, selectedWeek }) {
    const [showCustom, setShowCustom] = useState(false);
    const [customYear, setCustomYear] = useState(new Date().getFullYear());
    const [customMonth, setCustomMonth] = useState(new Date().getMonth());

    const weeksByPeriod = useMemo(() => {
        if (!availableWeeks?.length) return {};
        const grouped = {};
        availableWeeks.forEach(week => {
            const date = new Date(parseInt(week.from) * 1000);
            const year = date.getFullYear();
            const month = date.getMonth();
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(week);
        });
        return grouped;
    }, [availableWeeks]);

    const years = Object.keys(weeksByPeriod).sort((a, b) => b - a);
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const months = weeksByPeriod[customYear] ? Object.keys(weeksByPeriod[customYear]).sort((a, b) => b - a) : [];

    return (
        <div className="bg-dark-card/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <i className="ph ph-calendar text-accent-purple"></i>
                Período
            </h4>
            
            <div className="flex flex-wrap gap-2 mb-4">
                {PERIOD_OPTIONS.map(option => (
                    <button
                        key={option.id}
                        onClick={() => {
                            onPeriodChange(option.id);
                            onWeekSelect(null);
                            setShowCustom(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            selectedPeriod === option.id && !selectedWeek
                                ? 'bg-accent-purple text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
                <button
                    onClick={() => setShowCustom(!showCustom)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        showCustom || selectedWeek
                            ? 'bg-accent-blue text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                >
                    <i className="ph ph-calendar-blank mr-1"></i>
                    Personalizado
                </button>
            </div>

            {showCustom && availableWeeks?.length > 0 && (
                <div className="border-t border-white/5 pt-4 space-y-3">
                    <div className="flex gap-2">
                        <select
                            value={customYear}
                            onChange={(e) => setCustomYear(parseInt(e.target.value))}
                            className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm"
                        >
                            {years.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <select
                            value={customMonth}
                            onChange={(e) => setCustomMonth(parseInt(e.target.value))}
                            className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-white text-sm"
                        >
                            {months.map(month => <option key={month} value={month}>{monthNames[month]}</option>)}
                        </select>
                    </div>
                    
                    {weeksByPeriod[customYear]?.[customMonth] && (
                        <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            <p className="text-xs text-gray-500 mb-2">Semanas disponíveis:</p>
                            {weeksByPeriod[customYear][customMonth].map((week, i) => {
                                const fromDate = new Date(parseInt(week.from) * 1000);
                                const toDate = new Date(parseInt(week.to) * 1000);
                                const isSelected = selectedWeek?.from === week.from;
                                
                                return (
                                    <button
                                        key={i}
                                        onClick={() => onWeekSelect(week)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                            isSelected
                                                ? 'bg-accent-blue text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        {fromDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {toDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {selectedWeek && (
                <div className="mt-3 p-2 bg-accent-blue/10 rounded-lg">
                    <p className="text-xs text-accent-blue">
                        Período: {new Date(parseInt(selectedWeek.from) * 1000).toLocaleDateString('pt-BR')} - {new Date(parseInt(selectedWeek.to) * 1000).toLocaleDateString('pt-BR')}
                    </p>
                </div>
            )}
        </div>
    );
}