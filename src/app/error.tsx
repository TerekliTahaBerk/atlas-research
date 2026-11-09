"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>Something went wrong</h1>
      <p>Your request could not be completed. Try loading the page again.</p>
      <button onClick={reset}>Try again</button>
      <a className="button" href="/home">
        Back to Home
      </a>
    </main>
  );
}
