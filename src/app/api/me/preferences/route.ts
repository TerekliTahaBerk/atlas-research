import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import {
  preferences,
  preferenceInput,
  savePreferences,
} from "@/server/domain/preferences";
export const GET = (request: Request) =>
  entry(request, (a, db) => preferences(db, a));
export const PATCH = (request: Request) =>
  entry(request, async (a, db) =>
    savePreferences(db, a, await readMutation(request, preferenceInput)),
  );
