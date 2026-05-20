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
      className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-200 ${
        highlighted
          ? 'border-credora-gold bg-credora-surface shadow-[0_0_60px_rgba(201,168,76,0.12)]'
          : 'border-credora-border bg-credora-surface hover:border-credora-gold/40'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-credora-gold text-credora-bg text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <p className="text-credora-muted text-sm font-medium uppercase tracking-wider mb-2">
          {name}
        </p>
        <div className="flex items-end gap-1 mb-3">
          <span className="font-display text-4xl font-bold text-credora-text">{price}</span>
          {type === 'recurring' && (
            <span className="text-credora-muted text-sm mb-1.5">billed monthly</span>
          )}
        </div>
        <p className="text-credora-muted text-sm leading-relaxed">{description}</p>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm">
            <span className="text-credora-gold mt-0.5 flex-shrink-0">✓</span>
            <span className={f.startsWith('Everything') ? 'text-credora-gold font-medium' : 'text-credora-text/80'}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={loading}
        className={`w-full py-3.5 rounded-lg font-semibold text-sm transition-all ${
          highlighted
            ? 'bg-credora-gold text-credora-bg hover:opacity-90 active:opacity-80'
            : 'bg-credora-blue text-white hover:opacity-90 active:opacity-80'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Redirecting…
          </span>
        ) : (
          cta
        )}
      </button>
    </div>
  );
}
