import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>This page is unavailable</h1>
      <p>Check the link, or return to your workspace.</p>
      <Link className="button" href="/home">
        Back to Home
      </Link>
    </main>
  );
}
