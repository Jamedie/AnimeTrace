import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { EpisodeObservation } from "../../connectors/types";
import {
  buildBackupFile,
  parseBackupFile,
} from "../../core/backup/backup-file";
import type { Operation } from "../../core/sync/operations";
import { openDatabase, readLibrary } from "./database";
import { recordOpened, recordProgress } from "./history-store";
import { importBackup, readBackupData } from "./backup-store";
import {
  applyRemoteOperations,
  pendingOperations,
  removeOperations,
} from "./sync-store";

let n = 0;
const freshDb = () => openDatabase(`backup-${++n}`);
const obs = (number: number): EpisodeObservation => ({
  site: "voiranime",
  contentKey: "dandadan",
  title: "Dandadan",
  number,
  language: "VOSTFR",
  url: `https://voiranime.cx/anime/dandadan/dandadan-0${number}-vostfr/`,
});

async function exportText(db: Awaited<ReturnType<typeof freshDb>>) {
  const d = await readBackupData(db);
  return buildBackupFile(d.library, d.links, Date.UTC(2026, 10, 17)).content;
}

describe("sauvegarde V1", () => {
  it("aller-retour : un autre ordinateur retrouve tout, et le cloud propage", async () => {
    const pc = await freshDb();
    const v1 = await recordOpened(pc, obs(1), "pc", 1);
    await recordProgress(
      pc,
      v1.id,
      { position: 1380, duration: 1420, playing: true, ended: false },
      "pc",
      2,
    );
    const v2 = await recordOpened(pc, obs(2), "pc", 3);
    await recordProgress(
      pc,
      v2.id,
      { position: 300, duration: 1420, playing: true, ended: false },
      "pc",
      4,
    );
    await pc.put("catalogLinks", {
      seasonId: (await readLibrary(pc)).seasons[0]!.id,
      status: "confirmed",
      malId: 40748,
      method: "user",
      at: 5,
    });

    const mac = await freshDb();
    const report = await importBackup(
      mac,
      await parseBackupFile(await exportText(pc)),
      "mac",
      10,
    );
    expect(report).toMatchObject({
      kind: "v1",
      added: 2,
      updated: 0,
      unchanged: 0,
      links: 1,
    });
    const lib = await readLibrary(mac);
    expect(lib.versions.find((v) => v.id === v1.id)?.watched).toBe(true);
    expect(lib.versions.find((v) => v.id === v2.id)?.position).toBe(300);

    // Les opérations envoyées recréent la même bibliothèque sur un 3e ordinateur.
    const ops = await pendingOperations(mac);
    const third = await freshDb();
    await applyRemoteOperations(
      third,
      ops.map((operation: Operation, i: number) => ({
        revision: i + 1,
        operation,
      })),
    );
    const thirdLib = await readLibrary(third);
    expect(
      thirdLib.versions.map((v) => [v.id, v.watched, v.position]).sort(),
    ).toEqual(lib.versions.map((v) => [v.id, v.watched, v.position]).sort());
    expect((await third.getAll("catalogLinks"))[0]).toMatchObject({
      malId: 40748,
      method: "user",
    });

    // Réimporter ne change rien et n'envoie rien.
    await removeOperations(
      mac,
      ops.map((o) => o.id),
    );
    expect(
      await importBackup(
        mac,
        await parseBackupFile(await exportText(pc)),
        "mac",
        11,
      ),
    ).toMatchObject({ added: 0, updated: 0, unchanged: 2, links: 0 });
    expect(await pendingOperations(mac)).toHaveLength(0);
  });

  it("n’efface rien : vu cumulatif, progression la plus récente", async () => {
    const old = await freshDb();
    const v = await recordOpened(old, obs(1), "pc", 1);
    await recordProgress(
      old,
      v.id,
      { position: 200, duration: 1420, playing: true, ended: false },
      "pc",
      2,
    );
    const file = await exportText(old);

    const here = await freshDb();
    await recordOpened(here, obs(1), "mac", 5);
    await recordProgress(
      here,
      v.id,
      { position: 1400, duration: 1420, playing: true, ended: false },
      "mac",
      6,
    );
    expect(
      await importBackup(here, await parseBackupFile(file), "mac", 10),
    ).toMatchObject({ updated: 0, unchanged: 1 });
    const kept = (await readLibrary(here)).versions[0];
    expect(kept).toMatchObject({ watched: true, position: 1400 });
  });

  it("accepte un export 0.3.6 et refuse un fichier inconnu", async () => {
    const legacy = JSON.stringify({
      version: 1,
      history: {
        "dandadan:1:vostfr": {
          anime: "dandadan",
          title: "Dandadan",
          number: 1,
          language: "VOSTFR",
          watched: true,
          url: "https://voiranime.cx/anime/dandadan/dandadan-01-vostfr/",
        },
      },
    });
    const parsed = await parseBackupFile("\uFEFF" + legacy);
    expect(parsed.kind).toBe("legacy");
    expect(parsed.library.versions).toHaveLength(1);
    await expect(parseBackupFile('{"foo":1}')).rejects.toThrow(/non reconnu/);
    await expect(parseBackupFile("pas du json")).rejects.toThrow(/JSON/);
    await expect(
      parseBackupFile(
        JSON.stringify({
          format: "animetrace-backup",
          version: 2,
          library: {},
        }),
      ),
    ).rejects.toThrow(/mets l’extension à jour/);
  });
});
