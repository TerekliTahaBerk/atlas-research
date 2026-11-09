export const SCHEMA_REVISION = "202611090008_library_experience";
export function release() {
  const value = process.env.ATLAS_RELEASE ?? "local";
  return /^[a-f0-9]{7,40}$/.test(value) ? value : "local";
}
