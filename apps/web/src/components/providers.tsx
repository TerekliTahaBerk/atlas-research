'use client';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { ToastProvider } from '@/components/atlas/toast';
/**
 * Dark-first (handoff §1). `class` keeps the Phase 00 theme contract;
 * `data-theme` is the handoff's selector for the token sheet.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute={['class', 'data-theme']}
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={300}>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
