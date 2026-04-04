import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/utils/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function generateDisputeLetter(action: Record<string, unknown>) {
  const { client_id, dispute_id, payload } = action as {
    client_id: string;
    dispute_id?: string;
    payload?: Record<string, unknown>;
  };

  // Fetch client
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", client_id)
    .single();

  if (!client) throw new Error("Client not found");

  // Fetch dispute and negative item
  let dispute = null;
  let negativeItem = null;

  if (dispute_id) {
    const { data: d } = await supabaseAdmin
      .from("disputes")
      .select("*, negative_items(*)")
      .eq("id", dispute_id)
      .single();
    dispute = d;
    negativeItem = d?.negative_items;
  }

  const systemPrompt = `You are a professional credit dispute letter writer for 700 Credit Club.
You write formal, legally-aware (but not legal-advice-giving) dispute letters to credit bureaus.
Follow FCRA guidelines. Be concise, firm, and professional.
Do NOT use aggressive or threatening language.
Always request investigation within 30 days per the FCRA.
Format letters with proper headers, date, addresses, and signature blocks.
Use {{CLIENT_NAME}}, {{CLIENT_ADDRESS}}, {{TODAY_DATE}} as placeholders.`;

  const userPrompt = `Write a ${dispute?.round_number > 1 ? `Round ${dispute.round_number}` : "first-round"} credit dispute letter to ${dispute?.bureau?.toUpperCase() || "all bureaus"}.

Client: ${client.first_name} ${client.last_name}
Dispute Type: ${dispute?.dispute_type || payload?.dispute_type || "unverifiable"}
Dispute Reason: ${dispute?.dispute_reason || payload?.reason || "This account cannot be verified"}
Account Name: ${negativeItem?.description || payload?.account_name || "Unknown Account"}
Item Type: ${negativeItem?.item_type || payload?.item_type || "collection"}
Amount: ${negativeItem?.amount ? `$${negativeItem.amount}` : "Unknown"}

Generate a complete, professional dispute letter ready to send.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const letterContent = response.content[0].type === "text" ? response.content[0].text : "";

  // Save letter back to dispute
  if (dispute_id) {
    await supabaseAdmin
      .from("disputes")
      .update({
        letter_content: letterContent,
        status: "ready_to_send",
      })
      .eq("id", dispute_id);
  }

  return { letter_content: letterContent, status: "ready_to_send" };
}
