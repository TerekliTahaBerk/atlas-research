import { PublicBrand } from "@/components/public-brand";
import { EarlyAccessActivation } from "@/components/early-access";
import "../early-access.css";
export const metadata = {
  title: "Activate Founding Access · Atlas Research",
  referrer: "no-referrer" as const,
};
export default function ActivatePage() {
  return (
    <div className="public-site">
      <header className="public-header">
        <div>
          <PublicBrand />
        </div>
      </header>
      <main className="public-container founding-layout">
        <div>
          <h1>Activate Founding Access</h1>
          <p>
            Use the verified email from your invitation. Choose the individual
            or shared workspace you own.
          </p>
        </div>
        <EarlyAccessActivation />
      </main>
    </div>
  );
}
