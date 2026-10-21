'use client';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
