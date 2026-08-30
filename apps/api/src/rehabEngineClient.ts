/**
 * The one and only caller of `services/rehab-engine` — per
 * docs/ARCHITECTURE.md §1 ("apps/api is the only thing that talks to
 * services/rehab-engine. The browser never calls the Python service
 * directly."). Closes the integration gap flagged in docs/STATUS.md: E5
 * existed and was tested standalone, but nothing called it.
 */
export type SuperviseRequest = {
  exerciseId: string;
  targetRegions: string[];
  intensity: "none" | "low" | "medium" | "high";
  patientContraindicatedRegions: string[];
  recentPainSeverity?: number;
  consecutiveFailedReps?: number;
};

export type SafetyDecision = {
  allowed: boolean;
  blocked: boolean;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};

type SuperviseResponseSnake = {
  allowed: boolean;
  blocked: boolean;
  risk_level: "low" | "medium" | "high";
  reason: string;
};

export class RehabEngineUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`services/rehab-engine did not respond: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

export async function supervise(request: SuperviseRequest): Promise<SafetyDecision> {
  const baseUrl = process.env.REHAB_ENGINE_URL;
  if (!baseUrl) {
    // No supervisor configured — fail open with a low-risk allow rather
    // than taking the whole API down. E5 is a second, coarser safety net on
    // top of the client-side real-time gate (E1), not the only one; a
    // misconfigured deployment shouldn't make program assignment
    // impossible. This is logged, not silent — see the route that calls it.
    return { allowed: true, blocked: false, riskLevel: "low", reason: "E5 supervisor not configured — allowed by default." };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/supervise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id: request.exerciseId,
        target_regions: request.targetRegions,
        intensity: request.intensity,
        patient_contraindicated_regions: request.patientContraindicatedRegions,
        recent_pain_severity: request.recentPainSeverity ?? null,
        consecutive_failed_reps: request.consecutiveFailedReps ?? 0
      })
    });
  } catch (err) {
    throw new RehabEngineUnavailableError(err);
  }

  if (!res.ok) {
    throw new RehabEngineUnavailableError(`HTTP ${res.status}`);
  }

  const body = (await res.json()) as SuperviseResponseSnake;
  return { allowed: body.allowed, blocked: body.blocked, riskLevel: body.risk_level, reason: body.reason };
}
