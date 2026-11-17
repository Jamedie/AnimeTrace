import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { EpisodeObservation } from "../../connectors/types";
import { createOperation, type Operation } from "../../core/sync/operations";
import { countAll, openDatabase } from "./database";
import { recordOpened, recordProgress } from "./history-store";
import {
  applyRemoteOperations,
  getCursor,
  importLegacyHistory,
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

  it("import de l’historique cloud 0.3.6 : rejouable, fusion avec les lectures V1", async () => {
    const db = await freshDb();
    const v = await recordOpened(db, obs, "pc", 1);
    await recordProgress(
      db,
      v.id,
      { position: 100, duration: 1420, playing: true, ended: false },
      "pc",
      2_000,
    );
    const legacy = {
      "solo-leveling:3:vostfr": {
        anime: "solo-leveling",
        title: "Solo Leveling",
        number: 3,
        language: "VOSTFR",
        watched: true,
        position: 1400,
        duration: 1420,
        updatedAt: 1_000,
      },
      "solo-leveling:2:vostfr": {
        anime: "solo-leveling",
        title: "Solo Leveling",
        number: 2,
        language: "VOSTFR",
        watched: true,
        updatedAt: 900,
      },
    };
    await importLegacyHistory(db, legacy);
    await importLegacyHistory(db, legacy);
    expect(await countAll(db)).toMatchObject({
      animes: 1,
      episodes: 2,
      versions: 2,
    });
    // Vu cumulatif ; la lecture V1 plus récente garde sa position.
    expect(await db.get("versions", v.id)).toMatchObject({
      watched: true,
      position: 100,
    });
    // L'adresse V1 la plus récente n'est pas remplacée.
    expect(
      (await db.get("sourceRefs", ["voiranime", "solo-leveling:3:vostfr"]))
        ?.url,
    ).toBe(obs.url);
  });
});
