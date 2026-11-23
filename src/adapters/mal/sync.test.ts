import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { answerMal, getMalSync } from "../storage/catalog-store";
import { openDatabase } from "../storage/database";
import { recordOpened, recordProgress } from "../storage/history-store";
import { getAnime, getMyStatus, MalError, updateMyStatus } from "./client";
import { runMal } from "./sync";

const { getLocalStorage } = vi.hoisted(() => ({
  getLocalStorage: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    storage: { local: { get: getLocalStorage, remove: vi.fn(), set: vi.fn() } },
  },
}));

vi.mock("./client", async (importOriginal) => ({
  MalError: (await importOriginal<typeof import("./client")>()).MalError,
  hasMalAccess: async () => true,
  getAnime: vi.fn(),
  getMyStatus: vi.fn(),
  updateMyStatus: vi.fn(),
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

it("reporte le passage supplémentaire après un HTTP 429 du catalogue", async () => {
  const db = await openDatabase("mal-sync-catalog-rate-limit");
  const requestStarted = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Awaited<ReturnType<typeof getAnime>>>();
  vi.mocked(getAnime).mockClear();
  vi.mocked(getAnime).mockImplementationOnce(() => {
    requestStarted.resolve();
    return response.promise;
  });
  try {
    await db.put("catalogLinks", {
      seasonId: "s1",
      status: "confirmed",
      malId: 52299,
      at: 1,
    });
    const sync = runMal(db, "device");
    const started = await Promise.race([
      requestStarted.promise.then(() => true),
      sync.then(() => false),
    ]);
    expect(started).toBe(true);
    const queued = runMal(db, "device", { rerunIfRunning: true });
    response.reject(new MalError("Trop de requêtes", 429));
    await queued;
    expect(getAnime).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

it.each(["lecture réussie", "lecture en erreur", "écriture déjà partie"] as const)(
  "conserve la réponse donnée pendant une requête MAL (%s)",
  async (result) => {
    const db = await openDatabase(`mal-sync-answer-${result}`);
    const device = "device";
    const malId = 52299;
    const requestStarted = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Awaited<ReturnType<typeof getMyStatus>>>();
    const writing = result === "écriture déjà partie";
    getLocalStorage.mockResolvedValue({
      malSession: { expiresAt: Date.now() + 120_000 },
    });
    vi.mocked(getMyStatus).mockImplementationOnce(() => {
      if (writing) return Promise.resolve({ num_episodes_watched: 0 });
      requestStarted.resolve();
      return response.promise;
    });
    if (writing) {
      vi.mocked(updateMyStatus).mockImplementationOnce(async () => {
        requestStarted.resolve();
        const status = await response.promise;
        return status ?? {};
      });
    }

    try {
      const version = await recordOpened(db, {
        site: "voiranime",
        contentKey: "solo-leveling",
        title: "Solo Leveling",
        number: 3,
        language: "VOSTFR",
        url: "https://voiranime.cx/anime/solo-leveling/solo-leveling-03-vostfr/",
      }, device, 1);
      await recordProgress(db, version.id, {
        position: 100,
        duration: 100,
        playing: true,
        ended: true,
      }, device, 2);
      const [season] = await db.getAll("seasons");
      await db.put("catalogLinks", {
        seasonId: season!.id, status: "confirmed", malId, at: 3,
      });
      await db.put("malEntries", { id: malId, title: "Solo Leveling", fetchedAt: 3 });
      await db.put("malSync", {
        malId,
        ...(writing ? { previousAnswer: true } : { question: { from: 1, to: 2 } }),
        updatedAt: 3,
      });

      const sync = runMal(db, device);
      const started = await Promise.race([
        requestStarted.promise.then(() => true),
        sync.then(() => false),
      ]);
      expect(started).toBe(true);
      try {
        if (writing) {
          await answerMal(db, malId, { keepRemote: { remote: 0, ignoreUntil: 3 } }, device);
        } else {
          await answerMal(db, malId, { previousAnswer: false }, device);
          expect(await getMalSync(db, malId)).toMatchObject({ previousAnswer: false });
        }
      } finally {
        if (result === "lecture en erreur") response.reject(new Error("MAL indisponible"));
        else response.resolve({ num_episodes_watched: writing ? 3 : 0 });
        await sync;
      }

      const state = await getMalSync(db, malId);
      if (writing) {
        expect(updateMyStatus).toHaveBeenCalledExactlyOnceWith(
          expect.anything(), malId, { num_watched_episodes: 3, status: "watching" },
        );
        expect(state).toMatchObject({ ignoreUntil: 3, lastSent: 3 });
        return;
      }
      expect.soft(state?.previousAnswer).toBe(false);
      expect.soft(state?.question).toBeUndefined();
      expect.soft(state?.lastError).toBe(
        result === "lecture en erreur" ? "MAL indisponible" : undefined,
      );
      expect(updateMyStatus).not.toHaveBeenCalled();
    } finally {
      getLocalStorage.mockReset();
      db.close();
    }
  },
);
