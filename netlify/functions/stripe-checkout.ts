import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_METADATA: Record<string, { name: string; mode: 'payment' | 'subscription' }> = {
  price_credora_scan: { name: 'Credora Scan', mode: 'payment' },
  price_credora_sweep: { name: 'Credora Sweep', mode: 'payment' },
  price_credora_repair: { name: 'Credora Repair', mode: 'subscription' },
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, planName } = JSON.parse(event.body ?? '{}');

    if (!priceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing priceId' }) };
    }

    const meta = PLAN_METADATA[priceId];
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const mode = meta?.mode ?? 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?canceled=true`,
      metadata: {
        plan: planName ?? priceId,
        priceId,
      },
      allow_promotion_codes: true,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-checkout]', message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
};
