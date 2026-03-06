import { NextResponse } from "next/server";
import { runSimulation } from "@/app/lib/server/simulation-store";
import { ScenarioId } from "@/app/lib/shared/simulation-types";

type RunBody = {
  scenarioId: ScenarioId;
  filters: Record<string, string[]>;
  userInputs?: Record<string, number>;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RunBody;
  const result = runSimulation(body.scenarioId, body.filters ?? {}, body.userInputs ?? {});
  return NextResponse.json(result);
}
