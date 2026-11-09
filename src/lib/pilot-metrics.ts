import { z } from "zod";
const count = z.number().int().min(0).max(1000000);
const fraction = z
  .object({ observed: z.boolean(), numerator: count, denominator: count })
  .strict()
  .refine((v) => v.numerator <= v.denominator, "Numerator exceeds denominator");
export const pilotMeasurements = z
  .object({
    version: z.literal(1),
    evidence: z.enum(["observed", "synthetic"]),
    participants: count,
    teams: count,
    supportAssigned: z.boolean(),
    activationWindowComplete: z.boolean(),
    returnWindowComplete: z.boolean(),
    M1: fraction,
    M2: fraction,
    M3: fraction,
    M4: fraction,
    M5: fraction,
    M6: fraction,
    M7: z
      .object({
        observed: z.boolean(),
        papers: count,
        questions: count,
        locators: fraction,
        claims: fraction,
        abstentions: fraction,
        leaks: count,
      })
      .strict(),
  })
  .strict();
export type PilotMeasurements = z.infer<typeof pilotMeasurements>;
export function summarizePilot(raw: unknown) {
  const p = pilotMeasurements.parse(raw);
  const rows = Object.fromEntries(
    (["M1", "M2", "M3", "M4", "M5", "M6"] as const).map((id) => {
      const v = p[id],
        rate = v.denominator ? v.numerator / v.denominator : null;
      const observed =
        v.observed &&
        v.denominator > 0 &&
        (id !== "M1" || p.activationWindowComplete) &&
        (id !== "M4" || p.returnWindowComplete);
      const meets =
        rate !== null &&
        (id === "M1"
          ? rate >= 0.6
          : id === "M2"
            ? rate >= 0.8
            : id === "M4"
              ? rate >= 0.5
              : id === "M3"
                ? rate === 1
                : v.numerator === 0);
      return [
        id,
        {
          ...v,
          rate,
          status: !observed
            ? "NOT RUN"
            : p.evidence === "synthetic"
              ? "SYNTHETIC ONLY"
              : meets
                ? "MET"
                : "BELOW TARGET",
        },
      ];
    }),
  );
  const metrics = rows as Record<
    "M1" | "M2" | "M3" | "M4" | "M5" | "M6",
    {
      observed: boolean;
      numerator: number;
      denominator: number;
      rate: number | null;
      status: string;
    }
  >;
  const a = p.M7,
    evalObserved =
      a.observed &&
      a.locators.observed &&
      a.claims.observed &&
      a.abstentions.observed &&
      a.papers >= 10 &&
      a.questions >= 40 &&
      a.locators.denominator >= 50 &&
      a.claims.denominator > 0 &&
      a.abstentions.denominator >= 10;
  const supported =
    evalObserved &&
    a.locators.numerator === a.locators.denominator &&
    a.claims.numerator / a.claims.denominator >= 0.9 &&
    a.abstentions.numerator / a.abstentions.denominator >= 0.9 &&
    a.leaks === 0;
  return {
    evidence: p.evidence,
    participants: p.participants,
    teams: p.teams,
    supportAssigned: p.supportAssigned,
    metrics: {
      ...metrics,
      M7: {
        ...a,
        status: !evalObserved
          ? "NOT RUN"
          : p.evidence === "synthetic"
            ? "SYNTHETIC ONLY"
            : supported
              ? "MET"
              : "BELOW TARGET",
      },
    },
    releaseDecision:
      "OWNER REVIEW REQUIRED; metric targets alone do not close security, recovery or G01–G05 gates",
  };
}
