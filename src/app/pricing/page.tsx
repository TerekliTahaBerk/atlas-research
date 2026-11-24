import type { Metadata } from "next";
import Link from "next/link";
import { PublicBrand } from "@/components/public-brand";
import { PricingComparison } from "@/components/pricing-comparison";
import "./pricing.css";

export const metadata: Metadata = {
  title: "Pricing · Atlas Research",
  description:
    "Compare Atlas Research plans, workspace resources and student pricing.",
};

export default function PricingPage() {
  return (
    <div className="public-site pricing-page">
      <a className="public-skip" href="#pricing-main">
        Skip to content
      </a>
      <header className="public-header">
        <div>
          <PublicBrand />
          <div className="public-header-actions">
            <Link href="/sign-in">Log in</Link>
            <Link className="public-button public-primary" href="/early-access">
              Early access
            </Link>
          </div>
        </div>
      </header>
      <main id="pricing-main">
        <PricingComparison />
      </main>
      <footer className="public-footer public-container">
        <PublicBrand />
        <p>A connected research workspace.</p>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/early-access">Early access</Link>
          <Link href="/sign-in">Log in</Link>
        </nav>
        <small>Atlas Research</small>
      </footer>
    </div>
  );
}
