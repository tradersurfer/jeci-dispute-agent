'use client';

interface PricingCardProps {
  name: string;
  price: string;
  type: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  loading: boolean;
  onSelect: () => void;
}

export default function PricingCard({
  name,
  price,
  type,
  description,
  features,
  cta,
  highlighted,
  loading,
  onSelect,
}: PricingCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded border p-6 transition-all duration-150 ${
        highlighted
          ? 'border-jeci-gold bg-jeci-surface-2 shadow-[0_0_40px_rgba(201,168,76,0.08)]'
          : 'border-jeci-border bg-jeci-surface hover:border-jeci-gold/30'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-px left-0 right-0 h-px bg-jeci-gold/60" />
      )}

      {/* Plan header */}
      <div className="mb-5 pb-5 border-b border-jeci-border">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs text-jeci-muted uppercase tracking-widest">
            {name}
          </span>
          {highlighted && (
            <span className="font-mono text-xs text-jeci-gold border border-jeci-gold/40 px-2 py-0.5 rounded">
              POPULAR
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold text-jeci-text">{price}</span>
          {type === 'recurring' && (
            <span className="font-mono text-xs text-jeci-muted">/mo</span>
          )}
          {type === 'one-time' && (
            <span className="font-mono text-xs text-jeci-muted">one-time</span>
          )}
        </div>
        <p className="text-jeci-muted text-sm mt-2 leading-relaxed">{description}</p>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 mb-6 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm font-mono">
            <span className={`flex-shrink-0 mt-0.5 ${f.startsWith('Everything') ? 'text-jeci-gold' : 'text-jeci-success'}`}>
              {f.startsWith('Everything') ? '↳' : '[✓]'}
            </span>
            <span className={f.startsWith('Everything') ? 'text-jeci-gold' : 'text-jeci-text/75'}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={onSelect}
        disabled={loading}
        className={`w-full py-3 rounded font-mono font-bold text-sm tracking-wide transition-all ${
          highlighted
            ? 'bg-jeci-gold text-jeci-bg hover:opacity-90'
            : 'bg-jeci-blue/10 border border-jeci-blue/40 text-jeci-blue hover:bg-jeci-blue/20'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            CONNECTING...
          </span>
        ) : (
          cta
        )}
      </button>
    </div>
  );
}
