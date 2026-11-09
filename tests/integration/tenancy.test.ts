import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createDatabase } from "../../src/server/db/client";
import { asIdentity } from "../../src/server/db/transaction";
import { createAuth } from "../../src/server/auth/create-auth";
import { requireIdentity } from "../../src/server/auth/identity";
import { getEnv } from "../../src/server/env";
import { createMailQueue } from "../../src/server/mail/outbox";
import { createSharedWorkspace, revokeWorkspaceMember, setWorkspaceRole, transferWorkspaceOwner, updateWorkspace } from "../../src/server/domain/workspaces";
import { createProject, listProjects, readProject, revokeProjectMember, setProjectRole, transferProjectOwner, updateProject } from "../../src/server/domain/projects";
import { acceptInvitation, createInvitation, previewInvitation, revokeInvitation } from "../../src/server/domain/invitations";
import { startMailServer } from "../helpers/mail";
import { chargeMutation } from "../../src/server/rate-limit";
import { verifiedUser } from "../helpers/identity";

test("A01–A13 applicable tenancy: real RLS, two teams, governance privacy, invitations, lifecycle and revocation races", async () => {
  const smtp = await startMailServer(), env = { ...getEnv(), SMTP_PORT: smtp.port };
  const authDb = createDatabase(env.AUTH_DATABASE_URL), db = createDatabase(env.DATABASE_URL);
  const mail = createMailQueue(env), auth = createAuth(authDb, env, mail);
  try {
    const accounts = await Promise.all(Array.from({ length: 5 }, () => verifiedUser(auth, mail, smtp)));
    const [a,b,c,d,v] = await Promise.all(accounts.map(u => requireIdentity(auth,u.headers)));
    const w = await createSharedWorkspace(db,a,{ name: "Synthetic Team A", requestId: randomUUID() });
    const p = await createProject(db,a,w.id,{ name: "Private study A", requestId: randomUUID() });
    const wc = await createSharedWorkspace(db,c,{ name: "Synthetic Team B", requestId: randomUUID() });
    const pc = await createProject(db,c,wc.id,{ name: "Private study B", requestId: randomUUID() });
    assert.equal((await createProject(db,a,w.id,{ name:p.name,requestId:p.id })).id,p.id);
    const invite = async (actor: typeof a, target: typeof a, role: "admin"|"editor"|"viewer") => {
      const created = await createInvitation(db,actor,mail,env.APP_ORIGIN,w.id,p.id,{ email:target.email,role });
      await mail.flush();
      const token = smtp.latest(target.email,"Your Atlas project invitation").pathname.split("/").at(-1)!;
      return { created,token };
    };
    const ib = await invite(a,b,"editor");
    await assert.rejects(previewInvitation(db,c,ib.token));
    await assert.rejects(acceptInvitation(db,c,ib.token));
    assert.equal((await previewInvitation(db,b,ib.token)).projectName,p.name);
    assert.equal((await acceptInvitation(db,b,ib.token)).id,p.id);
    assert.equal((await acceptInvitation(db,b,ib.token)).id,p.id); // retry, no extra grant
    await acceptInvitation(db,v,(await invite(a,v,"viewer")).token);
    await acceptInvitation(db,d,(await invite(a,d,"admin")).token);
    await setWorkspaceRole(db,a,w.id,d.id,"admin");
    await revokeProjectMember(db,a,w.id,p.id,d.id);
    assert.equal((await readProject(db,b,w.id,p.id)).role,"editor");
    assert.equal((await readProject(db,v,w.id,p.id)).role,"viewer");
    for (const stranger of [c,d]) {
      assert.ok(!(await listProjects(db,stranger)).some(row=>row.id===p.id));
      await assert.rejects(readProject(db,stranger,w.id,p.id));
      await assert.rejects(updateProject(db,stranger,w.id,p.id,{ name:"forbidden" }));
      await assert.rejects(createInvitation(db,stranger,mail,env.APP_ORIGIN,w.id,p.id,{ email:stranger.email,role:"admin" }));
      assert.deepEqual(await asIdentity(db,stranger,tx=>tx.project.findMany({ where:{id:p.id} })),[]);
      assert.deepEqual(await asIdentity(db,stranger,tx=>tx.auditEvent.findMany({ where:{projectId:p.id} })),[]);
    }
    await assert.rejects(updateProject(db,v,w.id,p.id,{name:"forbidden"}));
    await assert.rejects(setProjectRole(db,v,w.id,p.id,b.id,"admin"));
    await assert.rejects(createInvitation(db,v,mail,env.APP_ORIGIN,w.id,p.id,{email:c.email,role:"viewer"}));
    await assert.rejects(readProject(db,b,wc.id,pc.id));
    await assert.rejects(asIdentity(db,b,tx=>tx.projectMember.createMany({data:[{workspaceId:wc.id,projectId:pc.id,userId:b.id,role:"owner"}]})));
    await assert.rejects(asIdentity(db,a,tx=>tx.project.update({where:{id:p.id},data:{workspaceId:wc.id}})));
    await assert.rejects(revokeProjectMember(db,a,w.id,p.id,a.id)); // last owner
    await assert.rejects(revokeWorkspaceMember(db,d,w.id,a.id)); // generic ownership block, no title
    await setProjectRole(db,a,w.id,p.id,b.id,"admin");
    await assert.rejects(setProjectRole(db,b,w.id,p.id,a.id,"editor"));
    await assert.rejects(createInvitation(db,b,mail,env.APP_ORIGIN,w.id,p.id,{email:c.email,role:"admin"}));
    const issuerChanged=await invite(b,c,"viewer");
    await setProjectRole(db,a,w.id,p.id,b.id,"editor");
    await assert.rejects(acceptInvitation(db,c,issuerChanged.token));
    await setProjectRole(db,a,w.id,p.id,b.id,"admin");
    assert.throws(()=>transferProjectOwner(db,{...a,sessionCreatedAt:new Date(0)},w.id,p.id,b.id));
    await authDb.session.update({where:{id:a.sessionId},data:{createdAt:new Date(0)}});
    await assert.rejects(asIdentity(db,a,tx=>tx.project.update({where:{id:p.id},data:{deletedAt:new Date()}})));
    await authDb.session.update({where:{id:a.sessionId},data:{createdAt:new Date()}});
    await transferProjectOwner(db,a,w.id,p.id,b.id);
    assert.equal((await readProject(db,b,w.id,p.id)).role,"owner");
    await transferProjectOwner(db,b,w.id,p.id,a.id);
    await setProjectRole(db,a,w.id,p.id,b.id,"editor");

    const cancel = await invite(a,c,"viewer");
    await revokeInvitation(db,a,w.id,p.id,cancel.created.id);
    await assert.rejects(acceptInvitation(db,c,cancel.token));
    const expires = randomBytes(32).toString("hex");
    await asIdentity(db,a,tx=>tx.invitation.createMany({data:[{id:randomUUID(),workspaceId:w.id,projectId:p.id,email:c.email,role:"viewer",tokenHash:createHash("sha256").update(expires).digest("hex"),createdBy:a.id,originSessionId:a.sessionId,expiresAt:new Date(Date.now()+150)}]}));
    await new Promise(r=>setTimeout(r,200));
    await assert.rejects(acceptInvitation(db,c,expires));
    const pending = await createInvitation(db,a,mail,env.APP_ORIGIN,w.id,p.id,{email:c.email,role:"viewer"});
    await revokeInvitation(db,a,w.id,p.id,pending.id);
    const before = smtp.messages.length;
    await mail.flush();
    assert.equal(smtp.messages.length,before); // revoked queued dispatch never goes to SMTP

    await updateProject(db,a,w.id,p.id,{archived:true});
    assert.equal((await readProject(db,b,w.id,p.id)).project.id,p.id);
    await assert.rejects(updateProject(db,a,w.id,p.id,{name:"archived edit"}));
    await assert.rejects(createInvitation(db,a,mail,env.APP_ORIGIN,w.id,p.id,{email:c.email,role:"viewer"}));
    await updateProject(db,a,w.id,p.id,{archived:false});
    await updateProject(db,a,w.id,p.id,{deletion:"request"});
    await assert.rejects(readProject(db,b,w.id,p.id));
    await updateProject(db,a,w.id,p.id,{deletion:"restore"});
    await updateWorkspace(db,a,w.id,{archived:true});
    await assert.rejects(createProject(db,b,w.id,{name:"archived create",requestId:randomUUID()}));
    await updateWorkspace(db,a,w.id,{archived:false});
    await transferWorkspaceOwner(db,a,w.id,d.id);
    await transferWorkspaceOwner(db,d,w.id,a.id);

    const race=await createProject(db,a,w.id,{name:"Owner race",requestId:randomUUID()});
    await createInvitation(db,a,mail,env.APP_ORIGIN,w.id,race.id,{email:b.email,role:"editor"});
    await mail.flush();
    await acceptInvitation(db,b,smtp.latest(b.email,"Your Atlas project invitation").pathname.split("/").at(-1)!);
    await asIdentity(db,a,tx=>tx.projectMember.updateMany({where:{projectId:race.id,userId:b.id},data:{role:"owner"}}));
    const owners=await Promise.allSettled([revokeProjectMember(db,a,w.id,race.id,a.id),revokeProjectMember(db,b,w.id,race.id,b.id)]);
    assert.equal(owners.filter(r=>r.status==="fulfilled").length,1);
    const migration=createDatabase(process.env.MIGRATION_DATABASE_URL!);
    try {
      await assert.rejects(migration.$transaction(async tx=>{
        await tx.$executeRaw`SET LOCAL ROLE atlas_lifecycle`;
        await tx.$executeRaw`INSERT INTO app.project_members("workspaceId","projectId","userId",role) VALUES(${w.id}::uuid,${pc.id}::uuid,${a.id},'viewer')`;
      })); // independently verifies the composite FK with RLS bypassed
      const states=await migration.$queryRaw<Array<{relrowsecurity:boolean;relforcerowsecurity:boolean}>>`SELECT relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='app' AND relkind='r'`;
      assert.ok(states.length>=6&&states.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
    } finally {await migration.$disconnect();}

    // Concurrent authorized read holds shared locks; revocation commits after it.
    let opened!:()=>void, release!:()=>void;
    const entered = new Promise<void>(r=>{opened=r;}), gate=new Promise<void>(r=>{release=r;});
    const reading=asIdentity(db,b,async tx=>{
      await tx.$queryRaw`SELECT app.lock_project(${w.id}::uuid,${p.id}::uuid,false)`;
      opened(); await gate;
      return tx.project.findMany({where:{id:p.id}});
    });
    await entered;
    let revoked=false;
    const revoking=revokeProjectMember(db,a,w.id,p.id,b.id).then(()=>{revoked=true;});
    await new Promise(r=>setTimeout(r,100));
    assert.equal(revoked,false);
    release(); assert.equal((await reading).length,1); await revoking;
    await assert.rejects(readProject(db,b,w.id,p.id));
    await assert.rejects(acceptInvitation(db,b,ib.token)); // old accepted link cannot restore access
    assert.ok(!(await listProjects(db,b)).some(row=>row.id===p.id));
    await revokeWorkspaceMember(db,a,w.id,v.id);
    await assert.rejects(readProject(db,v,w.id,p.id));
    const iv = await invite(a,v,"viewer");
    await assert.rejects(acceptInvitation(db,v,iv.token)); // project invite cannot undo workspace revocation

    assert.deepEqual(await db.project.findMany(),[]);
    await db.$transaction(async tx=>{ await tx.$executeRaw`SELECT set_config('app.user_id','malformed',true),set_config('app.session_id','malformed',true)`; assert.deepEqual(await tx.project.findMany(),[]); });
    const pooled=await Promise.all(Array.from({length:20},(_,i)=>asIdentity(db,i%2?a:c,tx=>tx.project.findMany())));
    pooled.forEach((rows,i)=>assert.ok(rows.every(row=>row.workspaceId===(i%2?w.id:wc.id))));
    for(const statement of ["SET ROLE atlas_policy","SET ROLE atlas_lifecycle","SET ROLE atlas_migrator","SET ROLE atlas_auth","TRUNCATE app.projects","CREATE TABLE app.forbidden(id int)","DELETE FROM app.projects"]) {
      await assert.rejects(db.$executeRawUnsafe(statement));
    }
    await Promise.all(Array.from({length:60},()=>chargeMutation(authDb,a.id)));
    await assert.rejects(chargeMutation(authDb,a.id));
    await auth.api.signOut({headers:accounts[0].headers});
    await assert.rejects(readProject(db,a,w.id,p.id));
  } finally { await mail.close();await smtp.close();await authDb.$disconnect();await db.$disconnect(); }
});
