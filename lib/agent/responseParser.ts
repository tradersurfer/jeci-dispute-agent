import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/utils/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function parseDisputeResponse(action: Record<string, unknown>) {
  const { dispute_id, payload } = action as {
    dispute_id?: string;
    payload?: { raw_response_text?: string };
  };

  if (!dispute_id || !payload?.raw_response_text) {
    throw new Error("dispute_id and raw_response_text are required for parsing");
  }

  const systemPrompt = `You are a credit dispute analyst. Parse bureau response letters and extract key outcomes.
Always respond in valid JSON only. No preamble, no markdown.
JSON shape:
{
  "outcome": "deleted" | "updated" | "verified" | "partial" | "no_change",
  "items_deleted": number,
  "items_updated": number,
  "items_verified": number,
  "summary": "brief human-readable summary",
  "recommended_next_action": "close_dispute" | "recommend_next_round" | "escalate" | "follow_up"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Parse this bureau response:\n\n${payload.raw_response_text}`,
      },
    ],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());

  // Update the dispute with outcome
  await supabaseAdmin
    .from("disputes")
    .update({
      response_outcome: parsed.outcome,
      response_notes: parsed.summary,
      status: parsed.outcome === "deleted" ? "closed_win" :
               parsed.outcome === "verified" ? "closed_loss" : "responded",
    })
    .eq("id", dispute_id);

  // Queue next action based on recommendation
  if (parsed.recommended_next_action && parsed.recommended_next_action !== "close_dispute") {
    const { data: dispute } = await supabaseAdmin
      .from("disputes")
      .select("client_id")
      .eq("id", dispute_id)
      .single();

    if (dispute) {
      await supabaseAdmin.from("action_queue").insert({
        client_id: dispute.client_id,
        dispute_id,
        action_type: parsed.recommended_next_action,
        priority: 2,
        scheduled_for: new Date().toISOString(),
        payload: { source: "response_parser", outcome: parsed.outcome },
      });
    }
  }

  return parsed;
}
