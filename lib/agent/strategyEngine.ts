import { supabaseAdmin } from "@/utils/supabase/admin";

export async function calculateNextAction(action: Record<string, unknown>) {
  const { client_id, dispute_id, payload } = action as {
    client_id: string;
    dispute_id?: string;
    payload?: { round?: number; reason?: string };
  };

  const currentRound = payload?.round || 1;

  if (currentRound >= 4) {
    // After 3 rounds, recommend escalation or attorney referral
    await supabaseAdmin.from("action_queue").insert({
      client_id,
      dispute_id,
      action_type: "escalate",
      priority: 1,
      scheduled_for: new Date().toISOString(),
      payload: {
        reason: "Maximum dispute rounds reached — consider legal escalation or pay-for-delete negotiation",
        round: currentRound,
      },
    });

    return {
      recommended_action: "escalate",
      message: "3 dispute rounds completed without deletion. Recommending escalation.",
      round: currentRound,
    };
  }

  // Queue next dispute round letter generation
  if (dispute_id) {
    const { data: dispute } = await supabaseAdmin
      .from("disputes")
      .select("*, negative_items(*)")
      .eq("id", dispute_id)
      .single();

    if (dispute) {
      // Create next round dispute record
      const { data: newDispute } = await supabaseAdmin
        .from("disputes")
        .insert({
          client_id,
          negative_item_id: dispute.negative_item_id,
          round_number: currentRound,
          bureau: dispute.bureau,
          dispute_type: dispute.dispute_type,
          dispute_reason: `Round ${currentRound}: ${dispute.dispute_reason}`,
          status: "draft",
          response_due_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        .select()
        .single();

      if (newDispute) {
        await supabaseAdmin.from("action_queue").insert({
          client_id,
          dispute_id: newDispute.id,
          action_type: "generate_letter",
          priority: 2,
          scheduled_for: new Date().toISOString(),
          payload: { round: currentRound, previous_dispute_id: dispute_id },
        });
      }
    }
  }

  return {
    recommended_action: "generate_letter",
    message: `Round ${currentRound} letter queued for generation.`,
    round: currentRound,
  };
}
