import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const handler: Handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return { statusCode: 400, body: 'Missing Stripe signature or webhook secret' };
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body ?? '', sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[JECI/stripe-webhook] signature error:', message);
    return { statusCode: 400, body: `Webhook Error: ${message}` };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        await supabase.from('paid_sessions').upsert({
          session_id:      session.id,
          customer_email:  session.customer_details?.email ?? null,
          customer_name:   session.customer_details?.name ?? null,
          plan:            session.metadata?.plan ?? null,
          price_id:        session.metadata?.priceId ?? null,
          amount_total:    session.amount_total,
          currency:        session.currency,
          payment_status:  session.payment_status,
          paid_at:         new Date().toISOString(),
        });
        console.log(`[JECI/stripe-webhook] Payment confirmed — session ${session.id} plan: ${session.metadata?.plan}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        await supabase.from('paid_sessions').upsert({
          session_id:     sub.id,
          customer_email: null,
          plan:           'JECI Repair',
          payment_status: sub.status,
          paid_at:        new Date(sub.current_period_start * 1000).toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        await supabase.from('paid_sessions').update({ payment_status: 'canceled' }).eq('session_id', sub.id);
        break;
      }

      default:
        console.log(`[JECI/stripe-webhook] Unhandled event: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error('[JECI/stripe-webhook] handler error:', err);
    return { statusCode: 500, body: 'Internal handler error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
