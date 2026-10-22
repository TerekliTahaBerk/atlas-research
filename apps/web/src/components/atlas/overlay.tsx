'use client';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import {
  Dialog as DialogPrimitive,
  DropdownMenu as MenuPrimitive,
  HoverCard as HoverCardPrimitive,
  Popover as PopoverPrimitive,
} from 'radix-ui';
import { cn } from '@atlas/ui/lib/utils';
/*
 * Atlas overlay surfaces on Radix primitives (focus, dismissal and keyboard
 * behavior stay upstream). Handoff §3/§8: popovers 10–12px radius, menus
 * 220–250px, 140ms fade + 4px drop + 0.985 scale.
 */
const surface =
  'border border-bd bg-pop text-tx shadow-pop outline-none data-[state=open]:animate-atlas-in';
export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuGroup = MenuPrimitive.Group;
export function MenuContent({
  className,
  width = 240,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content> & { width?: number }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          surface,
          'z-[90] max-h-(--radix-dropdown-menu-content-available-height) max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl p-[5px]',
          className,
        )}
        style={{ width }}
        {...props}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}
export function MenuItem({
  icon,
  children,
  sub,
  shortcut,
  checked,
  chevron,
  destructive,
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & {
  icon?: ReactNode;
  sub?: ReactNode;
  shortcut?: string;
  checked?: boolean;
  chevron?: boolean;
  destructive?: boolean;
}) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex min-h-8 cursor-default items-center gap-2.5 rounded-md px-[9px] py-1 text-ui outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-hov [&_svg]:size-[14px] [&_svg]:shrink-0',
        destructive ? 'text-danger' : 'text-tx',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex w-4 justify-center',
            destructive ? 'text-danger' : 'text-tx2',
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {sub ? (
          <span className="truncate text-[11.5px] text-tx3">{sub}</span>
        ) : null}
      </span>
      {shortcut ? (
        <span className="font-mono text-[11px] text-tx3">{shortcut}</span>
      ) : null}
      {chevron ? (
        <ChevronRight aria-hidden="true" className="!size-[13px] text-tx3" />
      ) : null}
      {checked ? <Check aria-label="Selected" className="text-actx" /> : null}
    </MenuPrimitive.Item>
  );
}
export function MenuRadioItem({
  children,
  icon,
  sub,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem> & {
  icon?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <MenuPrimitive.RadioItem
      className="flex min-h-8 cursor-default items-center gap-2.5 rounded-md px-[9px] py-1 text-ui text-tx outline-none select-none data-[highlighted]:bg-hov [&_svg]:size-[14px]"
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="flex w-4 justify-center text-tx2">
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{children}</span>
        {sub ? <span className="text-[11.5px] text-tx3">{sub}</span> : null}
      </span>
      <MenuPrimitive.ItemIndicator>
        <Check aria-hidden="true" className="text-actx" />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}
export const MenuRadioGroup = MenuPrimitive.RadioGroup;
export function MenuSeparator() {
  return <MenuPrimitive.Separator className="mx-1 my-[5px] h-px bg-bd2" />;
}
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <MenuPrimitive.Label className="px-[9px] pt-1.5 pb-[3px] text-[11px] text-tx3">
      {children}
    </MenuPrimitive.Label>
  );
}
export function MenuFooter({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-[9px] pt-2 pb-[5px] text-ctl text-tx2">
      <span>{label}</span>
      <span className="tnum text-tx">{value}</span>
    </div>
  );
}
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;
export function PopoverContent({
  className,
  width = 380,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content> & { width?: number }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          surface,
          'z-[90] max-w-[calc(100vw-16px)] rounded-2xl',
          className,
        )}
        style={{ width }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;
export function HoverCardContent({
  className,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        sideOffset={8}
        collisionPadding={8}
        className={cn(
          surface,
          'z-[115] w-[330px] max-w-[calc(100vw-16px)] rounded-xl px-3.5 py-3',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;
export const ModalTitle = DialogPrimitive.Title;
export const ModalDescription = DialogPrimitive.Description;
/** Centered modal (handoff: radius 14–16, --dim backdrop). */
export function ModalContent({
  className,
  blur = false,
  position = 'center',
  overlayClassName,
  onOpenAutoFocus,
  onCloseAutoFocus,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  blur?: boolean;
  position?: 'center' | 'top';
  overlayClassName?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-[80] bg-dim data-[state=open]:animate-atlas-fade',
          blur && 'backdrop-blur-[3px]',
          overlayClassName,
        )}
      />
      <DialogPrimitive.Content
        onOpenAutoFocus={(event) => {
          returnFocus.current = document.activeElement as HTMLElement | null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          if (onCloseAutoFocus) {
            onCloseAutoFocus(event);
            return;
          }
          // Controlled dialogs often have an invoker outside Dialog.Root.
          // Radix cannot restore that invoker through its Trigger context.
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
        className={cn(
          'fixed left-1/2 z-[81] -translate-x-1/2 border border-bd bg-pop text-tx shadow-pop outline-none',
          position === 'center'
            ? 'top-1/2 -translate-y-1/2'
            : 'top-[14vh] data-[state=open]:animate-atlas-in',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
