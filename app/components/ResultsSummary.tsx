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

const SEVERITY_BADGE: Record<string, string> = {
  'Obsolete Accounts': 'badge-crit',
  'Collections':       'badge-crit',
  'Duplicate Accounts':'badge-high',
  'Incorrect Status':  'badge-high',
  'Medical Debt':      'badge-med',
  'Inquiries':         'badge-med',
  'Public Records':    'badge-high',
  'Identity Errors':   'badge-crit',
  'Other Violations':  'badge-low',
};

const BUREAU_COLOR: Record<string, string> = {
  Equifax:    '#E8302A',
  Experian:   '#5B9BD5',
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
    <div className="space-y-4">

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'ITEMS_FLAGGED',   value: totalItems,         color: 'text-jeci-red' },
          { label: 'QUICK_WINS',      value: quickWins,          color: 'text-jeci-gold' },
          { label: 'EST_PT_RECOVERY', value: `+${estimatedPoints}`, color: 'text-jeci-success' },
          { label: 'LETTERS_READY',   value: lettersGenerated,   color: 'text-jeci-blue' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <div className={`font-mono text-2xl font-bold ${color} mb-1`}>{value}</div>
            <div className="font-mono text-jeci-muted text-xs">{label}</div>
          </div>
        ))}
      </div>

      {/* Scores */}
      {(scores.equifax || scores.experian || scores.transunion) && (
        <div className="card">
          <p className="terminal-label mb-4">// CREDIT_SCORES</p>
          <div className="grid grid-cols-3 gap-4">
            {(['Equifax', 'Experian', 'TransUnion'] as const).map((bureau) => {
              const score =
                bureau === 'Equifax' ? scores.equifax
                : bureau === 'Experian' ? scores.experian
                : scores.transunion;
              return (
                <div key={bureau} className="text-center">
                  <div
                    className="font-mono text-2xl font-bold mb-1"
                    style={{ color: BUREAU_COLOR[bureau] }}
                  >
                    {score ?? '---'}
                  </div>
                  <div className="font-mono text-xs text-jeci-muted uppercase">{bureau}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories */}
      {Object.keys(categories).length > 0 && (
        <div className="card">
          <p className="terminal-label mb-4">// ITEMS_BY_CATEGORY</p>
          <div className="space-y-3">
            {Object.entries(categories)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => {
                const maxVal = Math.max(...Object.values(categories));
                const badgeClass = SEVERITY_BADGE[cat] ?? 'badge-low';
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={badgeClass}>{cat.toUpperCase().replace(/ /g, '_')}</span>
                      </div>
                      <span className="font-mono text-jeci-gold text-sm">{count}</span>
                    </div>
                    <div className="h-1 bg-jeci-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-jeci-gold/50 rounded-full"
                        style={{ width: `${(count / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Bureaus */}
      {bureausAffected.length > 0 && (
        <div className="card">
          <p className="terminal-label mb-4">// BUREAUS_AFFECTED</p>
          <div className="flex gap-3 flex-wrap">
            {bureausAffected.map((b) => (
              <span
                key={b}
                className="font-mono text-xs px-3 py-1.5 rounded border"
                style={{
                  borderColor: `${BUREAU_COLOR[b]}40`,
                  color: BUREAU_COLOR[b],
                  backgroundColor: `${BUREAU_COLOR[b]}10`,
                }}
              >
                {b.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
