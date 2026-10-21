import { AppShell } from '@/features/shell/app-shell';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
