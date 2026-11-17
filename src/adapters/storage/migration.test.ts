import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runLegacyMigration } from "../../core/backup/migration";
import {
  countAll,
  getActiveStore,
  getMigrationRecord,
  openDatabase,
} from "./database";
import { createMigrationPorts } from "./migration-ports";

let n = 0;
const freshDb = () => openDatabase(`test-${++n}`);

const history = {
  "solo-leveling:1:vostfr": {
    anime: "solo-leveling",
    title: "Solo Leveling",
    number: 1,
    language: "VOSTFR",
    watched: true,
    position: 1400,
    duration: 1420,
  },
  "solo-leveling:1:vf": {
    anime: "solo-leveling",
    title: "Solo Leveling",
    number: 1,
    language: "VF",
    openedAt: 3,
  },
};

describe("migration au premier démarrage", () => {
  it("migre, sauvegarde et bascule sur la nouvelle base", async () => {
    const db = await freshDb();
    const record = await runLegacyMigration(
      createMigrationPorts(db, async () => structuredClone(history)),
    );
    expect(record.status).toBe("done");
    expect(await getActiveStore(db)).toBe("v1");
    expect(await countAll(db)).toMatchObject({
      animes: 1,
      episodes: 1,
      versions: 2,
      legacyKeys: 2,
      legacyBackups: 1,
    });
  });

  it("ne refait rien au démarrage suivant", async () => {
    const db = await freshDb();
    const ports = createMigrationPorts(db, async () =>
      structuredClone(history),
    );
    const first = await runLegacyMigration(ports);
    const second = await runLegacyMigration(ports);
    expect(second).toEqual(first);
    expect((await countAll(db)).legacyBackups).toBe(1);
  });

  it("nouvelle installation : rien à migrer", async () => {
    const db = await freshDb();
    expect(
      (await runLegacyMigration(createMigrationPorts(db, async () => null)))
        .status,
    ).toBe("not-needed");
  });

  it("en cas d’échec, reste sur l’ancien historique et garde le rapport", async () => {
    const db = await freshDb();
    const record = await runLegacyMigration(
      createMigrationPorts(db, async () => ({
        "x:1:vostfr": {
          anime: "x",
          number: 1,
          language: "VOSTFR",
          position: "abc",
        },
      })),
    );
    // Entrée invalide : écartée dans le rapport, jamais supprimée ; l'ancien historique reste intact.
    expect(record.status).toBe("done");
    expect(record.report?.counts.rejected).toBe(1);
    const broken = await freshDb();
    const failed = await runLegacyMigration(
      createMigrationPorts(broken, async () => {
        throw new Error("lecture impossible");
      }),
    );
    expect(failed.status).toBe("failed");
    expect(await getActiveStore(broken)).toBe("legacy");
    expect((await getMigrationRecord(broken))?.error).toBe(
      "lecture impossible",
    );
    // Un échec sera retenté au démarrage suivant.
    const retry = await runLegacyMigration(
      createMigrationPorts(broken, async () => structuredClone(history)),
    );
    expect(retry.status).toBe("done");
  });
});

const privatePath = "tests/fixtures/private/animetrace-0.3.6.json";
describe.skipIf(!existsSync(privatePath))(
  "sauvegarde réelle dans IndexedDB",
  () => {
    it("écrit les 35 entrées et bascule", async () => {
      const db = await freshDb();
      const { history: real } = JSON.parse(readFileSync(privatePath, "utf8"));
      const record = await runLegacyMigration(
        createMigrationPorts(db, async () => real),
      );
      expect(record.status).toBe("done");
      expect(await countAll(db)).toMatchObject({
        animes: 11,
        seasons: 11,
        episodes: 35,
        versions: 35,
        legacyKeys: 35,
      });
    });
  },
);
