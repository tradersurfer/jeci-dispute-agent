import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

interface CRCClient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { type, data } = body as { type: string; data: CRCClient };

  let result = null;
  let error = null;

  if (type === "client") {
    const upsertPayload = {
      crc_client_id: data.id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      crc_synced_at: new Date().toISOString(),
    };

    const res = await supabaseAdmin
      .from("clients")
      .upsert(upsertPayload, { onConflict: "crc_client_id" })
      .select()
      .single();

    result = res.data;
    error = res.error;
  }

  // Log the sync
  await supabaseAdmin.from("crc_sync_log").insert({
    sync_type: type,
    crc_entity_id: data?.id,
    status: error ? "failed" : "success",
    records_synced: result ? 1 : 0,
    error_message: error?.message,
    raw_payload: body,
  });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true, data: result });
}
