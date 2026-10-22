'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleCheck, Info } from 'lucide-react';
type Toast = { id: number; message: string; tone: 'done' | 'info' };
const ToastContext = createContext<
  (message: string, tone?: Toast['tone']) => void
>(() => {});
/**
 * Small status toast (prototype `flash`). Preview actions use the `info`
 * tone and say plainly when nothing was sent, saved or executed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={flash}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[22px] z-[120] flex justify-center px-4"
      >
        {toast ? (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-[560px] animate-atlas-in items-center gap-2 rounded-[9px] border border-bd bg-pop px-3.5 py-[9px] text-ctl text-tx shadow-pop"
          >
            {toast.tone === 'done' ? (
              <CircleCheck
                aria-hidden="true"
                className="size-[14px] shrink-0 text-actx"
              />
            ) : (
              <Info
                aria-hidden="true"
                className="size-[14px] shrink-0 text-tx2"
              />
            )}
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
