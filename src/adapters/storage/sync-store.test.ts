import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { EpisodeObservation } from "../../connectors/types";
import { libraryView } from "../../core/history/library-view";
import { createOperation, type Operation } from "../../core/sync/operations";
import { countAll, openDatabase, readLibrary } from "./database";
import { recordOpened, recordProgress } from "./history-store";
import {
  applyRemoteOperations,
  getCursor,
  importLocalLibraryChoices,
  pendingOperations,
} from "./sync-store";

let n = 0;
const freshDb = () => openDatabase(`sync-${++n}`);
const obs: EpisodeObservation = {
  site: "voiranime",
  contentKey: "solo-leveling",
  title: "Solo Leveling",
  number: 3,
  language: "VOSTFR",
  url: "https://voiranime.cx/anime/solo-leveling/solo-leveling-03-vostfr/",
};

/** Simule un serveur : numérote les opérations dans l'ordre d'arrivée. */
function server() {
  const log: { revision: number; operation: Operation }[] = [];
  return {
    push: (ops: Operation[]) =>
      ops.forEach((operation) => {
        if (!log.some((r) => r.operation.id === operation.id))
          log.push({ revision: log.length + 1, operation });
      }),
    pull: (after: number) => log.filter((r) => r.revision > after),
  };
}

describe("synchronisation entre deux ordinateurs", () => {
  it("une progression reçue après expiration rétablit l’anime sans épisode vu", async () => {
    const pc = await freshDb();
    const mac = await freshDb();
    const cloud = server();
    const version = await recordOpened(pc, obs, "pc", 1);
    const now = 8 * 24 * 60 * 60 * 1_000;
    cloud.push(await pendingOperations(pc));
    await applyRemoteOperations(mac, cloud.pull(0));
    expect(libraryView(await readLibrary(mac), undefined, now).animes).toEqual([]);

    // La lecture a été enregistrée hors ligne avant l’expiration.
    await recordProgress(
      pc,
      version.id,
      { position: 30, duration: 1420, playing: false, ended: false },
      "pc",
      2,
    );
    cloud.push(await pendingOperations(pc));
    await applyRemoteOperations(mac, cloud.pull(await getCursor(mac)));
    expect(libraryView(await readLibrary(mac), undefined, now).animes).toEqual([
      expect.objectContaining({ title: obs.title, watchedCount: 0 }),
    ]);
  });

  it("le second ordinateur retrouve les lectures du premier, sans doublon", async () => {
    const pc = await freshDb();
    const mac = await freshDb();
    const cloud = server();
    const v = await recordOpened(pc, obs, "pc", 1);
    await recordProgress(
      pc,
      v.id,
      { position: 1300, duration: 1420, playing: true, ended: false },
      "pc",
      2,
    );
    cloud.push(await pendingOperations(pc));

    await applyRemoteOperations(mac, cloud.pull(0));
    expect(await countAll(mac)).toMatchObject({
      animes: 1,
      episodes: 1,
      versions: 1,
    });
    expect(await mac.get("versions", v.id)).toMatchObject({
      watched: true,
      position: 1300,
    });
    expect(await getCursor(mac)).toBe(2);

    // Réappliquer la même page (chevauchement) ne change rien.
    await applyRemoteOperations(mac, cloud.pull(0));
    expect(await countAll(mac)).toMatchObject({ versions: 1 });
  });

  it("la position la plus récente selon le serveur l’emporte, vu reste vu", async () => {
    const mac = await freshDb();
    const cloud = server();
    const pc = await freshDb();
    const v = await recordOpened(pc, obs, "pc", 1);
    cloud.push(await pendingOperations(pc));
    cloud.push([
      createOperation(
        {
          type: "version.progress",
          payload: {
            id: v.id,
            position: 1300,
            duration: 1420,
            watched: true,
            updatedAt: 50,
          },
        },
        "pc",
        50,
      ),
    ]);
    cloud.push([
      createOperation(
        {
          type: "version.progress",
          payload: {
            id: v.id,
            position: 20,
            duration: 1420,
            watched: false,
            updatedAt: 5,
          },
        },
        "mac",
        5,
      ),
    ]);
    await applyRemoteOperations(mac, cloud.pull(0));
    expect(await mac.get("versions", v.id)).toMatchObject({
      watched: true,
      position: 20,
    });
  });

  it("domaine activé sur un ordinateur : connu de l’autre", async () => {
    const mac = await freshDb();
    const op = createOperation(
      {
        type: "domain.activated",
        payload: {
          host: "voiranime.to",
          site: "voiranime",
          kind: "site",
          activatedAt: 1,
        },
      },
      "pc",
      1,
    );
    await applyRemoteOperations(mac, [{ revision: 1, operation: op }]);
    expect(await mac.get("domains", "voiranime.to")).toBeTruthy();
  });
});

it("rejoue les retraits et les réponses de bibliothèque entre appareils", async () => {
  const db = await freshDb();
  const operations = [
    createOperation({ type: "library.hidden", payload: { animeId: "a", through: 100 } }, "pc", 200),
    createOperation({ type: "library.previous", payload: { seasonId: "s", reviewed: 11, confirmed: 11 } }, "pc", 201),
    createOperation({ type: "library.previous", payload: { seasonId: "s", reviewed: 15, confirmed: 0 } }, "mac", 202),
  ];
  const remote = operations.map((operation, i) => ({ revision: i + 1, operation }));
  await applyRemoteOperations(db, remote);
  await applyRemoteOperations(db, remote);
  expect(await db.get("meta", "library.hidden:a")).toBe(100);
  expect(await db.get("meta", "library.previous:s")).toEqual({ reviewed: 15, confirmed: 11 });
});

it("récupère une seule fois les choix locaux du ZIP précédent et les transmet", async () => {
  const pc = await freshDb();
  const other = await freshDb();
  const stored = {
    "library.hidden:a": 100,
    "library.previous:s": { reviewed: 11, confirmed: 11 },
    deviceId: "pc",
  };
  await importLocalLibraryChoices(pc, stored, "pc");
  await importLocalLibraryChoices(pc, stored, "pc");
  const outbox = await pendingOperations(pc);
  expect(outbox).toHaveLength(2);
  await applyRemoteOperations(other, outbox.map((operation, i) => ({ revision: i + 1, operation })));
  for (const key of ["library.hidden:a", "library.previous:s"] as const) {
    expect(await pc.get("meta", key)).toEqual(stored[key]);
    expect(await other.get("meta", key)).toEqual(stored[key]);
  }
});
