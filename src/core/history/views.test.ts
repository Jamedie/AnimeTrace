import { describe, expect, it } from "vitest";
import type { Library } from "../../shared/model";
import { currentEpisodeView, recentAnimes } from "./views";

function lib(): Library {
  return {
    schemaVersion: 1,
    animes: [
      { id: "a1", observedTitle: "Solo Leveling" },
      { id: "a2", observedTitle: "Dandadan" },
      { id: "a3", observedTitle: "Ouvert seulement" },
    ],
    seasons: [
      { id: "s1", animeId: "a1", provisional: true },
      { id: "s2", animeId: "a2", provisional: true },
      { id: "s3", animeId: "a3", provisional: true },
    ],
    episodes: [
      { id: "e1", seasonId: "s1", number: 1 },
      { id: "e2", seasonId: "s1", number: 2 },
      { id: "e3", seasonId: "s1", number: 3 },
      { id: "d4", seasonId: "s2", number: 4 },
      { id: "o1", seasonId: "s3", number: 1 },
    ],
    versions: [
      {
        id: "v1",
        episodeId: "e1",
        language: "VOSTFR",
        watched: true,
        updatedAt: 10,
      },
      {
        id: "v1f",
        episodeId: "e1",
        language: "VF",
        watched: true,
        updatedAt: 11,
      },
      {
        id: "v2",
        episodeId: "e2",
        language: "VOSTFR",
        watched: true,
        updatedAt: 20,
      },
      {
        id: "v3",
        episodeId: "e3",
        language: "VOSTFR",
        watched: false,
        position: 300,
        duration: 1400,
        updatedAt: 30,
      },
      {
        id: "vd",
        episodeId: "d4",
        language: "VOSTFR",
        watched: true,
        updatedAt: 25,
      },
      {
        id: "vo",
        episodeId: "o1",
        language: "VOSTFR",
        watched: false,
        openedAt: 99,
      },
    ],
    sourceRefs: [
      {
        site: "voiranime",
        contentKey: "solo-leveling:3:vostfr",
        entity: "version",
        entityId: "v3",
        url: "https://voiranime.to/anime/solo-leveling/solo-leveling-03-vostfr/",
      },
    ],
  };
}

describe("vues de la fenêtre de l’icône", () => {
  it("Récemment : un anime par ligne, trié, sans les pages juste ouvertes", () => {
    const rows = recentAnimes(lib());
    expect(rows.map((r) => r.title)).toEqual(["Solo Leveling", "Dandadan"]);
    expect(rows[0]).toMatchObject({
      lastNumber: 3,
      lastStatus: "progress",
      watchedCount: 2,
      total: null,
      lastPosition: 300,
    });
    expect(rows[1]).toMatchObject({
      lastNumber: 4,
      lastStatus: "watched",
    });
  });

  it("épisode de la page courante", () => {
    expect(currentEpisodeView(lib(), "v3")).toEqual({
      animeId: "a1",
      title: "Solo Leveling",
      number: 3,
      language: "VOSTFR",
      status: "progress",
      position: 300,
      duration: 1400,
      domain: "voiranime.to",
    });
    expect(currentEpisodeView(lib(), "vo")?.status).toBe("opened");
    expect(currentEpisodeView(lib(), "inconnue")).toBeNull();
  });
});
