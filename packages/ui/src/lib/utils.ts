import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
// Atlas defines named type sizes (--text-meta/ctl/ui). Without this,
// tailwind-merge reads `text-ctl` as a colour and drops e.g. `text-white`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['meta', 'ctl', 'ui'] } },
});
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
