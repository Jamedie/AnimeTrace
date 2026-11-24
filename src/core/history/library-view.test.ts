import { describe, expect, it } from "vitest";
import type { Library } from "../../shared/model";
import { groupEpisodes, libraryView, type EpisodeView } from "./library-view";
import { recentAnimes } from "./views";

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
  it("compte les épisodes par saison et reprend la dernière lecture sans emprunter une source", () => {
    const history = structuredClone(lib);
    history.seasons.push({ id: "sa2", animeId: "a", provisional: true });
    history.episodes.push(
      { id: "a1s1", seasonId: "sa", number: 1 },
      { id: "a1s2", seasonId: "sa2", number: 1 },
      { id: "a8s2", seasonId: "sa2", number: 8 },
    );
    history.versions.push(
      { id: "s1-1", episodeId: "a1s1", language: "VF", watched: true, updatedAt: 210 },
      { id: "s2-1", episodeId: "a1s2", language: "VOSTFR", watched: true, updatedAt: 220 },
      { id: "s2-1-vf", episodeId: "a1s2", language: "VF", watched: false, position: 600, updatedAt: 230 },
      { id: "s2-8", episodeId: "a8s2", language: "VF", watched: false, openedAt: 240 },
    );

    const recent = recentAnimes(history)[0]!;
    expect(recent).toMatchObject({ watchedCount: 3, lastNumber: 1, lastLanguage: "VF" });
    const card = libraryView(history).animes[0];
    expect(card).toMatchObject({
      watchedCount: 3,
      resume: { number: 1 },
      lastPlayback: { number: 1, language: "VF", position: 600 },
    });
    expect(card?.resume?.knownUrl).toBeUndefined();
    expect(card?.lastActivity).toBe(240);
  });

  it("exige une source connue pour l'épisode suivant si le total est inconnu", () => {
    const history = structuredClone(lib);
    history.versions[2]!.watched = true;
    const resume = () => libraryView(history).animes[0]?.resume;
    expect(resume()).toEqual({ number: 11 });

    const url = "https://voiranime.to/anime/overgeared/overgeared-11-vostfr/";
    history.episodes.push({ id: "e11", seasonId: "sa", number: 11 });
    history.versions.push({ id: "v11", episodeId: "e11", language: "VOSTFR", watched: false });
    history.sourceRefs.push({ site: "voiranime", contentKey: "overgeared:11:vostfr", entity: "version", entityId: "v11", url });
    expect(resume()).toEqual({ number: 11, knownUrl: url });
  });

  it("continue dans la saison locale quand la fiche MAL ne couvre qu'une partie", () => {
    const history = structuredClone(lib);
    history.versions[2]!.watched = true;
    history.animes.push({ id: "a2", observedTitle: "Overgeared Saison 2" });
    history.seasons.push({ id: "sa2", animeId: "a2", provisional: false });
    history.episodes.push({ id: "e1s2", seasonId: "sa2", number: 1 });
    history.versions.push({ id: "v1s2", episodeId: "e1s2", language: "VOSTFR", watched: false });
    const catalog = {
      links: [
        { seasonId: "sa", malId: 1, status: "confirmed", at: 1 },
        { seasonId: "sa2", malId: 2, status: "confirmed", at: 1 },
      ],
      entries: [
        { id: 1, title: "Overgeared Season 1 Part 1", num_episodes: 10, fetchedAt: 1 },
        { id: 2, title: "Overgeared Season 2", num_episodes: 12, fetchedAt: 1 },
      ],
      malSync: [],
    } satisfies Parameters<typeof libraryView>[1];
    const resume = () => libraryView(history, catalog).animes.find((a) => a.id === "a")?.resume;
    const nextSeasonUrl = "https://voiranime.to/anime/overgeared-2/overgeared-2-01-vostfr/";
    history.sourceRefs.push({ site: "voiranime", contentKey: "overgeared-2:1:vostfr", entity: "version", entityId: "v1s2", url: nextSeasonUrl });
    expect(resume()).toEqual({ number: 11 });

    const url = "https://voiranime.to/anime/overgeared/overgeared-11-vostfr/";
    history.episodes.push({ id: "e11", seasonId: "sa", number: 11 });
    history.versions.push({ id: "v11", episodeId: "e11", language: "VOSTFR", watched: false });
    history.sourceRefs.push({ site: "voiranime", contentKey: "overgeared:11:vostfr", entity: "version", entityId: "v11", url });
    expect(resume()).toEqual({ number: 11, knownUrl: url });
  });

  it("reprend une version importée non datée sans passer devant une lecture datée", () => {
    const history = structuredClone(lib);
    const imported = history.versions[2]!;
    delete imported.updatedAt;
    imported.openedAt = 500;
    const card = () => libraryView(history).animes[0];
    expect(card()).toMatchObject({
      lastActivity: 500,
      lastPlayback: { number: 9, at: 150 },
    });

    history.versions = history.versions.filter((v) => v.episodeId !== "e9");
    expect(card()).toMatchObject({
      resume: { number: 10, knownUrl: history.sourceRefs[0]!.url },
      lastPlayback: { number: 10, position: 842 },
    });
    expect(card()?.lastPlayback?.at).toBeUndefined();
  });
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

    // Le prochain instantané contient la progression reçue d'un autre appareil.
    const playedAt = openedAt + 2;
    history.versions[3] = { ...opened, updatedAt: playedAt, position: 42 };
    expect(libraryView(history, undefined, expiresAt).animes.find((a) => a.id === "b"))
      .toMatchObject({ lastActivity: playedAt, lastPlayback: { number: 1, position: 42 } });
    history.versions[3] = opened;

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

it("demande les épisodes précédents même sans question de synchronisation MAL", () => {
  const history = structuredClone(lib);
  history.episodes[0]!.number = 12;
  const catalog = {
    links: [{ seasonId: "sa", status: "confirmed", malId: 1, at: 1 }],
    entries: [{ id: 1, title: "Clevatess", num_episodes: 12, fetchedAt: 1 }],
    malSync: [{ malId: 1, lastSent: 12, updatedAt: 1 }],
  } satisfies Parameters<typeof libraryView>[1];
  const card = libraryView(history, catalog).animes.find((a) => a.id === "a");
  expect(card?.seasons[0]).toMatchObject({ previousQuestion: { from: 1, to: 11 } });

  const afterAnswer = (confirmed: number) =>
    libraryView(history, catalog, 200, undefined, {
      "library.previous:sa": { reviewed: 11, confirmed },
    }).animes.find((a) => a.id === "a")!;
  expect(afterAnswer(11)).toMatchObject({ watchedCount: 12, status: "completed" });
  expect(afterAnswer(11).lastPlayback?.number).toBe(10);
  expect(afterAnswer(0).watchedCount).toBe(1);
  expect(afterAnswer(0).seasons[0]?.previousQuestion).toBeUndefined();
});

it("retire un anime sans épisode vu jusqu’à une nouvelle activité", () => {
  const history = structuredClone(lib);
  const version = history.versions[3]!;
  version.watched = false;
  version.openedAt = 50;
  const cards = () => libraryView(history, undefined, 200, undefined, {
    "library.hidden:a": 200,
    "library.hidden:b": 50,
  }).animes.map((a) => a.id);

  expect(cards()).toEqual(["a"]);
  version.openedAt = 100;
  expect(cards()).toEqual(["a", "b"]);
});
