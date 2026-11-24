import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { bindPlaybackTab } from "../src/adapters/browser/playback-document";
import { openDatabase } from "../src/adapters/storage/database";
import { recordOpened } from "../src/adapters/storage/history-store";

const { executeScript, session } = vi.hoisted(() => ({
  executeScript: vi.fn(),
  session: new Map<string, unknown>(),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    permissions: { contains: async () => false },
    scripting: { executeScript },
    storage: {
      session: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.map((key) => [key, session.get(key)])),
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) session.set(key, value);
        },
      },
    },
  },
}));

it("rétablit l'épisode actif après redémarrage et le retire après navigation", async () => {
  vi.stubGlobal("defineBackground", vi.fn());
  const db = await openDatabase("popup-playback-document");
  try {
    const url = "https://voiranime.cx/anime/title/title-01-vf/";
    const version = await recordOpened(db, {
      site: "voiranime",
      contentKey: "title",
      title: "Title",
      number: 1,
      language: "VF",
      url,
    }, "device", 1);
    await bindPlaybackTab(10, {
      documentId: "episode-page",
      url,
      versionId: version.id,
      site: "voiranime",
    });
    executeScript.mockResolvedValue([{ documentId: "episode-page", result: url }]);
    const before = await import("../src/entrypoints/background");
    expect((await before.popupState(db, 10)).current).toMatchObject({ number: 1 });

    vi.resetModules();
    const restarted = await import("../src/entrypoints/background");
    expect((await restarted.popupState(db, 10)).current).toMatchObject({ number: 1 });

    executeScript.mockResolvedValue([
      { documentId: "other-page", result: "https://voiranime.cx/" },
    ]);
    expect((await restarted.popupState(db, 10)).current).toBeNull();
  } finally {
    db.close();
    vi.unstubAllGlobals();
  }
});

it("affiche dans la liste récente les épisodes précédents confirmés", async () => {
  vi.stubGlobal("defineBackground", vi.fn());
  const db = await openDatabase("popup-confirmed-episodes");
  try {
    const version = await recordOpened(db, {
      site: "voiranime",
      contentKey: "clevatess",
      title: "Clevatess",
      number: 12,
      language: "VF",
      url: "https://voiranime.cx/anime/clevatess/clevatess-12-vf/",
    }, "device", 1);
    await db.put("versions", { ...version, watched: true, updatedAt: 2 });
    const [season] = await db.getAll("seasons");
    await db.put("meta", { confirmed: 11, reviewed: 11 }, `library.previous:${season!.id}`);
    const { popupState } = await import("../src/entrypoints/background");
    expect((await popupState(db, null)).recent[0]).toMatchObject({
      watchedCount: 12,
      lastNumber: 12,
    });
  } finally {
    db.close();
    vi.unstubAllGlobals();
  }
});
