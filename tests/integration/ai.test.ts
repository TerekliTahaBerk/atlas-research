import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../src/server/db/client";
import { createAuth } from "../../src/server/auth/create-auth";
import { requireIdentity } from "../../src/server/auth/identity";
import { createMailQueue } from "../../src/server/mail/outbox";
import { getEnv } from "../../src/server/env";
import { asIdentity } from "../../src/server/db/transaction";
import { createSharedWorkspace } from "../../src/server/domain/workspaces";
import {
  createProject,
  revokeProjectMember,
} from "../../src/server/domain/projects";
import {
  createInvitation,
  acceptInvitation,
} from "../../src/server/domain/invitations";
import { addSource, getSource } from "../../src/server/research/library";
import { uploadPdf } from "../../src/server/research/storage";
import { createFileWorker } from "../../src/server/files/worker";
import {
  createDocument,
  getDocument,
  saveDocument,
  exportDocument,
} from "../../src/server/collaboration/service";
import * as ai from "../../src/server/ai/service";
import { executeRun } from "../../src/server/ai/execution";
import * as proposal from "../../src/server/ai/proposals";
import {
  TERMS,
  MODEL,
  requestBody,
  type Provider,
} from "../../src/server/ai/provider";
import { verifiedUser } from "../helpers/identity";
import { startMailServer } from "../helpers/mail";
import { syntheticPdf } from "../helpers/pdf";
test("Phase 04 local synthetic adapter: evidence/private scope, closed gate, budget/idempotence/cancel, validated output and reviewed apply/undo", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-ai-"));
  process.env.FILE_STORAGE_PATH = root;
  process.env.ATLAS_AI_CALLS_ENABLED = "false";
  const smtp = await startMailServer(),
    env = { ...getEnv(), SMTP_PORT: smtp.port },
    authDb = createDatabase(env.AUTH_DATABASE_URL),
    db = createDatabase(env.DATABASE_URL),
    mail = createMailQueue(env),
    auth = createAuth(authDb, env, mail),
    worker = createFileWorker(process.env);
  try {
    const accounts = [];
    for (let i = 0; i < 4; i++)
      accounts.push(await verifiedUser(auth, mail, smtp));
    const [a, b, v, other] = await Promise.all(
      accounts.map((u) => requireIdentity(auth, u.headers)),
    );
    const w = (
        await createSharedWorkspace(db, a, {
          name: "Synthetic AI scope",
          requestId: randomUUID(),
        })
      ).id,
      p = (
        await createProject(db, a, w, {
          name: "Synthetic evidence project",
          requestId: randomUUID(),
        })
      ).id;
    for (const [who, role] of [
      [b, "editor"],
      [v, "viewer"],
    ] as const) {
      await createInvitation(db, a, mail, env.APP_ORIGIN, w, p, {
        email: who.email,
        role,
      });
      await mail.flush();
      await acceptInvitation(
        db,
        who,
        smtp
          .latest(who.email, "Your Atlas project invitation")
          .pathname.split("/")
          .at(-1)!,
      );
    }
    const s = (
        await addSource(db, a, w, p, {
          title: "Synthetic stable source",
          authors: ["Test Researcher"],
          year: 2026,
          venue: "Synthetic fixture",
          doi: "10.1234/ai-fixture",
          url: null,
          abstract: "",
        })
      ).source,
      bytes = syntheticPdf(
        "A stable source supports connected research. This is synthetic test evidence, not scientific evaluation.",
      );
    const upload = await uploadPdf(
      new Request(env.APP_ORIGIN + "/upload", {
        method: "POST",
        headers: {
          origin: env.APP_ORIGIN,
          "content-type": "application/pdf",
          "content-length": String(bytes.length),
          "x-file-name": "synthetic-ai.pdf",
        },
        body: new Uint8Array(bytes),
      }),
      db,
      a,
      w,
      p,
      s.id,
      randomUUID(),
    );
    await worker.heartbeat();
    await worker.flush();
    const version = (await getSource(db, a, w, p, s.id)).versions.find(
      (x) => x.id === upload.versionId,
    )!;
    assert.ok(version.indexRevision);
    const previewInput = {
      conversationId: null,
      versionIds: [version.id],
      question: "What stable source supports connected research?",
    };
    const context = await ai.preview(db, a, w, p, previewInput);
    assert.ok(context.evidence.length > 0);
    assert.equal(context.evidence[0].page, 1);
    assert.ok(context.evidence[0].href.includes("version=" + version.id));
    assert.equal(context.policy.callsEnabled, false);
    const runInput = {
      contextId: context.context.id,
      requestId: randomUUID(),
      consent: true as const,
    };
    await assert.rejects(ai.startRun(db, a, w, p, runInput), /AI_DISABLED/);
    assert.equal((await ai.getPolicy(db, a, w)).usage.requests, 0);
    process.env.ATLAS_AI_CALLS_ENABLED = "true";
    process.env.OPENAI_API_KEY = "atlas-synthetic-fixture";
    await assert.rejects(
      ai.startRun(db, a, w, p, runInput),
      /AI_POLICY_DISABLED/,
    );
    await assert.rejects(
      ai.setPolicy(db, v, w, {
        revision: 0,
        enabled: true,
        dailyBudgetMicros: 1000000,
        termsVersion: TERMS,
      }),
    );
    await ai.setPolicy(db, a, w, {
      revision: 0,
      enabled: true,
      dailyBudgetMicros: 1,
      termsVersion: TERMS,
    });
    await assert.rejects(ai.startRun(db, a, w, p, runInput), /AI_LIMITED/);
    await ai.setPolicy(db, a, w, {
      revision: 1,
      enabled: true,
      dailyBudgetMicros: 1000000,
      termsVersion: TERMS,
    });
    const first = await ai.startRun(db, a, w, p, runInput);
    assert.equal((await ai.startRun(db, a, w, p, runInput)).id, first.id);
    assert.equal((await ai.getPolicy(db, a, w)).usage.requests, 1);
    const second = await ai.preview(db, a, w, p, previewInput);
    await assert.rejects(
      ai.startRun(db, a, w, p, {
        ...runInput,
        contextId: second.context.id,
        requestId: randomUUID(),
      }),
      /AI_LIMITED/,
    );
    const viewerContext = await ai.preview(db, v, w, p, previewInput),
      viewerRun = await ai.startRun(db, v, w, p, {
        contextId: viewerContext.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    const editorContext = await ai.preview(db, b, w, p, previewInput);
    await assert.rejects(
      ai.startRun(db, b, w, p, {
        contextId: editorContext.context.id,
        requestId: randomUUID(),
        consent: true,
      }),
      /AI_LIMITED/,
    );
    await assert.rejects(
      ai.getConversation(db, a, w, p, viewerContext.context.conversationId),
    );
    await assert.rejects(
      ai.getConversation(db, other, w, p, context.context.conversationId),
    );
    assert.equal(await asIdentity(db, other, (tx) => tx.aiContext.count()), 0);
    await assert.rejects(
      ai.preview(db, a, w, p, { ...previewInput, versionIds: [randomUUID()] }),
    );
    let calls = 0;
    const fake: Provider = async (input) => {
      calls++;
      assert.equal(requestBody(input).store, false);
      assert.deepEqual(requestBody(input).tools, []);
      return {
        model: MODEL,
        inputTokens: 100,
        outputTokens: 70,
        answer: {
          status: "answered",
          segments: [
            {
              text: "Synthetic adapter output for software verification only.",
              citations: [
                {
                  evidenceId: input.evidence[0].id,
                  quote: input.evidence[0].quote.slice(0, 55),
                },
              ],
            },
          ],
          limitations: "Not a model or scientific support evaluation.",
        },
      };
    };
    await ai.cancelRun(db, a, w, p, first.id);
    await executeRun(db, a, w, p, first.id, fake);
    assert.equal(calls, 0);
    await executeRun(db, v, w, p, viewerRun.id, fake);
    assert.equal(calls, 1);
    let view = await ai.getConversation(
      db,
      v,
      w,
      p,
      viewerContext.context.conversationId,
    );
    assert.equal(view.contexts[0].run?.state, "complete");
    await assert.rejects(
      proposal.createProposal(db, v, w, p, {
        requestId: randomUUID(),
        runId: viewerRun.id,
        documentId: randomUUID(),
        revision: 1,
      }),
    );
    const ctx = await ai.preview(db, a, w, p, previewInput),
      run = await ai.startRun(db, a, w, p, {
        contextId: ctx.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    await executeRun(db, a, w, p, run.id, fake);
    view = await ai.getConversation(db, a, w, p, ctx.context.conversationId);
    assert.equal(view.contexts[0].run?.state, "complete");
    assert.ok(view.contexts[0].run!.chargedMicros < run.reservedMicros);
    await ai.reviewSegment(db, a, w, p, run.id, 0, "supported");
    assert.equal(
      (await ai.getConversation(db, a, w, p, ctx.context.conversationId))
        .contexts[0].reviews[0].verdict,
      "supported",
    );
    const invalidCtx = await ai.preview(db, a, w, p, previewInput),
      invalidRun = await ai.startRun(db, a, w, p, {
        contextId: invalidCtx.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    await executeRun(db, a, w, p, invalidRun.id, async (input) => {
      const r = await fake(input, new AbortController().signal);
      r.answer = {
        status: "answered",
        segments: [
          {
            text: "Invalid reference must never be delivered.",
            citations: [
              { evidenceId: randomUUID(), quote: "Fabricated evidence quote." },
            ],
          },
        ],
        limitations: "",
      };
      return r;
    });
    assert.equal(
      (await ai.getConversation(db, a, w, p, invalidCtx.context.conversationId))
        .contexts[0].run?.state,
      "validation_failed",
    );
    const insufficient = await ai.preview(db, a, w, p, previewInput),
      insRun = await ai.startRun(db, a, w, p, {
        contextId: insufficient.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    await executeRun(db, a, w, p, insRun.id, async () => ({
      model: MODEL,
      inputTokens: 100,
      outputTokens: 30,
      answer: {
        status: "insufficient",
        segments: [],
        limitations: "Synthetic abstention fixture.",
      },
    }));
    assert.equal(
      (
        await ai.getConversation(
          db,
          a,
          w,
          p,
          insufficient.context.conversationId,
        )
      ).contexts[0].run?.state,
      "insufficient",
    );
    const doc = await createDocument(db, a, w, p, {
        requestId: randomUUID(),
        title: "Reviewed AI proposal fixture",
      }),
      draft = await proposal.createProposal(db, a, w, p, {
        requestId: randomUUID(),
        runId: run.id,
        documentId: doc.id,
        revision: 1,
      });
    assert.equal(
      (await getDocument(db, a, w, p, doc.id)).document.revision,
      1,
      "preview never edits",
    );
    await saveDocument(db, a, w, p, doc.id, {
      action: "save",
      requestId: randomUUID(),
      revision: 1,
      title: doc.title,
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Concurrent author content." }],
          },
        ],
      },
      checkpoint: true,
    });
    await assert.rejects(
      proposal.applyProposal(db, a, w, p, draft.id),
      /REVISION_CONFLICT/,
    );
    const fresh = await proposal.createProposal(db, a, w, p, {
        requestId: randomUUID(),
        runId: run.id,
        documentId: doc.id,
        revision: 2,
      }),
      applied = await proposal.applyProposal(db, a, w, p, fresh.id);
    assert.equal(applied.revision, 3);
    assert.equal(
      (await proposal.applyProposal(db, a, w, p, fresh.id)).revision,
      3,
    );
    const updated = await getDocument(db, a, w, p, doc.id);
    assert.equal(updated.citations[0].pageId, ctx.evidence[0].pageId);
    assert.equal(updated.citations[0].versionId, version.id);
    const md = await (await exportDocument(db, v, w, p, doc.id)).text();
    assert.ok(md.includes("10.1234/ai-fixture"));
    assert.ok(md.includes(ctx.evidence[0].pageId));
    assert.equal(
      (await proposal.undoProposal(db, a, w, p, fresh.id)).revision,
      4,
    );
    assert.equal(
      (
        (await getDocument(db, a, w, p, doc.id)).document.body as {
          type: string;
        }
      ).type,
      "doc",
    );
    // Cancelling after dispatch keeps a conservative charge and never publishes the late result.
    const cancelCtx = await ai.preview(db, a, w, p, previewInput),
      cancelled = await ai.startRun(db, a, w, p, {
        contextId: cancelCtx.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    let began = false;
    const pending = executeRun(
      db,
      a,
      w,
      p,
      cancelled.id,
      async (_input, signal) => {
        began = true;
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        );
        throw new Error("unreachable");
      },
    );
    for (let n = 0; n < 100 && !began; n++)
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(began);
    await ai.cancelRun(db, a, w, p, cancelled.id);
    await pending;
    const cancelledView = (
      await ai.getConversation(db, a, w, p, cancelCtx.context.conversationId)
    ).contexts[0].run!;
    assert.equal(cancelledView.state, "cancelled");
    assert.equal(cancelledView.chargedMicros, cancelled.reservedMicros);
    assert.equal(cancelledView.result, null);
    // Policy changes while a provider is running suppress its buffered result.
    const policyContext = await ai.preview(db, a, w, p, previewInput),
      policyRun = await ai.startRun(db, a, w, p, {
        contextId: policyContext.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    let releasePolicy!: () => void;
    const policyWait = new Promise<void>((r) => {
      releasePolicy = r;
    });
    let policyBegan = false;
    const policyPending = executeRun(
      db,
      a,
      w,
      p,
      policyRun.id,
      async (input, signal) => {
        policyBegan = true;
        await policyWait;
        return fake(input, signal);
      },
    );
    for (let n = 0; n < 100 && !policyBegan; n++)
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(policyBegan);
    const currentPolicy = await ai.getPolicy(db, a, w);
    await ai.setPolicy(db, a, w, {
      enabled: false,
      dailyBudgetMicros: 1000000,
      revision: currentPolicy.revision,
      termsVersion: "",
    });
    releasePolicy();
    await policyPending;
    const suppressed = (
      await ai.getConversation(
        db,
        a,
        w,
        p,
        policyContext.context.conversationId,
      )
    ).contexts[0].run!;
    assert.equal(suppressed.result, null);
    assert.equal(suppressed.chargedMicros, policyRun.reservedMicros);
    const closed = await ai.getPolicy(db, a, w);
    await ai.setPolicy(db, a, w, {
      enabled: true,
      dailyBudgetMicros: 1000000,
      revision: closed.revision,
      termsVersion: TERMS,
    });
    // Expired leases are settled, never re-dispatched; undispatched jobs release their hold.
    const expiryContext = await ai.preview(db, a, w, p, previewInput);
    const expired = await asIdentity(db, a, (tx) =>
      tx.aiRun.create({
        data: {
          id: randomUUID(),
          workspaceId: w,
          projectId: p,
          userId: a.id,
          sessionId: a.sessionId,
          conversationId: expiryContext.context.conversationId,
          contextId: expiryContext.context.id,
          requestId: randomUUID(),
          policyRevision: closed.revision + 1,
          model: MODEL,
          reservedMicros: 9000,
          expiresAt: new Date(Date.now() - 1000),
        },
      }),
    );
    await ai.getPolicy(db, a, w);
    const settled = await asIdentity(db, a, (tx) =>
      tx.aiRun.findUniqueOrThrow({ where: { id: expired.id } }),
    );
    assert.equal(settled.state, "cancelled");
    assert.equal(settled.chargedMicros, 0);
    // The daily counter includes failed/cancelled requests, and request 21 is refused.
    while ((await ai.getPolicy(db, a, w)).usage.requests < 20) {
      const next = await ai.preview(db, a, w, p, previewInput),
        run = await ai.startRun(db, a, w, p, {
          contextId: next.context.id,
          requestId: randomUUID(),
          consent: true,
        });
      await ai.cancelRun(db, a, w, p, run.id);
    }
    const over = await ai.preview(db, a, w, p, previewInput);
    await assert.rejects(
      ai.startRun(db, a, w, p, {
        contextId: over.context.id,
        requestId: randomUUID(),
        consent: true,
      }),
      (e) => e instanceof Error && e.message === "AI_LIMITED",
    );
    const revokedContext = await ai.preview(db, b, w, p, previewInput),
      revokedRun = await ai.startRun(db, b, w, p, {
        contextId: revokedContext.context.id,
        requestId: randomUUID(),
        consent: true,
      });
    await revokeProjectMember(db, a, w, p, b.id);
    const before = calls;
    await executeRun(db, b, w, p, revokedRun.id, fake);
    assert.equal(calls, before);
    await assert.rejects(
      ai.getConversation(db, b, w, p, revokedContext.context.conversationId),
    );
    process.env.ATLAS_AI_CALLS_ENABLED = "false";
    assert.equal((await ai.getPolicy(db, a, w)).callsEnabled, false);
    console.log(
      "PASS: local synthetic adapter only; no OpenAI endpoint or paid model call. Evidence, closed gate, privacy, quota/cancel/idempotence, reviewed proposal and revision-safe undo verified.",
    );
  } finally {
    await Promise.all([
      authDb.$disconnect(),
      db.$disconnect(),
      mail.close(),
      worker.close(),
      smtp.close(),
    ]);
    await rm(root, { recursive: true, force: true });
    delete process.env.FILE_STORAGE_PATH;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ATLAS_AI_CALLS_ENABLED;
  }
});
