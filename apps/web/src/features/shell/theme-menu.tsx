'use client';
import { useTheme } from 'next-themes';
import { useHydrated } from './use-media';
import { Monitor, Moon, Sun, SunMoon } from 'lucide-react';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/atlas/overlay';
/** Light / dark / system preference (persisted by next-themes as `theme`). */
export function ThemeMenu() {
  const { theme: storedTheme, setTheme } = useTheme();
  const theme = useHydrated() ? storedTheme : undefined;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          className="grid size-[26px] shrink-0 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
        >
          <SunMoon aria-hidden="true" className="size-[14px]" />
        </button>
      </MenuTrigger>
      <MenuContent width={200} align="end" side="top">
        <MenuLabel>Appearance</MenuLabel>
        <MenuSeparator />
        <MenuRadioGroup value={theme ?? 'dark'} onValueChange={setTheme}>
          <MenuRadioItem value="dark" icon={<Moon />}>
            Dark
          </MenuRadioItem>
          <MenuRadioItem value="light" icon={<Sun />}>
            Light
          </MenuRadioItem>
          <MenuRadioItem value="system" icon={<Monitor />}>
            System
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
