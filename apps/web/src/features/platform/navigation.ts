import { z } from 'zod';

const navigationPreference = z.object({
  actorId: z.uuid(),
  workspaceId: z.uuid(),
  projectId: z.uuid().optional(),
});

/** Untrusted navigation hints only; every referenced resource needs fresh authorization. */
export function readNavigation(value: string | undefined, actorId: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(value ?? 'null');
  } catch {
    return null;
  }
  const parsed = navigationPreference.safeParse(raw);
  return parsed.success && parsed.data.actorId === actorId ? parsed.data : null;
}
