import Link from "next/link";
import { BillingAdmin } from "@/components/billing-admin";
import "../../early-access/early-access.css";
export const metadata = {
  title: "Subscription & Resources · Atlas Research",
  robots: { index: false },
};

export default function AdminResourcesPage() {
  return (
    <main className="public-site public-container resource-admin">
      <Link href="/settings">Back to settings</Link>
      <h1>Subscription &amp; Resources</h1>
      <BillingAdmin />
    </main>
  );
}
