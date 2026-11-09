import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../../src/server/db/client';
import {createAuth} from '../../src/server/auth/create-auth';
import {requireIdentity} from '../../src/server/auth/identity';
import {createMailQueue} from '../../src/server/mail/outbox';
import {getEnv} from '../../src/server/env';
import {createSharedWorkspace,revokeWorkspaceMember} from '../../src/server/domain/workspaces';
import {createProject,setProjectRole,revokeProjectMember} from '../../src/server/domain/projects';
import {createInvitation,acceptInvitation} from '../../src/server/domain/invitations';
import {asIdentity} from '../../src/server/db/transaction';
import {addSource,addAnnotation,getSource,editSource} from '../../src/server/research/library';
import {uploadPdf} from '../../src/server/research/storage';
import * as c from '../../src/server/collaboration/service';
import {cleanDocument,type DocNode} from '../../src/lib/document-model';
import {verifiedUser} from '../helpers/identity';
import {startMailServer} from '../helpers/mail';
import {syntheticPdf} from '../helpers/pdf';
test('Phase 03: immutable citations, acknowledged/idempotent saves, conflict, history, tasks, discussion and recipient isolation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'atlas-documents-'));process.env.FILE_STORAGE_PATH=root;
 const smtp=await startMailServer(),env={...getEnv(),SMTP_PORT:smtp.port},authDb=createDatabase(env.AUTH_DATABASE_URL),db=createDatabase(env.DATABASE_URL),mail=createMailQueue(env),auth=createAuth(authDb,env,mail);
 try{
 const users=[];for(let i=0;i<4;i++)users.push(await verifiedUser(auth,mail,smtp));const [a,b,v,other]=await Promise.all(users.map(u=>requireIdentity(auth,u.headers)));
 const w=await createSharedWorkspace(db,a,{name:'Controlled writing team',requestId:randomUUID()}),p=await createProject(db,a,w.id,{name:'Connected research',requestId:randomUUID()});
 for(const [who,role] of [[b,'editor'],[v,'viewer']] as const){await createInvitation(db,a,mail,env.APP_ORIGIN,w.id,p.id,{email:who.email,role});await mail.flush();await acceptInvitation(db,who,smtp.latest(who.email,'Your Atlas project invitation').pathname.split('/').at(-1)!);}
 const metadata={title:'Controlled source',authors:['A. Researcher'],year:2026,venue:'Synthetic journal',doi:'10.1234/phase03',url:null,abstract:''},s=(await addSource(db,a,w.id,p.id,metadata)).source;
 const bytes=syntheticPdf(),upload=await uploadPdf(new Request(env.APP_ORIGIN+'/upload',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/pdf','content-length':String(bytes.length),'x-file-name':'controlled.pdf'},body:new Uint8Array(bytes)}),db,a,w.id,p.id,s.id,randomUUID());
 const n=await addAnnotation(db,a,w.id,p.id,s.id,upload.versionId!,{kind:'note',page:1,body:'An observation worth writing about.',quote:'',rects:[],color:'yellow'});
 const input={requestId:randomUUID(),title:'Source-linked writing',origin:{sourceId:s.id,annotationId:n.id}},doc=await c.createDocument(db,a,w.id,p.id,input);assert.equal((await c.createDocument(db,a,w.id,p.id,input)).id,doc.id);
 let detail=await c.getDocument(db,a,w.id,p.id,doc.id);assert.equal(detail.citations[0].versionId,upload.versionId!);assert.equal(detail.citations[0].page,1);assert.match(detail.citations[0].href,new RegExp(n.id));
 const body:DocNode={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Evidence'}]},{type:'paragraph',content:[{type:'text',text:'A stable result ',marks:[{type:'bold'}]},{type:'inlineMath',attrs:{latex:'E=mc^2'}},{type:'citation',attrs:{id:detail.citations[0].id}}]},{type:'blockMath',attrs:{latex:'\\sum_{i=1}^{n} x_i'}}]};
 const save={action:'save' as const,requestId:randomUUID(),revision:1,title:doc.title,body,checkpoint:false};assert.equal((await c.saveDocument(db,a,w.id,p.id,doc.id,save)).revision,2);assert.equal((await c.saveDocument(db,a,w.id,p.id,doc.id,save)).revision,2);
 await assert.rejects(c.saveDocument(db,b,w.id,p.id,doc.id,{...save,requestId:randomUUID(),body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Other session draft'}]}]}}),/REVISION_CONFLICT/);
 detail=await c.getDocument(db,a,w.id,p.id,doc.id);assert.deepEqual(detail.document.body,cleanDocument(body));assert.equal(detail.versions.length,1,'autosave does not checkpoint each pause');
 await assert.rejects(async()=>c.saveDocument(db,a,w.id,p.id,doc.id,{...save,requestId:randomUUID(),revision:2,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'bad',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}}));assert.equal((await c.getDocument(db,a,w.id,p.id,doc.id)).document.revision,2);
 const cp={...save,requestId:randomUUID(),revision:2,title:'Checkpointed writing',checkpoint:true};assert.equal((await c.saveDocument(db,a,w.id,p.id,doc.id,cp)).revision,3);
 detail=await c.getDocument(db,a,w.id,p.id,doc.id);assert.deepEqual(detail.versions.map(v=>v.revision),[3,2,1]);
 const original=detail.versions.find(v=>v.revision===1)!;await c.restoreDocument(db,a,w.id,p.id,doc.id,{action:'restore',requestId:randomUUID(),revision:3,versionId:original.id});assert.equal((await c.getVersion(db,a,w.id,p.id,doc.id,original.id)).version.revision,1);assert.equal((await c.getDocument(db,a,w.id,p.id,doc.id)).document.revision,4);
 await c.saveDocument(db,a,w.id,p.id,doc.id,{...save,requestId:randomUUID(),revision:4,checkpoint:true});
 await editSource(db,a,w.id,p.id,s.id,{action:'metadata',revision:1,metadata:{...metadata,title:'Renamed source'},tags:[],collectionIds:[]});assert.equal((await c.getDocument(db,a,w.id,p.id,doc.id)).citations[0].id,detail.citations[0].id);
 const output=await (await c.exportDocument(db,v,w.id,p.id,doc.id)).text();assert.match(output,/E=mc\^2/);assert.match(output,/\\sum/);assert.match(output,/10\.1234\/phase03/);assert.match(output,new RegExp(upload.versionId!));
 const task=await c.createTask(db,a,w.id,p.id,{requestId:randomUUID(),title:'Check the argument',description:'Follow the source note',status:'backlog',priority:'high',assigneeId:b.id,dueDate:'2026-12-01',links:[doc.id,n.id]});assert.equal((await c.inbox(db,b))[0].target?.id,task.id);assert.equal((await c.inbox(db,v)).length,0);
 await assert.rejects(c.createTask(db,a,w.id,p.id,{...c.taskInput.parse({requestId:randomUUID(),title:'Denied assignee'}),assigneeId:v.id}));
 const thread=await c.createDiscussion(db,a,w.id,p.id,{requestId:randomUUID(),title:'Review the evidence',body:'Please review this linked research.',links:[task.id,doc.id,n.id],mentions:[b.id]});
 const msg={clientId:randomUUID(),body:'The equation and source location are consistent.',links:[doc.id,n.id],mentions:[]};const first=await c.sendMessage(db,b,w.id,p.id,thread.id,msg);assert.equal((await c.sendMessage(db,b,w.id,p.id,thread.id,msg)).id,first.id);await assert.rejects(c.sendMessage(db,b,w.id,p.id,thread.id,{...msg,body:'Changed retry'}));assert.equal((await c.getDiscussion(db,a,w.id,p.id,thread.id)).messages.length,2);assert.equal((await c.inbox(db,a))[0].target?.id,thread.id);
 await assert.rejects(c.editMessage(db,b,w.id,p.id,thread.id,(await c.getDiscussion(db,a,w.id,p.id,thread.id)).messages[0].id,{body:'Not my message',revision:1}));
 assert.equal((await c.getDocument(db,v,w.id,p.id,doc.id)).canEdit,false);await assert.rejects(c.saveDocument(db,v,w.id,p.id,doc.id,{...save,requestId:randomUUID(),revision:5}));await assert.rejects(c.getDocument(db,other,w.id,p.id,doc.id));await assert.rejects(c.exportDocument(db,other,w.id,p.id,doc.id));assert.equal(await asIdentity(db,other,tx=>tx.document.count({where:{id:doc.id}})),0);
 const own=await c.inbox(db,b);await assert.rejects(c.markNotification(db,v,own[0].id,true));await c.markNotification(db,b,own[0].id,true);
 await setProjectRole(db,a,w.id,p.id,b.id,'viewer');assert.equal((await c.getTask(db,a,w.id,p.id,task.id)).task.assigneeId,null);await setProjectRole(db,a,w.id,p.id,b.id,'editor');let t=(await c.getTask(db,a,w.id,p.id,task.id)).task;await c.editTask(db,a,w.id,p.id,task.id,{title:t.title,description:t.description,status:'backlog',priority:'high',assigneeId:b.id,dueDate:t.dueDate,revision:t.revision});await revokeProjectMember(db,a,w.id,p.id,b.id);assert.equal((await c.getTask(db,a,w.id,p.id,task.id)).task.assigneeId,null);assert.ok((await c.inbox(db,b)).every(n=>n.target===null));
 await assert.rejects(c.getDocument(db,b,w.id,p.id,doc.id));
 // A second invited editor exercises the workspace-wide assignment trigger.
 await setProjectRole(db,a,w.id,p.id,v.id,'editor');t=(await c.getTask(db,a,w.id,p.id,task.id)).task;await c.editTask(db,a,w.id,p.id,task.id,{title:t.title,description:t.description,status:'backlog',priority:'high',assigneeId:v.id,dueDate:t.dueDate,revision:t.revision});await revokeWorkspaceMember(db,a,w.id,v.id);assert.equal((await c.getTask(db,a,w.id,p.id,task.id)).task.assigneeId,null);
 const source=await getSource(db,a,w.id,p.id,s.id);assert.equal(source.annotations[0].id,n.id);console.log('PASS: Phase 03 focused real-PostgreSQL persistence, conflict/retry/checkpoints/restore, citation/export, assignee lifecycle and recipient/access checks.');
 }finally{await Promise.all([authDb.$disconnect(),db.$disconnect(),mail.close(),smtp.close()]);await rm(root,{recursive:true,force:true});delete process.env.FILE_STORAGE_PATH;}
});
