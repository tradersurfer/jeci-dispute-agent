'use client';

interface ProgressRingProps {
  step: number;
  totalSteps: number;
  label: string;
}

export default function ProgressRing({ step, totalSteps, label }: ProgressRingProps) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = step / totalSteps;
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <svg width="140" height="140" className="-rotate-90">
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#1E1E2E"
            strokeWidth="8"
          />
          {/* Progress */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#C9A84C"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-credora-gold">
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>
      <p className="text-credora-text text-center font-medium animate-pulse-gold">{label}</p>
    </div>
  );
}
