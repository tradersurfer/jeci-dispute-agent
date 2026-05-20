import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { generateDisputeLetter } from "./letterGenerator";
import { parseDisputeResponse } from "./responseParser";
import { calculateNextAction } from "./strategyEngine";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type ActionType =
  | "generate_letter"
  | "send_dispute"
  | "follow_up"
  | "parse_response"
  | "escalate"
  | "update_score"
  | "notify_client"
  | "request_validation"
  | "close_dispute"
  | "recommend_next_round";

export interface AgentAction {
  id: string;
  client_id: string;
  action_type: ActionType;
  dispute_id?: string;
  negative_item_id?: string;
  payload?: Record<string, unknown>;
  scheduled_for: string;
}

/**
 * Main JECI agent loop — processes pending actions from the queue
 */
export async function runAgentLoop(limit = 10) {
  console.log("[JECI] Starting agent loop...");

  const { data: actions, error } = await supabaseAdmin
    .from("action_queue")
    .select("*, clients(*), disputes(*), negative_items(*)")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[JECI] Failed to fetch action queue:", error);
    return;
  }

  if (!actions || actions.length === 0) {
    console.log("[JECI] No pending actions.");
    return;
  }

  console.log(`[JECI] Processing ${actions.length} actions...`);

  for (const action of actions) {
    await processAction(action);
  }

  console.log("[JECI] Agent loop complete.");
}

/**
 * Process a single action from the queue
 */
async function processAction(action: AgentAction & Record<string, unknown>) {
  console.log(`[JECI] Processing action: ${action.action_type} (${action.id})`);

  // Mark as in progress
  await supabaseAdmin
    .from("action_queue")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", action.id);

  try {
    let result: Record<string, unknown> = {};

    switch (action.action_type) {
      case "generate_letter":
        result = await generateDisputeLetter(action);
        break;

      case "parse_response":
        result = await parseDisputeResponse(action);
        break;

      case "recommend_next_round":
        result = await calculateNextAction(action);
        break;

      case "follow_up":
        result = await handleFollowUp(action);
        break;

      default:
        result = { message: `Action type ${action.action_type} acknowledged — manual handling required.` };
    }

    // Mark as completed
    await supabaseAdmin
      .from("action_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result,
      })
      .eq("id", action.id);

    console.log(`[JECI] ✓ Completed: ${action.action_type} (${action.id})`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[JECI] ✗ Failed: ${action.action_type} (${action.id}):`, errorMessage);

    await supabaseAdmin
      .from("action_queue")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", action.id);
  }
}

/**
 * Handle follow-up action for disputes past their response due date
 */
async function handleFollowUp(action: AgentAction) {
  if (!action.dispute_id) return { message: "No dispute ID provided." };

  const { data: dispute } = await supabaseAdmin
    .from("disputes")
    .select("*")
    .eq("id", action.dispute_id)
    .single();

  if (!dispute) return { message: "Dispute not found." };

  // Queue next round if no response received within 35 days
  const sentAt = new Date(dispute.letter_sent_at);
  const daysSinceSent = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceSent >= 35 && dispute.status === "awaiting_response") {
    await supabaseAdmin.from("action_queue").insert({
      client_id: action.client_id,
      dispute_id: action.dispute_id,
      action_type: "recommend_next_round",
      priority: 2,
      scheduled_for: new Date().toISOString(),
      payload: { reason: "No bureau response after 35 days", round: dispute.round_number + 1 },
    });

    return { message: "Escalated to next round — bureau did not respond within 35 days." };
  }

  return { message: `Follow-up noted. ${daysSinceSent} days since letter sent.` };
}
