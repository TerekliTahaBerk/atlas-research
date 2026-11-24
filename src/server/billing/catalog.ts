/** Version 1 USD plan catalog. Quotas use decimal MB/GB and elapsed milliseconds. */
export const PLAN_VERSION = "2026-11-23.1";
export const BILLING_CURRENCY = "USD";
export const MB = 1_000_000;
export const GB = 1_000 * MB;
export const MINUTE_MS = 60_000;
export const TEAM_MIN_SEATS = 3;
export const DEFAULT_TEAM_AI_MEMBER_PERCENT = 40;
export const FOUNDING_DURATION_DAYS = 90;
export const FOUNDING_EXTENSION_MAX_DAYS = 30;
export const FOUNDING_FEEDBACK_DAY = 60;
export const FOUNDING_OFFER_DAY = 75;
export const FOUNDING_FIRST_YEAR_DISCOUNT_PERCENT = 30;
export const FOUNDING_AI_MONTHLY_BUDGET_MICRO_USD = 180_000_000;

export type PlanCode =
  | "FREE"
  | "PLUS"
  | "PRO"
  | "TEAM"
  | "INSTITUTION"
  | "PLUS_STUDENT"
  | "PRO_STUDENT";

export type BillingInterval = "monthly" | "yearly";

export type ResourceLimits = Readonly<{
  activeProjects: number;
  storageBytes: number;
  maxFileBytes: number;
  monthlyUploads: number;
  monthlyAiCredits: number;
  dailyAiOperationsPerMember: number;
  indexedBytes: number;
  monthlyPythonMilliseconds: number;
  maxPythonRunMilliseconds: number;
  monthlyLatexCompiles: number;
  automations: number;
}>;

type PlanDefinition = Readonly<{
  label: string;
  audience: string;
  monthlyCents: number | null;
  yearlyCents: number | null;
  scope: "personal" | "shared" | "contract";
  student: boolean;
  limits: ResourceLimits | null;
}>;

export const PLANS: Readonly<Record<PlanCode, PlanDefinition>> = {
  FREE: {
    label: "Free",
    audience: "Individual research and writing",
    monthlyCents: 0,
    yearlyCents: 0,
    scope: "personal",
    student: false,
    limits: {
      activeProjects: 3,
      storageBytes: GB,
      maxFileBytes: 10 * MB,
      monthlyUploads: 20,
      monthlyAiCredits: 20,
      dailyAiOperationsPerMember: 5,
      indexedBytes: 25 * MB,
      monthlyPythonMilliseconds: 20 * MINUTE_MS,
      maxPythonRunMilliseconds: MINUTE_MS,
      monthlyLatexCompiles: 20,
      automations: 0,
    },
  },
  PLUS: {
    label: "Plus",
    audience: "Researchers with a growing library",
    monthlyCents: 900,
    yearlyCents: 9_000,
    scope: "personal",
    student: false,
    limits: {
      activeProjects: 25,
      storageBytes: 10 * GB,
      maxFileBytes: 25 * MB,
      monthlyUploads: 150,
      monthlyAiCredits: 150,
      dailyAiOperationsPerMember: 25,
      indexedBytes: 500 * MB,
      monthlyPythonMilliseconds: 120 * MINUTE_MS,
      maxPythonRunMilliseconds: 5 * MINUTE_MS,
      monthlyLatexCompiles: 150,
      automations: 3,
    },
  },
  PRO: {
    label: "Pro",
    audience: "Larger, long-running research projects",
    monthlyCents: 1_900,
    yearlyCents: 19_000,
    scope: "personal",
    student: false,
    limits: {
      activeProjects: 100,
      storageBytes: 50 * GB,
      maxFileBytes: 100 * MB,
      monthlyUploads: 500,
      monthlyAiCredits: 400,
      dailyAiOperationsPerMember: 60,
      indexedBytes: 2 * GB,
      monthlyPythonMilliseconds: 600 * MINUTE_MS,
      maxPythonRunMilliseconds: 15 * MINUTE_MS,
      monthlyLatexCompiles: 500,
      automations: 20,
    },
  },
  TEAM: {
    label: "Team",
    audience: "Shared projects and workspace resources",
    monthlyCents: 1_500,
    yearlyCents: 15_000,
    scope: "shared",
    student: false,
    limits: null,
  },
  INSTITUTION: {
    label: "Institution",
    audience: "Universities, labs and research institutions",
    monthlyCents: null,
    yearlyCents: null,
    scope: "contract",
    student: false,
    limits: null,
  },
  PLUS_STUDENT: {
    label: "Plus Student",
    audience: "Verified students",
    monthlyCents: 450,
    yearlyCents: null,
    scope: "personal",
    student: true,
    limits: null,
  },
  PRO_STUDENT: {
    label: "Pro Student",
    audience: "Verified students",
    monthlyCents: 950,
    yearlyCents: null,
    scope: "personal",
    student: true,
    limits: null,
  },
};

