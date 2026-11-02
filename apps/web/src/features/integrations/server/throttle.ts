import 'server-only';
import { z } from 'zod';
import {
  checkRuntime,
  runtimeDatabase,
} from '@/features/platform/server/database';

/** Global metadata-only provider lease/cooldown; survives serverless restarts.
 * No actor data is read here. The runtime can call only the fixed function.
 */
export async function zoteroThrottle(token: string, cooldown: number | null) {
  return runtimeDatabase().$transaction(async (tx) => {
    await checkRuntime(tx);
    const [row] = z
      .array(z.object({ seconds: z.number().int().min(0) }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.zotero_request(${token}::uuid,${cooldown}::integer) AS seconds`,
      );
    if (!row) throw new Error('Provider control unavailable');
    return row.seconds;
  });
}
