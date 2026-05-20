import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");

  let query = supabaseAdmin
    .from("disputes")
    .select("*, clients(first_name, last_name), negative_items(*)")
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  const { data: dispute, error } = await supabaseAdmin
    .from("disputes")
    .insert({
      ...body,
      status: "draft",
      round_number: body.round_number || 1,
      response_due_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });

  // Immediately queue letter generation
  await supabaseAdmin.from("action_queue").insert({
    client_id: dispute.client_id,
    dispute_id: dispute.id,
    action_type: "generate_letter",
    priority: 2,
    scheduled_for: new Date().toISOString(),
    payload: { dispute_type: dispute.dispute_type, bureau: dispute.bureau },
  });

  return NextResponse.json(dispute, { status: 201 });
}
