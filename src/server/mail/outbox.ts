import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import nodemailer from "nodemailer";
import type { ServerEnv } from "../env.js";

export type Mail = { to: string; subject: string; text: string; authorization?: { actorId: string; sessionId: string; workspaceId: string; projectId: string; invitationId: string } };
export function createMailQueue(env: ServerEnv) {
  const pool = new pg.Pool({ connectionString: env.AUTH_DATABASE_URL, max: 2, connectionTimeoutMillis: 5_000 });
  const runtime = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5_000 });
  const key = createHash("sha256").update("atlas-mail-v1\0").update(env.BETTER_AUTH_SECRET).digest();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    requireTLS: env.NODE_ENV === "production" && !env.SMTP_SECURE,
    ignoreTLS: env.NODE_ENV !== "production", connectionTimeout: 5_000, socketTimeout: 10_000,
    logger: false, debug: false,
  });
  function encrypt(mail: Mail) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(mail), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  function decrypt(payload: string): Mail {
    const data = Buffer.from(payload, "base64");
    const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8"));
  }
  return {
    async enqueue(mail: Mail, ttlSeconds = 3600) {
      await pool.query('INSERT INTO identity.mail_outbox(id,payload,"expiresAt") VALUES ($1,$2,now()+$3*interval \'1 second\')', [randomUUID(), encrypt(mail), ttlSeconds]);
    },
    encrypt,
    async flush(limit = 20) {
      await pool.query('UPDATE identity.mail_outbox SET state=\'expired\',payload=NULL WHERE "expiresAt"<=now() AND payload IS NOT NULL');
      for (let n = 0; n < limit; n++) {
        const rows = await pool.query<{ id: string; payload: string; attempts: number }>(`UPDATE identity.mail_outbox SET state='running',"leaseUntil"=now()+interval '30 seconds',attempts=attempts+1
          WHERE id=(SELECT id FROM identity.mail_outbox WHERE payload IS NOT NULL AND "expiresAt">now() AND attempts<5 AND "nextAttemptAt"<=now()
          AND (state='pending' OR (state='running' AND "leaseUntil"<now())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING id,payload,attempts`);
        const row = rows.rows[0];
        if (!row) break;
        try {
          const mail = decrypt(row.payload);
          let allowed = true;
          if (mail.authorization) {
            const a = mail.authorization, client = await runtime.connect();
            try {
              await client.query("BEGIN");
              await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.session_id',$2,true)", [a.actorId,a.sessionId]);
              const result = await client.query(`SELECT 1 FROM app.invitations WHERE id=$1 AND "workspaceId"=$2 AND "projectId"=$3
                AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">now() AND app.can_invite("workspaceId","projectId",role)`, [a.invitationId,a.workspaceId,a.projectId]);
              allowed = result.rowCount === 1;
              await client.query("COMMIT");
            } catch (error) { await client.query("ROLLBACK"); throw error; }
            finally { client.release(); }
          }
          if (!allowed) {
            await pool.query("UPDATE identity.mail_outbox SET state='cancelled',payload=NULL,\"leaseUntil\"=NULL WHERE id=$1", [row.id]);
            continue;
          }
          await transport.sendMail({ to: mail.to, subject: mail.subject, text: mail.text, from: env.MAIL_FROM, messageId: `<${row.id}@atlas-mail.invalid>` });
          await pool.query("UPDATE identity.mail_outbox SET state='sent',payload=NULL,\"leaseUntil\"=NULL WHERE id=$1", [row.id]);
        } catch {
          await pool.query('UPDATE identity.mail_outbox SET state=$2,"leaseUntil"=NULL,"nextAttemptAt"=now()+interval \'1 minute\' WHERE id=$1', [row.id, row.attempts >= 5 ? "failed" : "pending"]);
          // No address, URL, body, SMTP response or raw exception is logged.
          console.error(JSON.stringify({ event: "mail_delivery_failed", mailId: row.id }));
        }
      }
    },
    async close() { transport.close(); await Promise.all([pool.end(),runtime.end()]); },
  };
}
export type MailQueue = ReturnType<typeof createMailQueue>;
