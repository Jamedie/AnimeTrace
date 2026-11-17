// Base IndexedDB de la V1 (ARCHITECTURE.md §8).
// Seul ce module ouvre la base ; le cœur y accède par des fonctions dédiées.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Anime,
  Episode,
  Library,
  PlaybackVersion,
  Season,
  SourceRef,
} from "../../shared/model";
import type { MigrationRecord } from "../../core/backup/migration";
import type { Operation } from "../../core/sync/operations";
import type { ActivatedDomain } from "../../core/domains/origins";
import type {
  CatalogLink,
  MalEntry,
  MalSyncState,
} from "../../core/catalog/links";

export const DB_NAME = "animetrace";
export const DB_VERSION = 4;

interface AnimeTraceDB extends DBSchema {
  animes: { key: string; value: Anime };
  seasons: { key: string; value: Season; indexes: { byAnime: string } };
  episodes: { key: string; value: Episode; indexes: { bySeason: string } };
  versions: {
    key: string;
    value: PlaybackVersion;
    indexes: { byEpisode: string };
  };
  sourceRefs: {
    key: [string, string];
    value: SourceRef;
    indexes: { byEntity: string };
  };
  /** Ancienne clé 0.3.6 → identifiant de version (journal de correspondance). */
  legacyKeys: { key: string; value: { legacyKey: string; versionId: string } };
  /** Copies intactes de l'historique 0.3.6. */
  legacyBackups: {
    key: number;
    value: { at: number; history: Record<string, unknown> };
  };
  /** Opérations locales en attente d'envoi au cloud. */
  outbox: { key: string; value: Operation };
  /** Domaines de sites et de lecteurs activés par l'utilisateur. */
  domains: { key: string; value: ActivatedDomain };
  catalogLinks: { key: string; value: CatalogLink };
  malEntries: { key: number; value: MalEntry };
  malSync: { key: number; value: MalSyncState };
  meta: { key: string; value: unknown };
}

export type Database = IDBPDatabase<AnimeTraceDB>;

export function openDatabase(name = DB_NAME): Promise<Database> {
  return openDB<AnimeTraceDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Chaque nouvelle version du schéma ajoute un bloc « if (oldVersion < N) ».
      if (oldVersion < 1) {
        db.createObjectStore("animes", { keyPath: "id" });
        db.createObjectStore("seasons", { keyPath: "id" }).createIndex(
          "byAnime",
          "animeId",
        );
        db.createObjectStore("episodes", { keyPath: "id" }).createIndex(
          "bySeason",
          "seasonId",
        );
        db.createObjectStore("versions", { keyPath: "id" }).createIndex(
          "byEpisode",
          "episodeId",
        );
        db.createObjectStore("sourceRefs", {
          keyPath: ["site", "contentKey"],
        }).createIndex("byEntity", "entityId");
        db.createObjectStore("legacyKeys", { keyPath: "legacyKey" });
        db.createObjectStore("legacyBackups", { keyPath: "at" });
        db.createObjectStore("meta");
      }
      if (oldVersion < 2) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (oldVersion < 3) {
        db.createObjectStore("domains", { keyPath: "host" });
      }
      if (oldVersion < 4) {
        db.createObjectStore("catalogLinks", { keyPath: "seasonId" });
        db.createObjectStore("malEntries", { keyPath: "id" });
        db.createObjectStore("malSync", { keyPath: "malId" });
      }
    },
  });
}

const MIGRATION_KEY = "legacyMigration";
const ACTIVE_KEY = "activeStore";

export async function getMigrationRecord(
  db: Database,
): Promise<MigrationRecord | null> {
  return (
    ((await db.get("meta", MIGRATION_KEY)) as MigrationRecord | undefined) ??
    null
  );
}

export async function setMigrationRecord(
  db: Database,
  record: MigrationRecord,
): Promise<void> {
  await db.put("meta", record, MIGRATION_KEY);
}

/** Source active : « legacy » tant que la migration n'a pas réussi. */
export async function getActiveStore(db: Database): Promise<"v1" | "legacy"> {
  return ((await db.get("meta", ACTIVE_KEY)) as "v1" | undefined) ?? "legacy";
}

export async function saveLegacyBackup(
  db: Database,
  history: Record<string, unknown>,
  at: number,
): Promise<void> {
  await db.put("legacyBackups", { at, history });
}

/** Écrit toute la bibliothèque et bascule la source active dans une transaction unique. */
export async function commitLibrary(
  db: Database,
  library: Library,
  keyMap: Record<string, string>,
  record: MigrationRecord,
): Promise<void> {
  const tx = db.transaction(
    [
      "animes",
      "seasons",
      "episodes",
      "versions",
      "sourceRefs",
      "legacyKeys",
      "meta",
    ],
    "readwrite",
  );
  await Promise.all([
    ...library.animes.map((x) => tx.objectStore("animes").put(x)),
    ...library.seasons.map((x) => tx.objectStore("seasons").put(x)),
    ...library.episodes.map((x) => tx.objectStore("episodes").put(x)),
    ...library.versions.map((x) => tx.objectStore("versions").put(x)),
    ...library.sourceRefs.map((x) => tx.objectStore("sourceRefs").put(x)),
    ...Object.entries(keyMap).map(([legacyKey, versionId]) =>
      tx.objectStore("legacyKeys").put({ legacyKey, versionId }),
    ),
    tx.objectStore("meta").put(record, MIGRATION_KEY),
    tx.objectStore("meta").put("v1", ACTIVE_KEY),
  ]);
  await tx.done;
}

export async function countAll(db: Database) {
  return {
    animes: await db.count("animes"),
    seasons: await db.count("seasons"),
    episodes: await db.count("episodes"),
    versions: await db.count("versions"),
    legacyKeys: await db.count("legacyKeys"),
    legacyBackups: await db.count("legacyBackups"),
  };
}

/** Instantané complet de la bibliothèque, pour les vues (volume personnel : quelques centaines d'entrées). */
export async function readLibrary(db: Database): Promise<Library> {
  const [animes, seasons, episodes, versions, sourceRefs] = await Promise.all([
    db.getAll("animes"),
    db.getAll("seasons"),
    db.getAll("episodes"),
    db.getAll("versions"),
    db.getAll("sourceRefs"),
  ]);
  return { schemaVersion: 1, animes, seasons, episodes, versions, sourceRefs };
}

/** Mémorise un domaine activé et l'opération correspondante, dans la même transaction. */
export async function recordDomainActivated(
  db: Database,
  domain: ActivatedDomain,
  op: Operation,
): Promise<void> {
  const tx = db.transaction(["domains", "outbox"], "readwrite");
  await Promise.all([
    tx.objectStore("domains").put(domain),
    tx.objectStore("outbox").put(op),
    tx.done,
  ]);
}

export function listDomains(db: Database): Promise<ActivatedDomain[]> {
  return db.getAll("domains");
}
