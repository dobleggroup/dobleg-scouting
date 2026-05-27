import type { Position } from '@/types/scoring';
import { displayPosition } from '@/types/scoring';

interface PositionBarProps {
  distribution: Record<string, number>;
  selectedPosition: Position | null;
  onSelectPosition: (position: Position) => void;
}

const POSITION_COLORS: Record<string, string> = {
  ARQ: 'bg-yellow-500',
  LD: 'bg-blue-500',
  CB: 'bg-blue-700',
  LI: 'bg-blue-500',
  VC: 'bg-green-600',
  VI: 'bg-green-500',
  EXT: 'bg-orange-500',
  DEL: 'bg-red-500',
};

const POSITION_LABELS: Record<string, string> = {
  ARQ: 'Arquero',
  LD: 'Lateral Der.',
  CB: 'DFC',
  LI: 'Lateral Izq.',
  VC: 'Volante Central',
  VI: 'Volante Interno',
  EXT: 'Extremo',
  DEL: 'Delantero',
};

export default function PositionBar({ distribution, selectedPosition, onSelectPosition }: PositionBarProps) {
  const sorted = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)
    .filter(([, pct]) => pct > 0);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Posiciones</h4>
      {sorted.map(([pos, pct]) => {
        const isSelected = selectedPosition === pos;
        return (
          <button
            key={pos}
            onClick={() => onSelectPosition(pos as Position)}
            className={`w-full group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
              isSelected
                ? 'bg-white/10 ring-1 ring-white/20'
                : 'hover:bg-white/5'
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {displayPosition(pos)}
                </span>
                <span className="text-xs text-gray-500">{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${POSITION_COLORS[pos] || 'bg-gray-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
      {selectedPosition && (
        <p className="text-[10px] text-gray-500 text-center mt-1">
          Viendo stats como {POSITION_LABELS[selectedPosition] || selectedPosition}
        </p>
      )}
    </div>
  );
}
