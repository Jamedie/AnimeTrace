import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { openDatabase } from "../storage/database";
import { getAnime } from "./client";
import { runMal } from "./sync";

vi.mock("wxt/browser", () => ({
  browser: { storage: { local: { get: async () => ({}), remove: vi.fn() } } },
}));

vi.mock("./client", () => ({
  hasMalAccess: async () => true,
  getAnime: vi.fn(),
}));

it("récupère une fiche absente du cache à partir d'une association existante", async () => {
  const db = await openDatabase("mal-sync");
  const link = { seasonId: "s1", status: "confirmed", malId: 52299, at: 1 } as const;
  await db.put("catalogLinks", link);
  const entry = {
    id: link.malId,
    title: "Solo Leveling",
    num_episodes: 12,
    main_picture: { medium: "https://cdn.myanimelist.net/solo-leveling.jpg" },
  };
  vi.mocked(getAnime).mockResolvedValue(entry);

  await runMal(db, "device");
  await runMal(db, "device");

  expect(getAnime).toHaveBeenCalledExactlyOnceWith(link.malId);
  expect(await db.get("malEntries", link.malId)).toMatchObject(entry);
  expect(await db.get("catalogLinks", link.seasonId)).toEqual(link);
  expect(await db.count("outbox")).toBe(0);
  db.close();
});
