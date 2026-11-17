// Migration de la 0.3.6 au premier démarrage (ARCHITECTURE.md §11).
// Le cœur ne touche pas au navigateur : il reçoit des « ports » fournis par les adaptateurs.

import type { Library } from "../../shared/model";
import {
  convertLegacyExport,
  verifyLegacyConversion,
  type LegacyEntry,
  type VerificationReport,
} from "./legacy-converter";

export type MigrationStatus = "not-needed" | "done" | "failed";

export interface MigrationRecord {
  status: MigrationStatus;
  at: number;
  report?: VerificationReport;
  error?: string;
}

export interface MigrationPorts {
  /** Lit l'historique 0.3.6 sans le modifier ; null si aucun. */
  readLegacyHistory(): Promise<Record<string, unknown> | null>;
  /** Conserve une copie intacte de l'ancien historique. */
  saveLegacyBackup(history: Record<string, unknown>, at: number): Promise<void>;
  /** Écrit la bibliothèque convertie et active la nouvelle base, en une seule transaction. */
  commitLibrary(
    library: Library,
    keyMap: Record<string, string>,
    record: MigrationRecord,
  ): Promise<void>;
  getMigrationRecord(): Promise<MigrationRecord | null>;
  setMigrationRecord(record: MigrationRecord): Promise<void>;
  now(): number;
}

/**
 * Lance la migration si nécessaire. Ne bascule que si la vérification est parfaite ;
 * sinon l'ancien historique reste la source active et un rapport est conservé.
 * Rejouable sans effet : une migration réussie n'est jamais refaite.
 */
export async function runLegacyMigration(
  ports: MigrationPorts,
): Promise<MigrationRecord> {
  const previous = await ports.getMigrationRecord();
  if (previous?.status === "done" || previous?.status === "not-needed")
    return previous;

  const at = ports.now();
  try {
    const history = await ports.readLegacyHistory();
    if (!history || Object.keys(history).length === 0) {
      const record: MigrationRecord = { status: "not-needed", at };
      await ports.setMigrationRecord(record);
      return record;
    }
    await ports.saveLegacyBackup(structuredClone(history), at);
    const input = { version: 1, history };
    const conversion = await convertLegacyExport(input);
    const report = verifyLegacyConversion(
      input as { history: Record<string, LegacyEntry> },
      conversion,
    );
    if (!report.ok) {
      const record: MigrationRecord = { status: "failed", at, report };
      await ports.setMigrationRecord(record);
      return record;
    }
    const record: MigrationRecord = { status: "done", at, report };
    await ports.commitLibrary(conversion.library, conversion.keyMap, record);
    return record;
  } catch (error) {
    const record: MigrationRecord = {
      status: "failed",
      at,
      error: error instanceof Error ? error.message : String(error),
    };
    await ports.setMigrationRecord(record);
    return record;
  }
}
