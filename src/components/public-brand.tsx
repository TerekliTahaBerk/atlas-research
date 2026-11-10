import Link from "next/link";

export function AtlasCompass({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="34"
      height="34"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth=".6" />
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="currentColor"
        strokeWidth=".35"
        strokeDasharray="1 3"
      />
      <path
        d="M24 1v46M1 24h46M8 8l32 32M8 40 40 8"
        stroke="currentColor"
        strokeWidth=".45"
      />
      <path
        d="m24 5 3.8 15.2L43 24l-15.2 3.8L24 43l-3.8-15.2L5 24l15.2-3.8L24 5Z"
        fill="currentColor"
      />
      <path
        d="m24 5 0 19 3.8-3.8L24 5Zm19 19H24l3.8 3.8L43 24ZM24 43V24l-3.8 3.8L24 43ZM5 24h19l-3.8-3.8L5 24Z"
        fill="var(--canvas, white)"
      />
      <circle cx="24" cy="24" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function PublicBrand() {
  return (
    <Link href="/" className="public-brand" aria-label="Atlas home">
      <AtlasCompass />
      <span>Atlas</span>
    </Link>
  );
}
