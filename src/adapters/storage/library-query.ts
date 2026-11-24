import { libraryView, type LibraryView } from "../../core/history/library-view";
import type { Library } from "../../shared/model";
import { readCatalog } from "./catalog-store";
import { readLibrary, type Database } from "./database";

export async function readLibraryView(
  db: Database,
  library?: Library,
  history?: Parameters<typeof libraryView>[3],
): Promise<LibraryView> {
  const lib = library ?? await readLibrary(db);
  const keys = [
    ...lib.animes.map((a) => `library.hidden:${a.id}`),
    ...lib.seasons.map((s) => `library.previous:${s.id}`),
  ];
  const meta = db.transaction("meta").store;
  const preferences = Object.fromEntries(await Promise.all(keys.map(async (key) =>
    [key, await meta.get(key)] as const,
  )));
  return libraryView(lib, await readCatalog(db), Date.now(), history, preferences);
}
