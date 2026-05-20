'use client';

interface TerminalProgressProps {
  step: number;
  totalSteps: number;
  label: string;
  steps: string[];
}

export default function TerminalProgress({ step, totalSteps, label, steps }: TerminalProgressProps) {
  const pct = Math.round((step / totalSteps) * 100);
  const barFilled = Math.floor((step / totalSteps) * 28);
  const barEmpty = 28 - barFilled;

  return (
    <div className="font-mono space-y-5 w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="text-jeci-muted text-xs flex items-center gap-3">
        <span>$</span>
        <span>jeci-scan --analyze report.pdf --round 1</span>
      </div>

      <div className="border-t border-jeci-border/60" />

      {/* Log lines */}
      <div className="space-y-2">
        {steps.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const pending = i > step;

          return (
            <div
              key={s}
              className={`text-sm flex items-center gap-3 transition-opacity duration-300 ${
                done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-25'
              }`}
            >
              <span
                className={`flex-shrink-0 w-14 text-xs ${
                  done ? 'text-jeci-success' : active ? 'text-jeci-gold' : 'text-jeci-border'
                }`}
              >
                {done ? '[✓]' : active ? '[...]' : '[   ]'}
              </span>
              <span
                className={
                  done
                    ? 'text-jeci-muted'
                    : active
                    ? 'text-jeci-text'
                    : 'text-jeci-muted/40'
                }
              >
                {s}
              </span>
              {active && (
                <span className="text-jeci-gold animate-blink">▋</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-jeci-border/60" />

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-jeci-muted">
          <span>{label}</span>
          <span className="text-jeci-gold">{pct}%</span>
        </div>
        <div className="font-mono text-jeci-gold text-sm tracking-tight">
          {'█'.repeat(barFilled)}{'░'.repeat(barEmpty)}
          <span className="text-jeci-muted ml-2 text-xs">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
