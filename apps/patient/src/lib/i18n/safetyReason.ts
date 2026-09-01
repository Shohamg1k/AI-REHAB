import { DEFAULT_LOCALE, type Locale, type SafetyVerdict } from "@ai-rehab/contracts";

/**
 * H9 — the patient-facing rendering of a safety verdict's `reason`.
 *
 * **This is presentation only.** `SafetyVerdict.reason` is what gets persisted
 * and what the clinician reads (CLAUDE.md invariant 4), and it stays English
 * and untouched. This function returns a *second* string, for the screen and
 * the speaker, and never writes back.
 *
 * **It cannot change a verdict.** It reads `ruleId` and `threshold` and
 * returns text. It has no path to `verdict`, so there is no way for a
 * translation to soften a `block` into something gentler (invariant 3). The
 * one risk worth naming is tone: a mistranslation that *reads* as advisory
 * when the gate said stop. Hence the templates below are imperative in every
 * language, and the escalation strings are asserted to name the clinician.
 *
 * **Why rebuild from `threshold` instead of translating `reason`?** Because
 * `reason` is prose assembled inside the pure gate, and parsing prose back
 * into its parts would mean duplicating gate logic in the UI — where it could
 * drift and end up describing a different rule than the one that fired. The
 * structured fields are the gate's own output; using them cannot disagree
 * with it.
 */

type Family =
  | "angle_block"
  | "angle_caution"
  | "trunk_block"
  | "trunk_caution"
  | "instability"
  | "failed_reps";

function familyOf(ruleId: string): Family | null {
  if (ruleId === "instability_velocity") return "instability";
  if (ruleId === "consecutive_failed_reps") return "failed_reps";
  if (ruleId === "max_trunk_lean") return "trunk_block";
  if (ruleId === "approaching_max_trunk_lean") return "trunk_caution";
  if (/^approaching_(max|min)_angle_/.test(ruleId)) return "angle_caution";
  if (/^(max|min)_angle_/.test(ruleId)) return "angle_block";
  return null;
}

/** `maxAngle.left_knee` -> `{ kind: "max", joint: "left_knee" }`. */
function parseAngleThreshold(name: string): { kind: "max" | "min"; joint: string } | null {
  const match = /^(max|min)Angle\.(.+)$/.exec(name);
  if (!match?.[1] || !match[2]) return null;
  return { kind: match[1] as "max" | "min", joint: match[2] };
}

type Strings = {
  joints: Record<string, string>;
  /** The word for the person the patient escalates to — asserted present in escalations. */
  clinician: string;
  angleBlock: (joint: string, observed: string, kind: "max" | "min", limit: number) => string;
  angleCaution: (joint: string, observed: string, kind: "max" | "min", limit: number) => string;
  trunkBlock: (observed: string, limit: number) => string;
  trunkCaution: (observed: string, limit: number) => string;
  instability: (observed: string, limit: string) => string;
  failedReps: (count: number) => string;
};

const JOINTS_ES: Record<string, string> = {
  left_shoulder: "hombro izquierdo",
  right_shoulder: "hombro derecho",
  left_elbow: "codo izquierdo",
  right_elbow: "codo derecho",
  left_hip: "cadera izquierda",
  right_hip: "cadera derecha",
  left_knee: "rodilla izquierda",
  right_knee: "rodilla derecha",
  left_ankle: "tobillo izquierdo",
  right_ankle: "tobillo derecho",
  left_wrist: "muñeca izquierda",
  right_wrist: "muñeca derecha",
  trunk: "tronco",
  neck: "cuello"
};

const JOINTS_HI: Record<string, string> = {
  left_shoulder: "बायाँ कंधा",
  right_shoulder: "दायाँ कंधा",
  left_elbow: "बायीं कोहनी",
  right_elbow: "दायीं कोहनी",
  left_hip: "बायाँ कूल्हा",
  right_hip: "दायाँ कूल्हा",
  left_knee: "बायाँ घुटना",
  right_knee: "दायाँ घुटना",
  left_ankle: "बायाँ टखना",
  right_ankle: "दायाँ टखना",
  left_wrist: "बायीं कलाई",
  right_wrist: "दायीं कलाई",
  trunk: "धड़",
  neck: "गर्दन"
};

const JOINTS_FR: Record<string, string> = {
  left_shoulder: "épaule gauche",
  right_shoulder: "épaule droite",
  left_elbow: "coude gauche",
  right_elbow: "coude droit",
  left_hip: "hanche gauche",
  right_hip: "hanche droite",
  left_knee: "genou gauche",
  right_knee: "genou droit",
  left_ankle: "cheville gauche",
  right_ankle: "cheville droite",
  left_wrist: "poignet gauche",
  right_wrist: "poignet droit",
  trunk: "tronc",
  neck: "cou"
};

