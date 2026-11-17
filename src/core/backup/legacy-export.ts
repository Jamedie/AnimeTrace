// Fichier d'export de la copie 0.3.6, déclenché par le bouton « Exporter » de l'écran de migration.
// Même format que l'export de la 0.3.6 : réimportable tel quel.

export interface ExportFile {
  filename: string;
  content: string;
}

export function buildLegacyExportFile(
  history: Record<string, unknown>,
  at: number,
): ExportFile {
  const date = new Date(at).toISOString().slice(0, 10);
  return {
    filename: `animetrace-0.3.6-${date}.json`,
    content: JSON.stringify({ version: 1, history }, null, 2),
  };
}
