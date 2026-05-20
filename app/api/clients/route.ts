import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*, score_snapshots(*), negative_items(*), disputes(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
