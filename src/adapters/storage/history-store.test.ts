import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runLegacyMigration } from "../../core/backup/migration";
import type { EpisodeObservation } from "../../connectors/types";
import { countAll, openDatabase } from "./database";
import { recordOpened, recordProgress } from "./history-store";
import { createMigrationPorts } from "./migration-ports";

let n = 0;
const freshDb = () => openDatabase(`history-${++n}`);
const obs = (over: Partial<EpisodeObservation> = {}): EpisodeObservation => ({
  site: "voiranime",
  contentKey: "solo-leveling",
  title: "Solo Leveling",
  number: 3,
  language: "VOSTFR",
  url: "https://voiranime.cx/anime/solo-leveling/solo-leveling-03-vostfr/",
  ...over,
});
const playing = { playing: true, ended: false };

describe("enregistrement des lectures", () => {
  it("ouverture puis lecture jusqu’à 90 %, avec opérations à synchroniser", async () => {
    const db = await freshDb();
    const v = await recordOpened(db, obs(), "pc", 1);
    expect(v.watched).toBe(false);
    const done = await recordProgress(
      db,
      v.id,
      { position: 1300, duration: 1420, ...playing },
      "pc",
      2,
    );
    expect(done?.watched).toBe(true);
    expect(await db.count("outbox")).toBe(2);
  });

  it("changement de domaine : même anime, même version, adresse mise à jour", async () => {
    const db = await freshDb();
    const a = await recordOpened(db, obs(), "pc", 1);
    const b = await recordOpened(
      db,
      obs({
        url: "https://voiranime.to/anime/solo-leveling/solo-leveling-03-vostfr/",
      }),
      "pc",
      2,
    );
    expect(b.id).toBe(a.id);
    expect(await countAll(db)).toMatchObject({
      animes: 1,
      episodes: 1,
      versions: 1,
    });
    expect(
      (await db.get("sourceRefs", ["voiranime", "solo-leveling:3:vostfr"]))
        ?.url,
    ).toContain("voiranime.to");
  });

  it("VF et VOSTFR : un seul épisode, deux versions", async () => {
    const db = await freshDb();
    await recordOpened(db, obs(), "pc", 1);
    await recordOpened(db, obs({ language: "VF" }), "pc", 2);
    expect(await countAll(db)).toMatchObject({ episodes: 1, versions: 2 });
  });

  it("une progression ignorée n’écrit rien", async () => {
    const db = await freshDb();
    const v = await recordOpened(db, obs(), "pc", 1);
    expect(
      await recordProgress(
        db,
        v.id,
        { position: 0, duration: 1420, playing: false, ended: false },
        "pc",
        2,
      ),
    ).toBeNull();
    expect(
      await recordProgress(
        db,
        "inconnue",
        { position: 5, duration: 1420, ...playing },
        "pc",
        2,
      ),
    ).toBeNull();
    expect(await db.count("outbox")).toBe(1);
  });
});

const privatePath = "tests/fixtures/private/animetrace-0.3.6.json";
describe.skipIf(!existsSync(privatePath))(
  "continuité avec la migration",
  () => {
    it("une nouvelle lecture d’un épisode migré ne crée pas de doublon", async () => {
      const db = await freshDb();
      const { history } = JSON.parse(readFileSync(privatePath, "utf8"));
      await runLegacyMigration(createMigrationPorts(db, async () => history));
      const [key, entry] = Object.entries<{
        anime: string;
        number: number;
        title: string;
      }>(history)[0]!;
      const v = await recordOpened(
        db,
        obs({
          contentKey: entry.anime,
          number: entry.number,
          title: entry.title,
          url: "https://voiranime.to/x/",
        }),
        "pc",
        Date.now(),
      );
      expect((await db.get("legacyKeys", key))?.versionId).toBe(v.id);
      expect(await countAll(db)).toMatchObject({
        animes: 11,
        episodes: 35,
        versions: 35,
      });
    });
  },
);
