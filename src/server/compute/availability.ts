import type { Tx } from "../domain/access";
import { resourceLimitsEnabled } from "../billing/entitlements";
import { SCHEMA_REVISION } from "../release";

export async function computeAvailable(tx: Tx) {
  if (!resourceLimitsEnabled() || process.env.ATLAS_COMPUTE_ENABLED !== "1")
    return false;
  const [row] = await tx.$queryRaw<Array<{ ready: boolean }>>`
    SELECT app.compute_ready(${SCHEMA_REVISION}) AS ready`;
  return row?.ready === true;
}
