import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import '../styles/globals.css';
export const metadata: Metadata = {
  title: { default: 'Atlas — Research, connected.', template: '%s · Atlas' },
  description:
    'Atlas Research OS. Phase 00 interface and architecture foundation.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
