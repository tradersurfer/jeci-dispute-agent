import { NextResponse } from "next/server";
import { runAgentLoop } from "@/lib/agent/jeci";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.AGENT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runAgentLoop();
    return NextResponse.json({ success: true, message: "Agent loop completed." });
  } catch (error) {
    return NextResponse.json(
      { error: "Agent loop failed", detail: String(error) },
      { status: 500 }
    );
  }
}
