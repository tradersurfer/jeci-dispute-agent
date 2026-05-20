'use client';

import { useState } from 'react';
import PricingCard from './components/PricingCard';

const PLANS = [
  {
    name: 'JECI SCAN',
    price: '$97',
    type: 'one-time',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCAN ?? 'price_jeci_scan',
    description: 'Full 3-bureau scan with Round 1 dispute letters.',
    features: [
      'Full 3-bureau report analysis',
      'AI dispute letters (Round 1)',
      'Downloadable ZIP package',
      'FCRA/FDCPA legal citations',
      'Certified mail guide included',
    ],
    cta: 'GET MY LETTERS →',
    highlighted: false,
  },
  {
    name: 'JECI SWEEP',
    price: '$297',
    type: 'one-time',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SWEEP ?? 'price_jeci_sweep',
    description: 'Complete 3-round dispute campaign, start to finish.',
    features: [
      'Everything in Scan, plus:',
      '3-round dispute pipeline',
      'Bureau response analysis',
      'Round 2 & 3 letter generation',
      'Deletion outcome tracking',
      'Priority support queue',
    ],
    cta: 'START MY SWEEP →',
    highlighted: true,
  },
  {
    name: 'JECI REPAIR',
    price: '$127',
    type: 'recurring',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_REPAIR ?? 'price_jeci_repair',
    description: 'Monthly managed repair with continuous dispute cycles.',
    features: [
      'Everything in Sweep, plus:',
      'Monthly score tracking',
      'Continuous dispute management',
      'Score improvement roadmap',
      'Dedicated repair agent',
      'Cancel any time',
    ],
    cta: 'START REPAIR →',
    highlighted: false,
  },
  {
    name: 'JECI BOOST',
    price: '$497',
    type: 'one-time',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BOOST ?? 'price_jeci_boost',
    description: 'Full-service rapid credit rebuild — scored in 60 days.',
    features: [
      'Everything in Sweep, plus:',
      'Rapid tradeline strategy',
      'Secured card optimization',
      '60-day score target plan',
      'Manual creditor negotiation',
      'White-glove concierge access',
    ],
    cta: 'GET BOOST ACCESS →',
    highlighted: false,
  },
];

const STATS = [
  { value: '18+', label: 'FCRA/FDCPA_RULES' },
  { value: '97%', label: 'AVG_DELETION_RATE' },
  { value: '3',   label: 'BUREAUS_COVERED' },
  { value: '<10m', label: 'ANALYSIS_TIME' },
];

const STEPS = [
  {
    id: '01_SCAN',
    title: 'Upload & Scan',
    desc: 'Upload your PDF credit report. JECI AI extracts every account, inquiry, and public record.',
  },
  {
    id: '02_DISPUTE',
    title: 'Dispute',
    desc: '18+ FCRA/FDCPA rules run automatically. Bureau-specific letters generated with legal citations.',
  },
  {
    id: '03_FIX',
    title: 'Fix',
    desc: 'Mail your certified letters. Track responses. JECI AI generates the next round automatically.',
  },
];

export default function LandingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, planName: string) => {
    setLoadingPlan(planName);
    try {
      const res = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      alert('Checkout error. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <main className="min-h-screen bg-jeci-bg">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 border-b border-jeci-border bg-jeci-bg/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 bg-jeci-gold" />
          <span className="font-display text-lg font-bold text-jeci-text">JECI Credit</span>
        </div>
        <div className="hidden md:flex items-center gap-8 font-mono text-xs text-jeci-muted uppercase tracking-widest">
          <a href="#how-it-works" className="hover:text-jeci-text transition-colors">Process</a>
          <a href="#pricing" className="hover:text-jeci-text transition-colors">Plans</a>
        </div>
        <a href="#pricing" className="btn-gold text-xs py-2 px-4">
          GET STARTED →
        </a>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 pt-24 pb-20 animate-fade-in">
        <div className="font-mono text-xs text-jeci-muted mb-8 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-jeci-success animate-pulse-gold" />
          JECI_AI_ENGINE · ACTIVE · FCRA_COMPLIANT
        </div>

        <h1 className="font-display text-5xl md:text-6xl font-bold text-jeci-text leading-[1.1] mb-6">
          Your Credit Report<br />
          Has Errors.<br />
          <span className="text-jeci-gold">JECI AI Finds Them</span><br />
          in 48 Hours.
        </h1>

        <p className="font-mono text-jeci-gold text-lg mb-4">
          Find it. Fight it. Fix it.
        </p>

        <p className="text-jeci-muted max-w-xl mb-10 leading-relaxed">
          Upload your PDF credit report. JECI AI scans every account, inquiry, and public record
          against 18+ FCRA rules — then generates bureau-specific dispute letters, ready to mail.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <a href="#pricing" className="btn-gold py-3.5 px-8">
            START MY SCAN →
          </a>
          <a href="#how-it-works" className="btn-outline py-3.5 px-8">
            SEE HOW IT WORKS
          </a>
        </div>

        {/* Stats strip */}
        <div className="border border-jeci-border rounded p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-mono text-2xl font-bold text-jeci-gold mb-1">{s.value}</div>
                <div className="font-mono text-jeci-muted text-xs">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 md:px-12 py-16">
        <p className="font-mono text-xs text-jeci-muted uppercase tracking-widest mb-8">
          // HOW_IT_WORKS
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div key={step.id} className="card border-jeci-border">
              <p className="font-mono text-jeci-gold text-xs mb-3">{step.id}</p>
              <h3 className="text-jeci-text font-semibold mb-3">{step.title}</h3>
              <p className="text-jeci-muted text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 md:px-12 py-16">
        <p className="font-mono text-xs text-jeci-muted uppercase tracking-widest mb-4">
          // SELECT_PLAN
        </p>
        <h2 className="font-display text-3xl text-jeci-text mb-2">Choose Your Level</h2>
        <p className="text-jeci-muted mb-10 text-sm">
          One scan or a full repair campaign — pick what you need.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <PricingCard
              key={plan.name}
              {...plan}
              loading={loadingPlan === plan.name}
              onSelect={() => handleCheckout(plan.priceId, plan.name)}
            />
          ))}
        </div>
        <p className="font-mono text-jeci-muted/50 text-xs mt-6 text-center">
          Secure checkout via Stripe · All sales final · Not legal advice
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-jeci-border py-8 px-6 md:px-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-5 bg-jeci-gold/80" />
            <span className="font-display font-bold text-jeci-text">JECI Credit</span>
          </div>
          <p className="font-mono text-jeci-muted text-xs">
            Find it. Fight it. Fix it.
          </p>
          <p className="font-mono text-jeci-muted/50 text-xs">
            © {new Date().getFullYear()} JECI Group · FCRA dispute assistance · Not legal advice
          </p>
        </div>
      </footer>
    </main>
  );
}
