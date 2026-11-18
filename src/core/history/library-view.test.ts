import { describe, expect, it } from "vitest";
import type { Library } from "../../shared/model";
import { groupEpisodes, libraryView, type EpisodeView } from "./library-view";

const lib: Library = {
  schemaVersion: 1,
  animes: [
    { id: "a", observedTitle: "Overgeared" },
    { id: "b", observedTitle: "Dandadan" },
  ],
  seasons: [
    { id: "sa", animeId: "a", provisional: true },
    { id: "sb", animeId: "b", provisional: true },
  ],
  episodes: [
    { id: "e9", seasonId: "sa", number: 9 },
    { id: "e10", seasonId: "sa", number: 10 },
    { id: "b1", seasonId: "sb", number: 1 },
  ],
  versions: [
    {
      id: "v9",
      episodeId: "e9",
      language: "VOSTFR",
      watched: true,
      updatedAt: 100,
    },
    {
      id: "v9f",
      episodeId: "e9",
      language: "VF",
      watched: false,
      position: 190,
      duration: 1420,
      updatedAt: 150,
    },
    {
      id: "v10",
      episodeId: "e10",
      language: "VOSTFR",
      watched: false,
      position: 842,
      duration: 1420,
      updatedAt: 200,
    },
    {
      id: "vb",
      episodeId: "b1",
      language: "VOSTFR",
      watched: true,
      updatedAt: 50,
    },
  ],
  sourceRefs: [
    {
      site: "voiranime",
      contentKey: "overgeared:10:vostfr",
      entity: "version",
      entityId: "v10",
      url: "https://voiranime.to/anime/overgeared/overgeared-10-vostfr/",
    },
  ],
};

describe("bibliothèque", () => {
  it("trie par activité, compte VF et VOSTFR une seule fois, propose la reprise", () => {
    const view = libraryView(lib);
    expect(view.animes.map((a) => a.title)).toEqual(["Overgeared", "Dandadan"]);
    const og = view.animes[0]!;
    expect(og.watchedCount).toBe(1);
    expect(og.resume).toEqual({
      number: 10,
      knownUrl: expect.stringContaining("overgeared-10"),
    });
    expect(og.seasons[0]!.episodes.map((e) => e.number)).toEqual([10, 9]);
    expect(og.seasons[0]!.episodes[1]!.versions.map((v) => v.language)).toEqual(
      ["VF", "VOSTFR"],
    );
    expect(og.total).toBeNull();
    expect(view.animes[1]!.resume?.number).toBe(2);
    expect(view.totals).toEqual({
      animes: 2,
      watchedEpisodes: 2,
      lastActivity: 200,
    });
  });

  it("retire après sept jours les animes seulement ouverts et les réaffiche à la réouverture", () => {
    const openedAt = 1_000;
    const expiresAt = openedAt + 7 * 24 * 60 * 60 * 1_000;
    const opened = {
      ...lib.versions[3]!,
      watched: false,
      updatedAt: undefined,
      openedAt,
    };
    const history = { ...lib, versions: [...lib.versions.slice(0, 3), opened] };

    const before = libraryView(history, undefined, expiresAt - 1);
    expect(before.nextExpirationAt).toBe(expiresAt);
    expect(before.totals.animes).toBe(2);

    const after = libraryView(history, undefined, expiresAt);
    expect(after.nextExpirationAt).toBeUndefined();
    expect(after.animes.map((anime) => anime.id)).toEqual(["a"]);
    expect(after.totals.animes).toBe(1);

    history.versions.push({
      ...opened,
      id: "vb-f",
      language: "VF",
      openedAt: expiresAt,
    });
    expect(libraryView(history, undefined, expiresAt).totals.animes).toBe(2);
  });

  it("garde un anime sans épisode vu dès qu’une version a été lancée", () => {
    const watched = lib.versions[3]!;
    const history: Library = {
      ...lib,
      versions: [
        ...lib.versions.slice(0, 3),
        { ...watched, watched: false, position: 0, openedAt: 1 },
        {
          ...watched,
          id: "vb-f",
          language: "VF",
          watched: false,
          updatedAt: undefined,
          position: 42,
          openedAt: 1,
        },
      ],
    };
    const now = 30 * 24 * 60 * 60 * 1_000;
    const view = libraryView(history, undefined, now);
    expect(view.nextExpirationAt).toBeUndefined();
    expect(view.animes.find((anime) => anime.id === "b")?.watchedCount).toBe(0);
    // Même sans date de progression (ancien import), une position positive suffit.
    history.versions = history.versions.filter(
      (version) => version.id !== watched.id,
    );
    expect(libraryView(history, undefined, now).totals.animes).toBe(2);
  });

  it("replie les épisodes vus d’affilée", () => {
    const ep = (number: number, watched = true): EpisodeView => ({
      number,
      watched,
      versions: [
        { language: "VOSTFR", status: watched ? "watched" : "progress" },
      ],
    });
    const groups = groupEpisodes([
      ep(11, false),
      ep(10, false),
      ep(9),
      ep(8),
      ep(7),
      ep(6),
      ep(5),
      ep(4),
      ep(3),
      ep(2),
      ep(1),
    ]);
    expect(groups.slice(0, 3).map((g) => g.kind)).toEqual([
      "episode",
      "episode",
      "episode",
    ]);
    expect(groups[3]).toEqual({
      kind: "run",
      from: 1,
      to: 8,
      languages: ["VOSTFR"],
    });
  });
});
