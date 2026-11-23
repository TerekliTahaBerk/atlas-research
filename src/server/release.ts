export const SCHEMA_REVISION = "202611230103_ai_credit_metering";
export function release() {
  const value = process.env.ATLAS_RELEASE ?? "local";
  return /^[a-f0-9]{7,40}$/.test(value) ? value : "local";
}
