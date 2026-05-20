'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import UploadZone from '../components/UploadZone';

interface FormState {
  clientName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id') ?? '';

  const [pdf, setPdf] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>({
    clientName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progressLabel, setProgressLabel] = useState('Uploading your report…');

  // Cycle through progress messages while analyzing
  useEffect(() => {
    if (!submitting) return;
    const steps = [
      'Uploading your report…',
      'Extracting credit data with AI…',
      'Running FCRA/FDCPA rules engine…',
      'Generating dispute letters…',
      'Building your letter package…',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % steps.length;
      setProgressLabel(steps[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, [submitting]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pdf) { setError('Please upload your credit report PDF.'); return; }
      if (!form.clientName.trim()) { setError('Please enter your name.'); return; }

      setError('');
      setSubmitting(true);

      const data = new FormData();
      data.append('pdf', pdf);
      data.append('client_name', form.clientName);
      data.append('client_address', form.address);
      data.append('client_city', form.city);
      data.append('client_state', form.state);
      data.append('client_zip', form.zip);
      if (sessionId) data.append('session_id', sessionId);

      try {
        const res = await fetch('/api/analyze', { method: 'POST', body: data });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
        router.push(`/results?id=${json.analysisId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        setSubmitting(false);
      }
    },
    [pdf, form, sessionId, router]
  );

  const field = (label: string, key: keyof FormState, placeholder: string, half = false) => (
    <div className={half ? 'col-span-1' : 'col-span-2'}>
      <label className="block text-credora-muted text-sm mb-2">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        disabled={submitting}
        className="w-full bg-credora-bg border border-credora-border rounded-lg px-4 py-3 text-credora-text placeholder-credora-muted/50 focus:outline-none focus:border-credora-gold/60 transition-colors disabled:opacity-50"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-credora-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-credora-border">
        <a href="/" className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-credora-gold" />
          <span className="font-display text-lg font-bold text-credora-text">Credora AI</span>
        </a>
        <span className="text-credora-muted text-sm">Credit Report Analysis</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {submitting ? (
          /* Processing overlay */
          <div className="text-center space-y-8 animate-fade-in">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-credora-gold/20" />
              <div className="absolute inset-0 rounded-full border-4 border-credora-gold border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-credora-gold/20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-credora-gold/60 animate-pulse" />
                </div>
              </div>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-credora-text mb-3">
                Credora AI is analyzing your report
              </h2>
              <p className="text-credora-gold animate-pulse-gold text-sm">{progressLabel}</p>
            </div>
            <div className="space-y-2 max-w-xs mx-auto text-left">
              {[
                'Scanning 18+ FCRA/FDCPA rules',
                'Checking 7-year reporting limits',
                'Detecting duplicate accounts',
                'Identifying medical debt violations',
                'Generating bureau-specific letters',
              ].map((step) => (
                <div key={step} className="flex items-center gap-3 text-credora-muted text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-credora-gold/60 animate-pulse-gold flex-shrink-0" />
                  {step}
                </div>
              ))}
            </div>
            <p className="text-credora-muted/60 text-xs">This usually takes 30–90 seconds</p>
          </div>
        ) : (
          /* Upload form */
          <div className="animate-slide-up">
            <div className="mb-10">
              <p className="section-label mb-3">Step 1 of 1</p>
              <h1 className="font-display text-4xl font-bold text-credora-text mb-3">
                Upload Your Credit Report
              </h1>
              <p className="text-credora-muted">
                We'll analyze it for FCRA violations and generate dispute letters for all 3 bureaus.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Personal Info */}
              <div className="card space-y-4">
                <p className="text-credora-text font-medium">Your Information</p>
                <div className="grid grid-cols-2 gap-4">
                  {field('Full Name', 'clientName', 'Jane Smith')}
                  {field('Street Address', 'address', '123 Main St')}
                  {field('City', 'city', 'Houston', true)}
                  {field('State', 'state', 'TX', true)}
                  {field('ZIP Code', 'zip', '77001', true)}
                </div>
              </div>

              {/* PDF Upload */}
              <div className="space-y-3">
                <p className="text-credora-text font-medium">Credit Report PDF</p>
                <UploadZone file={pdf} onFile={setPdf} />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !pdf || !form.clientName}
                className="btn-gold w-full py-4 text-base rounded-xl"
              >
                Analyze My Credit Report →
              </button>

              <p className="text-credora-muted/50 text-xs text-center">
                Your report is processed securely and never shared. Analysis typically takes 30–90 seconds.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