export const PUBLIC_PLAN_CODES = [
  "FREE",
  "PLUS",
  "PRO",
  "TEAM",
  "INSTITUTION",
] as const;
export const STUDENT_PLAN_CODES = ["PLUS_STUDENT", "PRO_STUDENT"] as const;

const TEAM_STORAGE_PER_SEAT = 15 * GB;

export function validTeamSeatCount(seats: number) {
  return (
    Number.isSafeInteger(seats) &&
    seats >= TEAM_MIN_SEATS &&
    Number.isSafeInteger(seats * TEAM_STORAGE_PER_SEAT)
  );
}

function teamSeats(seats: number) {
  if (!validTeamSeatCount(seats))
    throw new RangeError("Team requires at least three valid paid seats.");
  return seats;
}

export function resolvePlanLimits(
  code: PlanCode,
  seats = TEAM_MIN_SEATS,
): ResourceLimits {
  switch (code) {
    case "TEAM": {
      const count = teamSeats(seats);
      return {
        activeProjects: 50 + 20 * count,
        storageBytes: TEAM_STORAGE_PER_SEAT * count,
        // Team's per-file ceiling remains the Pro ceiling at every seat count.
        maxFileBytes: 100 * MB,
        monthlyUploads: 300 * count,
        monthlyAiCredits: 250 * count,
        dailyAiOperationsPerMember: 30,
        indexedBytes: GB * count,
        monthlyPythonMilliseconds: 300 * MINUTE_MS * count,
        maxPythonRunMilliseconds: 15 * MINUTE_MS,
        monthlyLatexCompiles: 250 * count,
        automations: 15 * count,
      };
    }
    case "PLUS_STUDENT":
      return { ...resolvePlanLimits("PLUS"), monthlyAiCredits: 100 };
    case "PRO_STUDENT":
      return { ...resolvePlanLimits("PRO"), monthlyAiCredits: 250 };
    case "INSTITUTION":
      throw new RangeError(
        "Institution requires a contractual resource allocation.",
      );
    default:
      return PLANS[code].limits!;
  }
}

export function priceFor(
  code: PlanCode,
  interval: BillingInterval,
  seats = TEAM_MIN_SEATS,
): number | null {
  const plan = PLANS[code];
  const cents = interval === "monthly" ? plan.monthlyCents : plan.yearlyCents;
  return cents === null
    ? null
    : code === "TEAM"
      ? cents * teamSeats(seats)
      : cents;
}

