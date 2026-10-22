import { connection } from 'next/server';
import { isLive } from '@/lib/env';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import '@fontsource-variable/geist';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '../styles/globals.css';
export const metadata: Metadata = {
  title: { default: 'Atlas — Research, connected.', template: '%s · Atlas' },
  description:
    'Atlas Research OS. Research workspaces and project collaboration, with clearly labeled future modules.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#171817' },
    { media: '(prefers-color-scheme: light)', color: '#f2f1eb' },
  ],
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isLive()) await connection();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
