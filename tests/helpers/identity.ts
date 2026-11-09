import { randomBytes } from "node:crypto";
import type { Auth } from "../../src/server/auth/identity";
import type { MailQueue } from "../../src/server/mail/outbox";
import type { startMailServer } from "./mail";

export function cookies(response: Response) { return response.headers.getSetCookie().map(v => v.split(";")[0]).join("; "); }
export async function verifiedUser(auth: Auth, mail: MailQueue, smtp: Awaited<ReturnType<typeof startMailServer>>) {
  const email = `researcher-${randomBytes(8).toString("hex")}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const created = await auth.api.signUpEmail({ body: { email, password, name: "Test Researcher" } });
  await mail.flush();
  const link = smtp.latest(email, "Verify your Atlas email");
  await auth.api.verifyEmail({ query: { token: link.searchParams.get("token")! } });
  const signed = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (signed.status !== 200) throw new Error("Verified sign-in failed");
  return { email, password, id: created.user.id, headers: new Headers({ cookie: cookies(signed) }) };
}