export const FOUNDING_PROFILES = {
  RES_FOUNDING_STUDENT: {
    label: "Founding Student",
    basePlan: "PRO",
    capacity: 20,
    seats: 1,
    overrides: {
      storageBytes: 5 * GB,
      monthlyAiCredits: 120,
      monthlyPythonMilliseconds: 120 * MINUTE_MS,
    },
  },
  RES_FOUNDING_RESEARCHER: {
    label: "Founding Researcher",
    basePlan: "PRO",
    capacity: 15,
    seats: 1,
    overrides: {
      storageBytes: 20 * GB,
      monthlyAiCredits: 160,
      monthlyPythonMilliseconds: 300 * MINUTE_MS,
    },
  },
  RES_FOUNDING_TEAM: {
    label: "Founding Team",
    basePlan: "TEAM",
    capacity: 10,
    seats: 5,
    overrides: {
      storageBytes: 75 * GB,
      monthlyAiCredits: 500,
      monthlyPythonMilliseconds: 600 * MINUTE_MS,
    },
  },
  RES_FOUNDING_LAB: {
    label: "Founding Lab",
    basePlan: "TEAM",
    capacity: 5,
    seats: 10,
    overrides: {
      storageBytes: 150 * GB,
      monthlyAiCredits: 750,
      monthlyPythonMilliseconds: 1_000 * MINUTE_MS,
    },
  },
} as const satisfies Record<
  string,
  {
    label: string;
    basePlan: "PRO" | "TEAM";
    capacity: number;
    seats: number;
    overrides: Partial<ResourceLimits>;
  }
>;

export type FoundingProfile = keyof typeof FOUNDING_PROFILES;

export function resolveFoundingLimits(
  profile: FoundingProfile,
): ResourceLimits {
  const definition = FOUNDING_PROFILES[profile];
  return {
    ...resolvePlanLimits(definition.basePlan, definition.seats),
    ...definition.overrides,
  };
}

type AddOn = Readonly<{
  label: string;
  cents: number;
  mode: "one_time" | "monthly";
  resource:
    "monthlyAiCredits" | "storageBytes" | "monthlyPythonMilliseconds" | "seats";
  quantity: number;
  validMonths: number | null;
  compatiblePlans: readonly PlanCode[];
}>;

const meteredPlans = [
  "PLUS",
  "PRO",
  "TEAM",
  "PLUS_STUDENT",
  "PRO_STUDENT",
] as const satisfies readonly PlanCode[];

export const ADD_ONS = {
  AI_100: {
    label: "100 AI credits",
    cents: 300,
    mode: "one_time",
    resource: "monthlyAiCredits",
    quantity: 100,
    validMonths: 12,
    compatiblePlans: meteredPlans,
  },
  AI_500: {
    label: "500 AI credits",
    cents: 1_200,
    mode: "one_time",
    resource: "monthlyAiCredits",
    quantity: 500,
    validMonths: 12,
    compatiblePlans: meteredPlans,
  },
  STORAGE_10_GB: {
    label: "10 GB extra file storage",
    cents: 200,
    mode: "monthly",
    resource: "storageBytes",
    quantity: 10 * GB,
    validMonths: null,
    compatiblePlans: meteredPlans,
  },
  PYTHON_100_MINUTES: {
    label: "100 Python minutes",
    cents: 200,
    mode: "one_time",
    resource: "monthlyPythonMilliseconds",
    quantity: 100 * MINUTE_MS,
    validMonths: 12,
    compatiblePlans: meteredPlans,
  },
  TEAM_SEAT: {
    label: "One additional Team seat",
    cents: 1_500,
    mode: "monthly",
    resource: "seats",
    quantity: 1,
    validMonths: null,
    compatiblePlans: ["TEAM"],
  },
} as const satisfies Record<string, AddOn>;

export type AddOnCode = keyof typeof ADD_ONS;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: BILLING_CURRENCY,
});
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: BILLING_CURRENCY,
  maximumFractionDigits: 0,
});

export function formatUsd(cents: number) {
  return (cents % 100 === 0 ? usdWhole : usd).format(cents / 100);
}

const bytesCompact = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const bytesInteger = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatBytes(bytes: number) {
  const magnitude = Math.abs(bytes);
  if (magnitude >= GB) return bytesCompact.format(bytes / GB) + " GB";
  if (magnitude >= MB) return bytesCompact.format(bytes / MB) + " MB";
  if (magnitude >= 1_000) return bytesCompact.format(bytes / 1_000) + " KB";
  return bytesInteger.format(bytes) + " B";
}
