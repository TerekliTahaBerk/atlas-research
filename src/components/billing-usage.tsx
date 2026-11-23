"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  ADD_ONS,
  FOUNDING_PROFILES,
  MINUTE_MS,
  PLANS,
  formatBytes,
  formatUsd,
  type FoundingProfile,
  type PlanCode,
  type ResourceLimits,
} from "@/lib/pricing";
import { Failure, InlineError, Loading, useResource } from "./ui";
import { WorkspaceShell, type Workspace } from "./workspace-shell";
import "./billing-usage.css";

type UsageResponse = {
  planCode: PlanCode;
  planVersion: string;
  source: "free" | "subscription" | "founding";
  endsAt: string | null;
  periodStart: string;
  periodEnd: string;
  limits: ResourceLimits;
  usage: Record<keyof ResourceLimits, number>;
  seats: number;
  seatUsage: number;
  memberAiPercent: number;
  foundingProfile: FoundingProfile | null;
  canManage: boolean;
  enforced: boolean;
  foundingDaysRemaining: number | null;
  foundingMilestones?: {
    feedbackDue: boolean;
    offerEligible: boolean;
    firstYearDiscountPercent: number;
  } | null;
  capabilities: {
    checkout: false;
    pythonExecution: boolean;
    latexCompilation: boolean;
    automationExecution: boolean;
    indexing: boolean;
    foundingIntake: boolean;
  };
  topUps?: Array<{ resource: string; remaining: number; expiresAt: string }>;
  history: Array<{ resource: string; quantity: number; createdAt: string }>;
  subscription: {
    status: string;
    planCode: string;
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
};

type AcademicStatus = {
  status: "pending" | "verified" | "expired" | "rejected" | null;
  institutionDomain: string | null;
  expiresAt: string | null;
};

const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const timestamp = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const number = new Intl.NumberFormat("en-US");
const minutes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usageLabels = {
  activeProjects: "Active projects",
  storageBytes: "File storage",
  maxFileBytes: "Maximum file size",
  monthlyUploads: "File uploads",
  monthlyAiCredits: "AI credits",
  dailyAiOperationsPerMember: "Your AI operations today",
  indexedBytes: "Indexed source data",
  monthlyPythonMilliseconds: "Python time",
  maxPythonRunMilliseconds: "Maximum Python run",
  monthlyLatexCompiles: "LaTeX compilations",
  automations: "Custom automations",
} satisfies Record<keyof ResourceLimits, string>;

const meters = [
  [
    "activeProjects",
    "Archiving frees a project slot. Its files still occupy storage.",
  ],
  ["storageBytes", "Saved file bytes in this workspace."],
  ["monthlyUploads", "Successfully saved files in this resource period."],
  ["indexedBytes", "Stored index data, measured separately from PDF files."],
  [
    "monthlyAiCredits",
    "Settled credits for AI requests. Team credits are shared.",
  ],
  [
    "dailyAiOperationsPerMember",
    "Operations requested by your account in this workspace.",
  ],
  ["monthlyPythonMilliseconds", "Elapsed execution in this resource period."],
  ["monthlyLatexCompiles", "Counted compilations in this resource period."],
  ["automations", "Active custom automations."],
] as const satisfies ReadonlyArray<[keyof ResourceLimits, string]>;

function formatted(resource: keyof ResourceLimits, amount: number) {
  if (
    resource === "storageBytes" ||
    resource === "indexedBytes" ||
    resource === "maxFileBytes"
  )
    return formatBytes(amount);
  if (
    resource === "monthlyPythonMilliseconds" ||
    resource === "maxPythonRunMilliseconds"
  ) {
    return minutes.format(amount / MINUTE_MS) + " min";
  }
  return number.format(amount);
}

function Day({ value }: { value: string }) {
  return <time dateTime={value}>{date.format(new Date(value))}</time>;
}

function ResourceMeter({
  name,
  used,
  limit,
  description,
  resource,
}: {
  name: string;
  used: number;
  limit: number;
  description: string;
  resource: keyof ResourceLimits;
}) {
  return (
    <div className="billing-meter">
      <dt>{name}</dt>
      <dd>
        <strong>
          {formatted(resource, used)}{" "}
          <span>/ {formatted(resource, limit)}</span>
        </strong>
        {limit > 0 ? (
          <meter
            min={0}
            max={limit}
            value={Math.min(used, limit)}
            aria-label={name + " used"}
          />
        ) : null}
        <small>{description}</small>
      </dd>
    </div>
  );
}

function AcademicPricing({ email }: { email: string }) {
  const eligibility = useResource<AcademicStatus>("/api/academic", true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const confirmedDomain = email.split("@").at(-1) ?? "";
  const status = eligibility.data?.status;
  const expiresAt = eligibility.data?.expiresAt;
  const domain = eligibility.data?.institutionDomain;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      const institutionDomain = String(
        new FormData(event.currentTarget).get("institutionDomain") ?? "",
      )
        .trim()
        .toLowerCase();
      const result = await api<AcademicStatus>("/api/academic", {
        institutionDomain,
      });
      if (result.status === "verified") {
        setNotice(
          "Your verification is active. Re-verification opens 30 days before expiry.",
        );
      }
      eligibility.reload();
    } catch (problem) {
      setError(problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section" id="academic-pricing">
      <h2>Student pricing</h2>
      <p>
        Request review using the domain of your confirmed university email. A
        reviewer checks the institution and the request.
      </p>
      {eligibility.error ? (
        <Failure error={eligibility.error} retry={eligibility.reload} />
      ) : !eligibility.data ? (
        <Loading />
      ) : (
        <>
          {status ? (
            <p role="status" className="billing-academic-status">
              {status === "pending"
                ? "Review pending"
                : status === "verified"
                  ? "Student eligibility verified"
                  : status === "expired"
                    ? "Verification expired"
                    : "Request declined"}
              {domain ? ` · ${domain}` : ""}
              {expiresAt ? (
                <>
                  {" "}
                  · Valid through <Day value={expiresAt} />
                </>
              ) : null}
            </p>
          ) : null}
          {status === "pending" ? null : (
            <form onSubmit={(event) => void submit(event)}>
              <label>
                University email domain
                <input
                  name="institutionDomain"
                  defaultValue={confirmedDomain}
                  maxLength={253}
                  autoComplete="off"
                  required
                />
              </label>
              {error instanceof ApiError &&
              error.code === "ACADEMIC_UNAVAILABLE" ? (
                <p role="alert">
                  Use the domain of your verified university email. The
                  institution must be approved for student pricing.
                </p>
              ) : (
                <InlineError error={error} />
              )}
              {notice ? <p role="status">{notice}</p> : null}
              <div className="settings-save-row">
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Submitting…"
                    : status === "verified" || status === "expired"
                      ? "Request re-verification"
                      : "Request verification"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function TeamPoolSettings({
  workspaceId,
  current,
  reload,
}: {
  workspaceId: string;
  current: number;
  reload: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<unknown>();
  const [notice, setNotice] = useState("");
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setProblem(undefined);
    setNotice("");
    const memberAiPercent = Number(
      new FormData(event.currentTarget).get("memberAiPercent"),
    );
    try {
      await api(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/usage`,
        { memberAiPercent },
        "PATCH",
      );
      setNotice("Member AI limit saved.");
      reload();
    } catch (error) {
      setProblem(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="billing-member-limit"
      onSubmit={(event) => void change(event)}
    >
      <label>
        Maximum share of monthly AI credits per member
        <input
          type="number"
          name="memberAiPercent"
          min={1}
          max={100}
          step={1}
          required
          key={current}
          defaultValue={current}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save member limit"}
      </button>
      <InlineError error={problem} />
      {notice ? <p role="status">{notice}</p> : null}
    </form>
  );
}

const ledgerLabels: Record<string, [keyof ResourceLimits, string]> = {
  aiCredits: ["monthlyAiCredits", "AI credits"],
  pythonMilliseconds: ["monthlyPythonMilliseconds", "Python time"],
  latexCompiles: ["monthlyLatexCompiles", "LaTeX compilation"],
  automations: ["automations", "Automation"],
  storageBytes: ["storageBytes", "File storage"],
  monthlyUploads: ["monthlyUploads", "File upload"],
  indexedBytes: ["indexedBytes", "Indexed source"],
};

function TopUpBalances({
  topUps,
}: {
  topUps: NonNullable<UsageResponse["topUps"]>;
}) {
  if (!topUps.length) return null;
  return (
    <section className="settings-section">
      <h2>Purchased balances</h2>
      <dl className="billing-addon-list">
        {topUps.map(({ resource, remaining, expiresAt }, index) => {
          const [kind, label] = ledgerLabels[resource] ?? [
            "activeProjects",
            "Resource",
          ];
          return (
            <div key={`${resource}-${expiresAt}-${index}`}>
              <dt>{label}</dt>
              <dd>
                {formatted(kind, remaining)} remaining · Expires{" "}
                <Day value={expiresAt} />
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function ResourceHistory({ history }: { history: UsageResponse["history"] }) {
  return (
    <section className="settings-section">
      <h2>Recent resource activity</h2>
      {history.length ? (
        <ul className="billing-history">
          {history.map(({ resource, quantity, createdAt }, index) => {
            const [kind, label] = ledgerLabels[resource] ?? [
              "activeProjects",
              resource.replaceAll("_", " "),
            ];
            return (
              <li key={`${resource}-${createdAt}-${index}`}>
                <span>{label}</span>
                <time dateTime={createdAt}>
                  {timestamp.format(new Date(createdAt))} UTC
                </time>
                <strong>{formatted(kind, quantity)}</strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>There is no resource activity in this period.</p>
      )}
    </section>
  );
}

function UsageDetails({
  report,
  workspace,
  reload,
}: {
  report: UsageResponse;
  workspace: Workspace;
  reload: () => void;
}) {
  return (
    <>
      <section className="settings-section">
        <h2>
          {workspace.kind === "shared"
            ? "Shared workspace capacity"
            : "Personal workspace capacity"}
        </h2>
        <p>
          Resource period <Day value={report.periodStart} /> to{" "}
          <Day value={report.periodEnd} /> (UTC)
        </p>
        <dl className="billing-meters">
          {meters.map(([key, description]) => (
            <ResourceMeter
              key={key}
              name={usageLabels[key]}
              resource={key}
              used={report.usage[key]}
              limit={report.limits[key]}
              description={description}
            />
          ))}
          {workspace.kind === "shared" ? (
            <ResourceMeter
              name="Editor seats"
              resource="activeProjects"
              used={report.seatUsage}
              limit={report.seats}
              description="Viewers do not use an editor seat."
            />
          ) : null}
        </dl>
        <p className="billing-per-job">
          {usageLabels.maxFileBytes} is{" "}
          {formatted("maxFileBytes", report.limits.maxFileBytes)}.{" "}
          {usageLabels.maxPythonRunMilliseconds} is{" "}
          {formatted(
            "maxPythonRunMilliseconds",
            report.limits.maxPythonRunMilliseconds,
          )}
          .
        </p>
        {report.capabilities &&
        (!report.capabilities.pythonExecution ||
          !report.capabilities.latexCompilation ||
          !report.capabilities.automationExecution) ? (
          <p>
            Python execution, native LaTeX compilation and custom automation
            runs are unavailable.
          </p>
        ) : null}
        {workspace.kind === "shared" && report.planCode === "TEAM" ? (
          <div className="billing-pool">
            <h3>Team AI pool</h3>
            <p>
              Each member can use up to {report.memberAiPercent}% of the shared
              monthly allowance. Personal credits stay in the personal
              workspace.
            </p>
            {report.canManage ? (
              <TeamPoolSettings
                key={workspace.id}
                workspaceId={workspace.id}
                current={report.memberAiPercent}
                reload={reload}
              />
            ) : null}
          </div>
        ) : null}
      </section>
      {report.topUps ? <TopUpBalances topUps={report.topUps} /> : null}
      {report.foundingMilestones?.feedbackDue ||
      report.foundingMilestones?.offerEligible ? (
        <section className="settings-section">
          <h2>Founding Access</h2>
          {report.foundingMilestones.feedbackDue ? (
            <p>
              Share your pilot feedback through{" "}
              <Link href="/help">Help and support</Link>.
            </p>
          ) : null}
          {report.foundingMilestones.offerEligible ? (
            <p>
              Your workspace is eligible for the planned{" "}
              {report.foundingMilestones.firstYearDiscountPercent}% first-year
              founding offer. Checkout is currently closed.
            </p>
          ) : null}
        </section>
      ) : null}
      <ResourceHistory history={report.history} />
    </>
  );
}

function SubscriptionDetails({ report }: { report: UsageResponse }) {
  const addOns = Object.values(ADD_ONS).filter((offer) => {
    const plans: readonly PlanCode[] = offer.compatiblePlans;
    return plans.includes(report.planCode);
  });

  return (
    <>
      <section className="settings-section">
        <h2>Plan and renewal</h2>
        {report.subscription ? (
          <p className="billing-subscription-status">
            Status {report.subscription.status.replaceAll("_", " ")} · Current
            term ends <Day value={report.subscription.periodEnd} />.
          </p>
        ) : report.source === "founding" && report.endsAt ? (
          <p>
            Founding Access is active through <Day value={report.endsAt} />.
            Your workspace does not renew into a paid subscription.
          </p>
        ) : (
          <p>This workspace has no paid subscription.</p>
        )}
        <p>Checkout is closed in this environment.</p>
        <Link className="button" href="/pricing">
          Compare plans
        </Link>
      </section>
      {report.canManage && addOns.length ? (
        <section className="settings-section">
          <h2>Extra resource pricing</h2>
          <dl className="billing-addon-list">
            {addOns.map((offer) => (
              <div key={offer.label}>
                <dt>{offer.label}</dt>
                <dd>
                  {formatUsd(offer.cents)}{" "}
                  {offer.mode === "monthly"
                    ? "per month"
                    : `once, valid for ${offer.validMonths} months`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}

export function BillingUsagePanel({
  workspace,
  path,
  email,
}: {
  workspace: Workspace;
  path: string;
  email?: string;
}) {
  const section =
    useSearchParams().get("view") === "subscription" ? "subscription" : "usage";
  const join = path.includes("?") ? "&" : "?";
  const usage = useResource<UsageResponse>(
    `/api/workspaces/${encodeURIComponent(workspace.id)}/usage`,
  );
  const report = usage.data;
  const plan = report && PLANS[report.planCode];
  const founding =
    report?.foundingProfile && FOUNDING_PROFILES[report.foundingProfile];

  return (
    <div className="billing-panel">
      <nav aria-label="Billing sections" className="billing-tabs">
        <Link
          href={path}
          aria-current={section === "usage" ? "page" : undefined}
        >
          Usage
        </Link>
        <Link
          href={`${path}${join}view=subscription`}
          aria-current={section === "subscription" ? "page" : undefined}
        >
          Subscription
        </Link>
      </nav>
      {usage.error ? (
        <Failure error={usage.error} retry={usage.reload} />
      ) : !report ? (
        <Loading />
      ) : (
        <>
          <section
            className="billing-plan-summary"
            aria-labelledby="billing-current-plan"
          >
            <div>
              <p>Current access</p>
              <h2 id="billing-current-plan">
                {founding ? founding.label : (plan?.label ?? report.planCode)}
              </h2>
              {report.endsAt ? (
                <p>
                  Access through <Day value={report.endsAt} />
                  {report.foundingDaysRemaining === null
                    ? null
                    : ` · ${number.format(report.foundingDaysRemaining)} days remaining`}
                </p>
              ) : null}
            </div>
            <p>
              Plan version <strong>{report.planVersion}</strong>
            </p>
          </section>
          {report.enforced ? null : (
            <p className="billing-operating-note">
              Plan enforcement is off for this workspace. Individual services
              can still apply their safety limits.
            </p>
          )}
          {section === "usage" ? (
            <UsageDetails
              report={report}
              workspace={workspace}
              reload={usage.reload}
            />
          ) : (
            <SubscriptionDetails report={report} />
          )}
        </>
      )}
      {section === "subscription" && email ? (
        <AcademicPricing email={email} />
      ) : null}
    </div>
  );
}

export function WorkspaceUsageScreen({ workspaceId }: { workspaceId: string }) {
  return (
    <WorkspaceShell title="Billing and usage" surface="settings">
      {({ workspaces, reload }) => {
        const workspace = workspaces.find((item) => item.id === workspaceId);
        if (!workspace) return <Failure error={null} retry={reload} />;
        const base = `/w/${encodeURIComponent(workspace.id)}`;
        return (
          <div className="settings-content settings-scope">
            <Link href={base + "/settings"}>← Workspace settings</Link>
            <header>
              <small>{workspace.name}</small>
              <h1>Billing and usage</h1>
            </header>
            <BillingUsagePanel
              key={workspace.id}
              workspace={workspace}
              path={base + "/usage"}
            />
          </div>
        );
      }}
    </WorkspaceShell>
  );
}
