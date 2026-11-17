import { describe, expect, it } from "vitest";
import { buildLegacyExportFile } from "./legacy-export";
import { convertLegacyExport } from "./legacy-converter";

describe("export de la copie 0.3.6", () => {
  it("produit un fichier réimportable", async () => {
    const history = {
      "a:1:vf": { anime: "a", number: 1, language: "VF", watched: true },
    };
    const file = buildLegacyExportFile(history, Date.UTC(2026, 10, 17));
    expect(file.filename).toBe("animetrace-0.3.6-2026-11-17.json");
    const out = await convertLegacyExport(JSON.parse(file.content));
    expect(out.library.versions).toHaveLength(1);
  });
});
