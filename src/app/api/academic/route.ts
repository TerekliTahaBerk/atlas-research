import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import {
  academicInput,
  readAcademicStatus,
  requestAcademicStatus,
} from "@/server/billing/academic";

export function GET(request: Request) {
  return entry(request, (actor, db) => readAcademicStatus(db, actor));
}
export function POST(request: Request) {
  return entry(request, async (actor, db) =>
    requestAcademicStatus(
      db,
      actor,
      (await readMutation(request, academicInput)).institutionDomain,
    ),
  );
}
