import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { PlayerMatchStat } from '@/types/scoring';

interface ScoreEvolutionChartProps {
  matches: PlayerMatchStat[];
  avgScore: number | null;
  /** Título propio del gráfico; `null` lo oculta (cuando la sección ya tiene título). */
  title?: string | null;
}

type ViewMode = 'weekly' | 'monthly';

function getWeekLabel(date: string): string {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `S${weekNum}`;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Clave por año+mes: si fuera sólo el mes, mayo de 2025 y mayo de 2026 caerían en el mismo punto. */
export function getMonthKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

/** "May" cuando el historial es de un solo año; "May 25" cuando abarca varios. */
export function formatMonthKey(key: string, showYear: boolean): string {
  const [year, month] = key.split('-');
  const name = MONTHS[Number(month)];
  return showYear ? `${name} ${year.slice(2)}` : name;
}

interface ChartPoint {
  label: string;
  score: number;
  tooltipData?: {
    date: string;
    rival: string;
    result: string;
    minutes: number;
    matchCount?: number;
    best?: number;
    worst?: number;
  };
}

export default function ScoreEvolutionChart({ matches, avgScore, title = 'Evolucion de Rendimiento' }: ScoreEvolutionChartProps) {
  // Arranca en mensual: la vista partido a partido es demasiado ruidosa de entrada.
  const [mode, setMode] = useState<ViewMode>('monthly');

  const chartData = useMemo(() => {
    if (matches.length === 0) return [];

    if (mode === 'weekly') {
      return matches
        .filter(m => m.rating !== null)
        .map(m => {
          const fixture = m.fixture;
          const isHome = m.team_id === fixture?.home_team_id;
          const rival = isHome ? fixture?.away_team?.name : fixture?.home_team?.name;
          const result = fixture ? `${fixture.score_home ?? '?'}-${fixture.score_away ?? '?'}` : '';

          return {
            label: getWeekLabel(fixture?.date ?? ''),
            score: m.rating!,
            tooltipData: {
              date: fixture?.date ? new Date(fixture.date).toLocaleDateString('es-AR') : '',
              rival: rival ?? 'Desconocido',
              result,
              minutes: m.minutes,
            },
          } as ChartPoint;
        });
    }

    const byMonth = new Map<string, number[]>();
    for (const m of matches) {
      if (m.rating === null || !m.fixture?.date) continue;
      const key = getMonthKey(m.fixture.date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(m.rating);
    }

    const showYear = new Set(Array.from(byMonth.keys(), k => k.slice(0, 4))).size > 1;

    return Array.from(byMonth.entries()).map(([key, scores]) => ({
      label: formatMonthKey(key, showYear),
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      tooltipData: {
        date: '',
        rival: '',
        result: '',
        minutes: 0,
        matchCount: scores.length,
        best: Math.max(...scores),
        worst: Math.min(...scores),
      },
    } as ChartPoint));
  }, [matches, mode]);

  if (matches.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        Sin datos de partidos para mostrar
      </div>
    );
  }

  return (
    <div>
      <div className={`flex items-center ${title ? 'justify-between' : 'justify-end'} mb-3`}>
        {title && <h3 className="text-sm font-semibold text-gray-300">{title}</h3>}
        <div className="flex bg-white/5 rounded-lg p-0.5">
          {(['weekly', 'monthly'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                mode === m ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {m === 'weekly' ? 'Semanal' : 'Mensual'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[5.5, 8.5]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            ticks={[5.5, 6.5, 7.5, 8.5]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as ChartPoint;
              const t = d.tooltipData;
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                  <p className="font-bold text-white">{d.score.toFixed(1)}</p>
                  {t?.rival && <p className="text-gray-300">vs {t.rival} ({t.result})</p>}
                  {t?.date && <p className="text-gray-400">{t.date} — {t.minutes} min</p>}
                  {t?.matchCount && (
                    <>
                      <p className="text-gray-400">{t.matchCount} partidos</p>
                      <p className="text-gray-400">Mejor: {t.best?.toFixed(1)} / Peor: {t.worst?.toFixed(1)}</p>
                    </>
                  )}
                </div>
              );
            }}
          />
          {avgScore && (
            <ReferenceLine
              y={avgScore}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{ value: `Prom: ${avgScore.toFixed(1)}`, fill: '#6b7280', fontSize: 10, position: 'right' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#scoreGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 1 }}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
