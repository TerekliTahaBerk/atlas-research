"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ADD_ONS,
  BILLING_CURRENCY,
  MINUTE_MS,
  PLANS,
  PUBLIC_PLAN_CODES,
  STUDENT_PLAN_CODES,
  TEAM_MIN_SEATS,
  formatBytes,
  formatUsd,
  priceFor,
  resolvePlanLimits,
  validTeamSeatCount,
  type BillingInterval,
  type ResourceLimits,
} from "@/lib/pricing";

const number = new Intl.NumberFormat("en-US");

function DetailedLimits({ limits }: { limits: ResourceLimits }) {
  return (
    <details className="pricing-details">
      <summary>All resource limits</summary>
      <dl>
        <div>
          <dt>Maximum file</dt>
          <dd>{formatBytes(limits.maxFileBytes)}</dd>
        </div>
        <div>
          <dt>Uploads each month</dt>
          <dd>{number.format(limits.monthlyUploads)}</dd>
        </div>
        <div>
          <dt>AI operations a day, per member</dt>
          <dd>{limits.dailyAiOperationsPerMember}</dd>
        </div>
        <div>
          <dt>Indexed sources</dt>
          <dd>{formatBytes(limits.indexedBytes)}</dd>
        </div>
        <div>
          <dt>Python per month</dt>
          <dd>
            {number.format(limits.monthlyPythonMilliseconds / MINUTE_MS)} min
          </dd>
        </div>
        <div>
          <dt>Maximum Python run</dt>
          <dd>{limits.maxPythonRunMilliseconds / MINUTE_MS} min</dd>
        </div>
        <div>
          <dt>LaTeX builds per month</dt>
          <dd>{number.format(limits.monthlyLatexCompiles)}</dd>
        </div>
        <div>
          <dt>Custom automations</dt>
          <dd>{number.format(limits.automations)}</dd>
        </div>
      </dl>
    </details>
  );
}

export function PricingComparison() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [seatInput, setSeatInput] = useState(String(TEAM_MIN_SEATS));
  const requested = Number(seatInput);
  const validSeatCount = validTeamSeatCount(requested);
  const seats = validSeatCount ? requested : TEAM_MIN_SEATS;
  const period = interval === "monthly" ? "month" : "year";

  return (
    <div className="pricing-content public-container">
      <header className="pricing-heading">
        <div>
          <h1>Plans for your research</h1>
          <p>
            Compare personal plans and shared workspace capacity. All prices are
            in {BILLING_CURRENCY}.
          </p>
        </div>
        <fieldset className="pricing-cycle">
          <legend className="pricing-sr">Billing interval</legend>
          {(["monthly", "yearly"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="billingInterval"
                value={value}
                checked={interval === value}
                onChange={() => setInterval(value)}
              />
              <span>{value === "monthly" ? "Monthly" : "Yearly"}</span>
            </label>
          ))}
        </fieldset>
      </header>

      <div className="pricing-grid">
        {PUBLIC_PLAN_CODES.map((code) => {
          const plan = PLANS[code];
          if (code === "INSTITUTION") {
            return (
              <section
                key={code}
                className="pricing-institution"
                aria-labelledby={"pricing-" + code}
              >
                <div>
                  <h2 id={"pricing-" + code}>{plan.label}</h2>
                  <p>
                    {plan.audience}. Seats and resources are allocated by
                    contract.
                  </p>
                </div>
                <strong>Custom pricing</strong>
              </section>
            );
          }
          const limits = resolvePlanLimits(code, seats);
          const price =
            interval === "monthly" ? plan.monthlyCents : plan.yearlyCents;
          const team = code === "TEAM";
          return (
            <section
              key={code}
              className="pricing-card"
              data-plan={code}
              aria-labelledby={"pricing-" + code}
            >
              <h2 id={"pricing-" + code}>{plan.label}</h2>
              <p className="pricing-audience">{plan.audience}</p>
              <p className="pricing-amount">
                <strong>{formatUsd(price ?? 0)}</strong>
                <span>
                  {" "}
                  / {team ? "seat / " : ""}
                  {period}
                </span>
              </p>
              <ul className="pricing-key-limits">
                <li>
                  <strong>{number.format(limits.activeProjects)}</strong> active
                  projects
                </li>
                <li>
                  <strong>{formatBytes(limits.storageBytes)}</strong> file
                  storage
                </li>
                <li>
                  <strong>{number.format(limits.monthlyAiCredits)}</strong> AI
                  credits / month
                </li>
              </ul>
              <DetailedLimits limits={limits} />
              {team ? (
                <div className="pricing-team-estimate">
                  <label>
                    Seats
                    <input
                      type="number"
                      inputMode="numeric"
                      min={TEAM_MIN_SEATS}
                      step={1}
                      value={seatInput}
                      onChange={(event) => setSeatInput(event.target.value)}
                      aria-invalid={!validSeatCount || undefined}
                      aria-describedby="pricing-team-minimum"
                    />
                  </label>
                  <span id="pricing-team-minimum">
                    Minimum {TEAM_MIN_SEATS} paid seats
                  </span>
                  <p role="status">
                    {validSeatCount
                      ? `${formatUsd(priceFor(code, interval, seats) ?? 0)} / ${period} for ${number.format(seats)} seats`
                      : `Enter a whole number of at least ${TEAM_MIN_SEATS} seats.`}
                  </p>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="pricing-availability">
        Checkout and custom automations are unavailable here. Python and LaTeX
        depend on runner availability and workspace limits. AI and indexing
        depend on workspace and infrastructure settings.
      </p>
      <div className="pricing-secondary">
        <section
          className="pricing-secondary-card"
          aria-labelledby="pricing-students"
        >
          <h2 id="pricing-students">Student pricing</h2>
          <p>Students at verified institutions can request monthly pricing.</p>
          <ul>
            {STUDENT_PLAN_CODES.map((code) => (
              <li key={code}>
                <strong>{PLANS[code].label}</strong>
                <span>
                  {formatUsd(priceFor(code, "monthly") ?? 0)} / month ·{" "}
                  {resolvePlanLimits(code).monthlyAiCredits} AI credits
                </span>
              </li>
            ))}
          </ul>
          <Link
            className="public-text-link"
            href="/settings?tab=usage&view=subscription#academic-pricing"
          >
            Verify student eligibility
          </Link>
        </section>
        <section
          className="pricing-secondary-card"
          aria-labelledby="pricing-addons"
        >
          <h2 id="pricing-addons">Extra resources</h2>
          <ul>
            {Object.entries(ADD_ONS).map(([key, addOn]) => (
              <li key={key}>
                <strong>{addOn.label}</strong>
                <span>
                  {formatUsd(addOn.cents)}{" "}
                  {addOn.mode === "monthly"
                    ? "/ month"
                    : `once · valid ${addOn.validMonths} months`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
