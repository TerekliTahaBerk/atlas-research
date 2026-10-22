import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@atlas/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@atlas/ui/components/tooltip';
/**
 * Atlas buttons (handoff §3: 28px controls, 10–12px padding, radius 6).
 * Primary is the only filled-green control; AI actions use the soft green.
 */
export const btnVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[13px]",
  {
    variants: {
      variant: {
        primary: 'bg-acb font-medium text-white hover:bg-acbh',
        secondary: 'border border-bd bg-el font-medium text-tx hover:bg-hov',
        outline: 'border border-bd text-tx hover:bg-hov',
        ghost: 'text-tx2 hover:bg-hov hover:text-tx',
        ai: 'border border-aiib bg-acs text-actx hover:bg-aiin',
        aiGhost: 'font-medium text-actx hover:bg-acs',
        subtle: 'bg-el text-tx2 hover:bg-hov hover:text-tx',
        danger: 'border border-danger text-danger hover:bg-dangers',
        inverse: 'bg-tx font-medium text-canvas hover:opacity-90',
      },
      size: {
        xs: 'h-[22px] rounded-sm px-2 text-[11.5px]',
        sm: 'h-6 rounded-sm px-2 text-xs',
        md: 'h-[26px] rounded-md px-2.5 text-xs',
        base: 'h-7 rounded-md px-2.5 text-ctl',
        lg: 'h-[30px] rounded-[7px] px-3 text-ctl',
        xl: 'h-9 rounded-lg px-4 text-ui',
        cta: 'h-10 rounded-lg px-5 text-[13.5px]',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'base' },
  },
);
export type BtnProps = React.ComponentProps<'button'> &
  VariantProps<typeof btnVariants> & { asChild?: boolean };
export function Btn({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: BtnProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(btnVariants({ variant, size }), className)}
      {...props}
    />
  );
}
const iconSizes = {
  xs: 'size-4 rounded-[3px]',
  sm: 'size-[22px] rounded-sm',
  md: 'size-6 rounded-sm',
  base: 'size-[26px] rounded-md',
  lg: 'size-7 rounded-md',
  xl: 'size-8 rounded-[7px]',
} as const;
export type IconBtnProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  /** Accessible name; also shown as a tooltip. */
  label: string;
  size?: keyof typeof iconSizes;
  tone?: 'default' | 'muted' | 'active' | 'ai';
  tooltip?: boolean;
  children: React.ReactNode;
};
/** Square icon control. Always named; never relies on the icon alone. */
export function IconBtn({
  label,
  size = 'lg',
  tone = 'default',
  tooltip = true,
  className,
  children,
  type = 'button',
  ...props
}: IconBtnProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'grid shrink-0 place-items-center transition-colors disabled:opacity-45 [&_svg]:pointer-events-none',
        iconSizes[size],
        tone === 'default' && 'text-tx2 hover:bg-hov hover:text-tx',
        tone === 'muted' && 'text-tx3 hover:bg-hov hover:text-tx',
        tone === 'active' && 'bg-hov text-tx',
        tone === 'ai' && 'text-actx hover:bg-acs',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
