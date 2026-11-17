import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convertLegacyExport,
  verifyLegacyConversion,
} from "./legacy-converter";
import { uuidV5 } from "./deterministic-id";

const sample = {
  version: 1,
  history: {
    "solo-leveling:2:vostfr": {
      id: "solo-leveling:2:vostfr",
      anime: "solo-leveling",
      title: "Solo Leveling",
      number: 2,
      language: "VOSTFR",
      watched: false,
      position: 300,
      duration: 1420,
      updatedAt: 20,
      openedAt: 10,
    },
    "solo-leveling:1:vostfr": {
      id: "solo-leveling:1:vostfr",
      anime: "solo-leveling",
      title: "Solo Leveling",
      number: 1,
      language: "VOSTFR",
      watched: true,
      position: 1400,
      duration: 1420,
      updatedAt: 5,
      openedAt: 1,
      url: "https://voiranime.cx/anime/solo-leveling/solo-leveling-01-vostfr/",
    },
    "solo-leveling:1:vf": {
      id: "solo-leveling:1:vf",
      anime: "solo-leveling",
      title: "Solo Leveling",
      number: 1,
      language: "VF",
      openedAt: 3,
    },
    "dandadan:4:vostfr": {
      id: "dandadan:4:vostfr",
      anime: "dandadan",
      number: 4,
      language: "VOSTFR",
      watched: true,
    },
  },
};

describe("convertisseur 0.3.6", () => {
  it("produit des UUID v5 conformes", async () => {
    // Vecteur de référence RFC 4122 (espace de noms DNS).
    expect(
      await uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("respecte la hiérarchie et regroupe VF/VOSTFR sous un même épisode", async () => {
    const out = await convertLegacyExport(sample);
    expect(out.library.animes).toHaveLength(2);
    expect(out.library.seasons).toHaveLength(2);
    expect(out.library.episodes).toHaveLength(3);
    expect(out.library.versions).toHaveLength(4);
    const vf = out.library.versions.find(
      (v) => v.id === out.keyMap["solo-leveling:1:vf"],
    );
    const vo = out.library.versions.find(
      (v) => v.id === out.keyMap["solo-leveling:1:vostfr"],
    );
    expect(vf?.episodeId).toBe(vo?.episodeId);
    expect(vf).not.toHaveProperty("position"); // champ absent reste absent
    expect(verifyLegacyConversion(sample, out).ok).toBe(true);
  });

  it("est déterministe et indépendant de l’ordre", async () => {
    const reversed = {
      version: 1,
      history: Object.fromEntries(Object.entries(sample.history).reverse()),
    };
    expect(await convertLegacyExport(reversed)).toEqual(
      await convertLegacyExport(sample),
    );
  });

  it("écarte les entrées invalides sans les perdre", async () => {
    const bad = {
      version: 1,
      history: {
        ...sample.history,
        "x:1:jp": { anime: "x", number: 1, language: "JP" },
      },
    };
    const out = await convertLegacyExport(bad);
    expect(out.rejected).toEqual([
      { key: "x:1:jp", reason: "langue inconnue", raw: bad.history["x:1:jp"] },
    ]);
    expect(verifyLegacyConversion(bad as never, out).ok).toBe(true);
  });

  it("ne modifie pas la sauvegarde", async () => {
    const copy = structuredClone(sample);
    await convertLegacyExport(copy);
    expect(copy).toEqual(sample);
  });

  it("refuse une version de sauvegarde inconnue", async () => {
    await expect(
      convertLegacyExport({ version: 2, history: {} }),
    ).rejects.toThrow();
  });
});

// Sauvegarde réelle : hors dépôt (tests/fixtures/private/), test ignoré si absente.
const privatePath = "tests/fixtures/private/animetrace-0.3.6.json";
describe.skipIf(!existsSync(privatePath))("sauvegarde réelle 0.3.6", () => {
  it("conserve les 35 entrées : 11 animes, 35 épisodes, 35 versions", async () => {
    const input = JSON.parse(readFileSync(privatePath, "utf8"));
    const out = await convertLegacyExport(input);
    const report = verifyLegacyConversion(input, out);
    expect(report.problems).toEqual([]);
    expect(report.counts).toMatchObject({
      entries: 35,
      animes: 11,
      episodes: 35,
      versions: 35,
      rejected: 0,
    });
  });
});
