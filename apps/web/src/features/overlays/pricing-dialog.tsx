'use client';
import { useId, useState } from 'react';
import { Check, GraduationCap, Landmark, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn } from '@/components/atlas/button';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { plans, type Plan } from '@/lib/preview/workspace';
export function UsageMeter({
  label,
  value,
  max,
  unit = '',
  tone = 'accent',
  compact = false,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone?: 'accent' | 'muted';
  compact?: boolean;
}) {
  const pct = Math.round((value / max) * 100);
  const bar = (
    <span
      role="meter"
      aria-label={`${label} (sample)`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'block overflow-hidden rounded-[3px] bg-el',
        compact ? 'h-1 w-[90px]' : 'h-[5px] w-full',
      )}
    >
      <span
        className={cn(
          'block h-full rounded-[3px]',
          tone === 'accent' ? 'bg-ac' : 'bg-tx3',
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
  if (compact)
    return (
      <span className="flex items-center gap-2">
        {label}
        {bar}
        <span className="tnum">
          {value} / {max}
          {unit}
        </span>
      </span>
    );
  return (
    <div>
      <div className="mb-1.5 flex text-ctl">
        <span className="flex-1">{label}</span>
        <span className="tnum text-tx2">
          {value} / {max}
          {unit}
        </span>
      </div>
      {bar}
    </div>
  );
}
/** Illustrative plans (handoff `PricingDialog`, 960px). Checkout is not connected. */
export function PricingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const flash = useToast();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [plan, setPlan] = useState<Plan['key']>('researcher');
  const groupId = useId();
  const chosen = plans.find((p) => p.key === plan);
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        blur
        className="max-h-[calc(100vh-40px)] w-[min(960px,calc(100vw-32px))] overflow-auto rounded-4xl px-8 pt-[30px] pb-[26px] max-sm:px-5"
      >
        <ModalClose
          aria-label="Close"
          className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
        >
          <X aria-hidden="true" className="size-4" />
        </ModalClose>
        <div className="mb-[22px] flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <ModalTitle className="font-serif text-[38px] leading-[1.05] font-medium">
              Go further with Atlas
            </ModalTitle>
            <ModalDescription className="mt-1.5 text-ui text-tx2">
              More room for reading, writing and working with your lab.
            </ModalDescription>
          </div>
          <Segmented
            label="Billing period"
            value={billing}
            onChange={setBilling}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </div>
        <div
          role="radiogroup"
          aria-labelledby={groupId}
          className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3"
        >
          <span id={groupId} className="sr-only">
            Plan (illustrative)
          </span>
          {plans.map((p) => {
            const selected = plan === p.key;
            const price = billing === 'yearly' ? p.yearly : p.monthly;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlan(p.key)}
                className={cn(
                  'relative flex flex-col rounded-2xl bg-card px-[18px] pt-[18px] pb-4 text-left',
                  selected ? 'border-[1.5px] border-tx' : 'border border-bd',
                )}
              >
                {p.recommended ? (
                  <span className="absolute -top-2.5 left-4 rounded-sm bg-acb px-2 py-0.5 text-[11px] font-medium text-white">
                    Recommended
                  </span>
                ) : null}
                <span className="flex items-start gap-2">
                  <span className="flex-1">
                    <span className="block font-serif text-[26px] leading-[1.1] font-medium">
                      {p.name}
                    </span>
                    <span className="text-ctl text-tx2">{p.description}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1 grid size-[18px] place-items-center rounded-full border-[1.5px]',
                      selected ? 'border-tx' : 'border-tx3',
                    )}
                  >
                    <span
                      className={cn('size-2 rounded-full', selected && 'bg-tx')}
                    />
                  </span>
                </span>
                <span className="mt-4 mb-1 flex items-baseline gap-1">
                  <span className="tnum text-[30px] font-semibold tracking-[-0.02em]">
                    ${price}
                  </span>
                  <span className="text-ui text-tx2">
                    {p.key === 'free'
                      ? 'forever'
                      : p.perSeat
                        ? '/seat/month'
                        : '/month'}
                  </span>
                </span>
                <span className="mb-3 text-[11.5px] text-tx3">
                  {p.key === 'free'
                    ? 'Your current plan'
                    : billing === 'yearly'
                      ? 'Billed yearly · illustrative'
                      : 'Billed monthly · illustrative'}
                </span>
                {p.student ? (
                  <span className="mb-3 inline-flex w-max items-center gap-[5px] rounded-sm bg-acs px-2 py-[3px] text-[11.5px] text-actx">
                    <GraduationCap aria-hidden="true" className="size-3" />
                    Student discount eligible · .edu
                  </span>
                ) : null}
                <span className="flex flex-col gap-[7px]">
                  {p.features.map((f) => (
                    <span key={f} className="flex gap-2 text-ctl text-tx2">
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-[13px] shrink-0 text-tx"
                      />
                      {f}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3.5 rounded-xl border border-bd2 px-4 py-3">
          <Landmark aria-hidden="true" className="size-4 text-tx2" />
          <div className="min-w-[200px] flex-1">
            <div className="font-medium">Institution</div>
            <div className="text-xs text-tx3">
              Department and university agreements, SSO and data governance.
            </div>
          </div>
          <Btn
            variant="outline"
            onClick={() =>
              flash('Sales contact is not connected in this preview')
            }
          >
            Contact us
          </Btn>
        </div>
        <div className="mb-[18px] flex flex-wrap items-center gap-4 text-xs text-tx2">
          <span className="text-tx3">Your usage this month (sample)</span>
          <UsageMeter compact label="Atlas requests" value={42} max={50} />
          <UsageMeter
            compact
            label="Storage"
            value={1.2}
            max={2}
            unit=" GB"
            tone="muted"
          />
        </div>
        <Btn
          variant="inverse"
          className="h-11 w-full rounded-[9px] text-[14.5px]"
          onClick={() =>
            flash(
              plan === 'free'
                ? 'You’re on Free'
                : 'Checkout isn’t connected — no payment was requested',
            )
          }
        >
          {plan === 'free'
            ? 'Stay on Free'
            : `Continue with ${chosen?.name ?? ''}`}
        </Btn>
        <p className="mt-2.5 text-center text-[11.5px] text-tx3">
          Illustrative plans and prices — not final. Checkout isn’t connected in
          this preview.
        </p>
      </ModalContent>
    </Modal>
  );
}
