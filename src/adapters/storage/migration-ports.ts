// Branche la migration du cœur sur IndexedDB et sur le stockage de la 0.3.6.

import { browser } from "wxt/browser";

import type { MigrationPorts } from "../../core/backup/migration";
import * as store from "./database";

/** La 0.3.6 rangeait son historique sous la clé « history » de chrome.storage.local. */
export async function readLegacyHistoryFromChrome(): Promise<Record<
  string,
  unknown
> | null> {
  const { history } = await browser.storage.local.get("history");
  return history && typeof history === "object"
    ? (history as Record<string, unknown>)
    : null;
}

export function createMigrationPorts(
  db: store.Database,
  readLegacyHistory: () => Promise<Record<
    string,
    unknown
  > | null> = readLegacyHistoryFromChrome,
): MigrationPorts {
  return {
    readLegacyHistory,
    saveLegacyBackup: (history, at) => store.saveLegacyBackup(db, history, at),
    commitLibrary: (library, keyMap, record) =>
      store.commitLibrary(db, library, keyMap, record),
    getMigrationRecord: () => store.getMigrationRecord(db),
    setMigrationRecord: (record) => store.setMigrationRecord(db, record),
    now: () => Date.now(),
  };
}
