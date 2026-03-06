import { NextResponse } from "next/server";
import { getSimulationConfig } from "@/app/lib/server/simulation-store";

export async function GET() {
  const response = getSimulationConfig();
  return NextResponse.json(response);
}
