import { headers } from "next/headers";
import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import { WorkspaceProvider } from "@/components/workspace-context";

export const metadata: Metadata = {
  title: "Atlas Research",
  description: "A connected research workspace.",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-atlas-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('atlas-theme')==='dark'?'dark':'light'}catch{}",
          }}
        />
      </head>
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
