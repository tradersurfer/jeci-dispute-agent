'use client';

interface ResultsSummaryProps {
  totalItems: number;
  quickWins: number;
  estimatedPoints: number;
  lettersGenerated: number;
  categories: Record<string, number>;
  bureausAffected: string[];
  scores: { equifax: number | null; experian: number | null; transunion: number | null };
}

const bureauColors: Record<string, string> = {
  Equifax: '#E8302A',
  Experian: '#004B87',
  TransUnion: '#00A3E0',
};

export default function ResultsSummary({
  totalItems,
  quickWins,
  estimatedPoints,
  lettersGenerated,
  categories,
  bureausAffected,
  scores,
}: ResultsSummaryProps) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard value={totalItems} label="Items Found" accent="gold" />
        <StatCard value={quickWins} label="Quick Wins" accent="green" />
        <StatCard value={`+${estimatedPoints}`} label="Est. Point Recovery" accent="blue" />
        <StatCard value={lettersGenerated} label="Letters Generated" accent="gold" />
      </div>

      {/* Scores row */}
      {(scores.equifax || scores.experian || scores.transunion) && (
        <div className="card">
          <p className="section-label mb-4">Current Credit Scores</p>
          <div className="grid grid-cols-3 gap-4">
            {(['Equifax', 'Experian', 'TransUnion'] as const).map((bureau) => {
              const score =
                bureau === 'Equifax'
                  ? scores.equifax
                  : bureau === 'Experian'
                  ? scores.experian
                  : scores.transunion;
              return (
                <div key={bureau} className="text-center">
                  <div
                    className="text-3xl font-bold font-display mb-1"
                    style={{ color: bureauColors[bureau] }}
                  >
                    {score ?? '—'}
                  </div>
                  <div className="text-credora-muted text-xs">{bureau}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* By Category */}
      {Object.keys(categories).length > 0 && (
        <div className="card">
          <p className="section-label mb-4">Items by Category</p>
          <div className="space-y-3">
            {Object.entries(categories)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-credora-text text-sm">{cat}</span>
                      <span className="text-credora-gold font-semibold text-sm">{count}</span>
                    </div>
                    <div className="h-1.5 bg-credora-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-credora-gold/60 rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, (count / Math.max(...Object.values(categories))) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bureaus Affected */}
      {bureausAffected.length > 0 && (
        <div className="card">
          <p className="section-label mb-4">Bureaus Affected</p>
          <div className="flex gap-3 flex-wrap">
            {bureausAffected.map((bureau) => (
              <span
                key={bureau}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{
                  borderColor: `${bureauColors[bureau]}40`,
                  color: bureauColors[bureau],
                  backgroundColor: `${bureauColors[bureau]}10`,
                }}
              >
                {bureau}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: string | number;
  label: string;
  accent: 'gold' | 'blue' | 'green';
}) {
  const colors = {
    gold: 'text-credora-gold',
    blue: 'text-credora-blue',
    green: 'text-green-400',
  };
  return (
    <div className="card text-center">
      <div className={`font-display text-3xl font-bold ${colors[accent]} mb-1`}>{value}</div>
      <div className="text-credora-muted text-xs uppercase tracking-wide">{label}</div>
    </div>
  );
}
