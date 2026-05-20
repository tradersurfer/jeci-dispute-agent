'use client';

import { useState } from 'react';

interface LetterPreviewCardProps {
  bureau: string;
  round: number;
  preview: string;
}

const BUREAU_COLOR: Record<string, { border: string; text: string; bg: string }> = {
  Equifax:    { border: '#E8302A40', text: '#E8302A', bg: '#E8302A0D' },
  Experian:   { border: '#5B9BD540', text: '#5B9BD5', bg: '#5B9BD50D' },
  TransUnion: { border: '#00A3E040', text: '#00A3E0', bg: '#00A3E00D' },
};

export default function LetterPreviewCard({ bureau, round, preview }: LetterPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = BUREAU_COLOR[bureau] ?? { border: '#C9A84C40', text: '#C9A84C', bg: '#C9A84C0D' };

  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: c.border }}>
      {/* Header bar */}
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-opacity hover:opacity-90"
        style={{ backgroundColor: c.bg }}
      >
        <div className="flex items-center gap-3 font-mono text-sm">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.text }} />
          <span className="text-jeci-text font-semibold uppercase tracking-wide">{bureau}</span>
          <span
            className="text-xs px-2 py-0.5 rounded border"
            style={{ color: c.text, borderColor: c.border }}
          >
            ROUND_{round}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-jeci-muted">
          <span>{expanded ? '[COLLAPSE]' : '[EXPAND]'}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Letter content */}
      {expanded && (
        <div className="p-5 border-t" style={{ borderColor: c.border }}>
          <pre className="font-mono text-jeci-text/80 text-xs leading-relaxed whitespace-pre-wrap bg-jeci-bg rounded p-4 max-h-72 overflow-y-auto">
            {preview}
            {preview.length >= 500 && (
              <span className="text-jeci-muted">
                {'\n\n'}// [truncated — download ZIP for full letter]
              </span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
