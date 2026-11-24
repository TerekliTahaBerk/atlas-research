import Link from "next/link";
import type { Metadata } from "next";
import { PublicBrand } from "@/components/public-brand";
import { EarlyAccessApplication } from "@/components/early-access";
import { foundingIntakeEnabled } from "@/server/billing/founding";
import { FOUNDING_PROFILES, formatBytes } from "@/lib/pricing";
import "./early-access.css";

export const metadata: Metadata = { title: "Founding Access · Atlas Research" };
export const dynamic = "force-dynamic";

export default function EarlyAccess() {
  const open = foundingIntakeEnabled();
  return (
    <div className="public-site">
      <header className="public-header">
        <div>
          <PublicBrand />
          <div className="public-header-actions">
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-in">Log in</Link>
          </div>
        </div>
      </header>
      <main className="public-container founding-layout">
        <div>
          <h1>Founding Researcher Access</h1>
          <p>
            A 90-day, card-free pilot for researchers and teams. Applications
            are reviewed before an invitation is issued.
          </p>
          <div className="founding-profiles">
            {Object.values(FOUNDING_PROFILES).map((profile) => (
              <article key={profile.label}>
                <h2>{profile.label}</h2>
                <p>
                  {profile.capacity}{" "}
                  {profile.seats === 1 ? "accounts" : "workspaces"} ·{" "}
                  {profile.seats} {profile.seats === 1 ? "editor" : "editors"}
                </p>
                <p>
                  {formatBytes(profile.overrides.storageBytes)} storage ·{" "}
                  {profile.overrides.monthlyAiCredits} AI credits per period
                </p>
              </article>
            ))}
          </div>
          <p>
            After the pilot you can choose Free or a paid plan. Atlas does not
            charge automatically at expiration.
          </p>
        </div>
        {open ? (
          <EarlyAccessApplication />
        ) : (
          <section className="founding-panel">
            <h2>Applications are closed</h2>
            <p>
              Already invited? Open the personal link provided with your
              invitation.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
