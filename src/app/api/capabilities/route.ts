import { getEnv } from "@/server/env";
import { errorResponse } from "@/server/errors";
export const dynamic="force-dynamic";
export function GET(){try{return Response.json({emailDelivery:getEnv().MAIL_DELIVERY},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