const STRINGS: Record<Exclude<Locale, "en">, Strings> = {
  es: {
    joints: JOINTS_ES,
    clinician: "fisioterapeuta",
    angleBlock: (joint, observed, kind, limit) =>
      kind === "max"
        ? `Para: el ángulo de tu ${joint} (${observed}°) ha superado el máximo seguro de ${limit}°.`
        : `Para: el ángulo de tu ${joint} (${observed}°) ha bajado del mínimo seguro de ${limit}°.`,
    angleCaution: (joint, observed, kind, limit) =>
      kind === "max"
        ? `Cuidado: el ángulo de tu ${joint} (${observed}°) se acerca al máximo seguro de ${limit}°.`
        : `Cuidado: el ángulo de tu ${joint} (${observed}°) se acerca al mínimo seguro de ${limit}°.`,
    trunkBlock: (observed, limit) =>
      `Para: la inclinación del tronco (${observed}°) ha superado el límite seguro de ${limit}° — probablemente estás compensando con la espalda.`,
    trunkCaution: (observed, limit) =>
      `Cuidado: la inclinación del tronco (${observed}°) se acerca al límite seguro de ${limit}°.`,
    instability: (observed, limit) =>
      `Para: la inestabilidad del movimiento (${observed}) ha superado el límite seguro de ${limit} — posible riesgo de caída.`,
    failedReps: (count) =>
      `${count} repeticiones seguidas no han alcanzado la forma objetivo — para y consulta a tu fisioterapeuta antes de continuar.`
  },
  hi: {
    joints: JOINTS_HI,
    clinician: "फ़िज़ियोथेरेपिस्ट",
    angleBlock: (joint, observed, kind, limit) =>
      kind === "max"
        ? `रुकें: आपके ${joint} का कोण (${observed}°) सुरक्षित अधिकतम ${limit}° से आगे चला गया है।`
        : `रुकें: आपके ${joint} का कोण (${observed}°) सुरक्षित न्यूनतम ${limit}° से नीचे चला गया है।`,
    angleCaution: (joint, observed, kind, limit) =>
      kind === "max"
        ? `सावधान: आपके ${joint} का कोण (${observed}°) सुरक्षित अधिकतम ${limit}° के पास पहुँच रहा है।`
        : `सावधान: आपके ${joint} का कोण (${observed}°) सुरक्षित न्यूनतम ${limit}° के पास पहुँच रहा है।`,
    trunkBlock: (observed, limit) =>
      `रुकें: धड़ का झुकाव (${observed}°) सुरक्षित सीमा ${limit}° से आगे चला गया है — संभवतः आप पीठ से भरपाई कर रहे हैं।`,
    trunkCaution: (observed, limit) =>
      `सावधान: धड़ का झुकाव (${observed}°) सुरक्षित सीमा ${limit}° के पास पहुँच रहा है।`,
    instability: (observed, limit) =>
      `रुकें: गति में अस्थिरता (${observed}) सुरक्षित सीमा ${limit} से आगे चली गई है — गिरने का ख़तरा हो सकता है।`,
    failedReps: (count) =>
      `लगातार ${count} बार सही मुद्रा नहीं बनी — रुकें और आगे बढ़ने से पहले अपने फ़िज़ियोथेरेपिस्ट से बात करें।`
  },
  fr: {
    joints: JOINTS_FR,
    clinician: "kinésithérapeute",
    angleBlock: (joint, observed, kind, limit) =>
      kind === "max"
        ? `Arrêtez : l'angle de votre ${joint} (${observed}°) a dépassé le maximum sûr de ${limit}°.`
        : `Arrêtez : l'angle de votre ${joint} (${observed}°) est passé sous le minimum sûr de ${limit}°.`,
    angleCaution: (joint, observed, kind, limit) =>
      kind === "max"
        ? `Attention : l'angle de votre ${joint} (${observed}°) approche le maximum sûr de ${limit}°.`
        : `Attention : l'angle de votre ${joint} (${observed}°) approche le minimum sûr de ${limit}°.`,
    trunkBlock: (observed, limit) =>
      `Arrêtez : l'inclinaison du tronc (${observed}°) a dépassé la limite sûre de ${limit}° — vous compensez probablement avec le dos.`,
    trunkCaution: (observed, limit) =>
      `Attention : l'inclinaison du tronc (${observed}°) approche la limite sûre de ${limit}°.`,
    instability: (observed, limit) =>
      `Arrêtez : l'instabilité du mouvement (${observed}) a dépassé la limite sûre de ${limit} — risque de chute possible.`,
    failedReps: (count) =>
      `${count} répétitions d'affilée n'ont pas atteint la forme visée — arrêtez et contactez votre kinésithérapeute avant de continuer.`
  }
};

/**
 * Localised text for a safety verdict, for display and speech.
 *
 * Falls back to `verdict.reason` — the English the gate produced — whenever
 * anything is unrecognised. A patient being blocked must hear *something*;
 * an unfamiliar rule id is a reason to speak English, never a reason to say
 * nothing. Number formatting matches the gate's exactly, so the figure spoken
 * to the patient is the figure written to their record.
 */
export function localiseSafetyReason(verdict: SafetyVerdict, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return verdict.reason;

  const strings = STRINGS[locale as Exclude<Locale, "en">];
  if (!strings) return verdict.reason;

  const family = familyOf(verdict.ruleId);
  if (!family) return verdict.reason;

  const threshold = verdict.threshold;

  switch (family) {
    case "failed_reps":
      if (!threshold) return verdict.reason;
      return strings.failedReps(threshold.observed);

    case "instability":
      if (!threshold) return verdict.reason;
      return strings.instability(threshold.observed.toFixed(2), threshold.limit.toFixed(2));

    case "trunk_block":
      if (!threshold) return verdict.reason;
      return strings.trunkBlock(threshold.observed.toFixed(1), threshold.limit);

    case "trunk_caution":
      if (!threshold) return verdict.reason;
      return strings.trunkCaution(threshold.observed.toFixed(1), threshold.limit);

    case "angle_block":
    case "angle_caution": {
      if (!threshold) return verdict.reason;
      const parsed = parseAngleThreshold(threshold.name);
      if (!parsed) return verdict.reason;
      // An unmapped joint would otherwise render a raw identifier like
      // "left_knee" mid-sentence; English prose beats that.
      const joint = strings.joints[parsed.joint];
      if (!joint) return verdict.reason;
      const build = family === "angle_block" ? strings.angleBlock : strings.angleCaution;
      return build(joint, threshold.observed.toFixed(1), parsed.kind, threshold.limit);
    }
  }
}
