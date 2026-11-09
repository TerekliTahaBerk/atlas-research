import { getRuntimeDatabase } from "@/server/db/runtime";
import { ready } from "@/server/readiness";
import { release,SCHEMA_REVISION } from "@/server/release";
export const dynamic="force-dynamic";
export async function GET(){
  try {if(await ready(getRuntimeDatabase()))return Response.json({status:"ready",release:release(),schema:SCHEMA_REVISION},{headers:{"Cache-Control":"no-store"}});}catch{}
  return Response.json({status:"not-ready",release:release()},{status:503,headers:{"Cache-Control":"no-store"}});
}
