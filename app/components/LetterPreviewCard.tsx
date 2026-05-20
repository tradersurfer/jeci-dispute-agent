'use client';

import { useState } from 'react';

interface LetterPreviewCardProps {
  bureau: string;
  round: number;
  preview: string;
}

const bureauColors: Record<string, { border: string; text: string; bg: string }> = {
  Equifax: { border: '#E8302A40', text: '#E8302A', bg: '#E8302A10' },
  Experian: { border: '#004B8740', text: '#5B9BD5', bg: '#004B8710' },
  TransUnion: { border: '#00A3E040', text: '#00A3E0', bg: '#00A3E010' },
};

export default function LetterPreviewCard({ bureau, round, preview }: LetterPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = bureauColors[bureau] ?? { border: '#C9A84C40', text: '#C9A84C', bg: '#C9A84C10' };

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: colors.border }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between p-5 text-left hover:opacity-90 transition-opacity"
        style={{ backgroundColor: colors.bg }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.text }}
          />
          <span className="font-semibold text-credora-text">{bureau}</span>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ color: colors.text, backgroundColor: `${colors.text}20` }}
          >
            Round {round}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 text-credora-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Preview content */}
      {expanded && (
        <div className="p-5 border-t" style={{ borderColor: colors.border }}>
          <pre className="text-credora-text/80 text-xs leading-relaxed whitespace-pre-wrap font-mono bg-credora-bg rounded-lg p-4 max-h-80 overflow-y-auto">
            {preview}
            {preview.length >= 500 && (
              <span className="text-credora-muted">
                {'\n\n'}[Letter continues — download ZIP for full content]
              </span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
