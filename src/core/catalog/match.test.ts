import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchCandidates,
  parseTitle,
  slugToTitle,
  type MalCandidate,
} from "./match";

// Fiches MAL réelles vérifiées le 17/11/2026 (données publiques du catalogue).
const validation = JSON.parse(
  readFileSync("tests/fixtures/mal-validation.json", "utf8"),
) as (MalCandidate & {
  related_anime?: { node: { id: number; title: string } }[];
})[];
// Leurres réalistes : saisons voisines et œuvres liées, comme dans une vraie recherche.
const decoys: MalCandidate[] = validation.flatMap((v) =>
  (v.related_anime ?? []).map((r) => ({
    id: r.node.id,
    title: r.node.title,
    media_type: "tv",
  })),
);
const pool: MalCandidate[] = [
  ...validation.map((v) => ({ ...v, media_type: "tv" })),
  ...decoys,
];

// Titres et identifiants observés sur Voiranime, avec la fiche attendue (MODELE-DONNEES.md §4).
const cases: [string, string, number][] = [
  ["a-wild-last-boss-appeared-2", "A Wild Last Boss Appeared! 2", 63140],
  ["boku-no-hero-academia-6", "Boku no Hero Academia 6", 49918],
  ["clevatess-2", "Clevatess 2", 62513],
  [
    "full-clearing-another-world-under-a-goddess-with-zero-believers",
    "Full Clearing Another World under a Goddess with Zero Believers",
    63292,
  ],
  ["gachiakuta", "Gachiakuta", 59062],
  [
    "goodbye-dragon-life-hello-human-life",
    "Goodbye Dragon Life, Hello Human Life",
    58445,
  ],
  ["overgeared", "Overgeared", 64340],
  [
    "reborn-as-a-space-mercenary-i-woke-up-piloting-the-strongest-starship",
    "Reborn as a Space Mercenary: I Woke Up Piloting the Strongest Starship!",
    60948,
  ],
  ["sentenced-to-be-a-hero", "Sentenced to Be a Hero", 56009],
  ["witch-hat-atelier", "Witch Hat Atelier", 51553],
  ["youjo-senki-2", "Youjo Senki 2", 49233],
];

describe("lecture des titres", () => {
  it("sépare titre et saison", () => {
    expect(parseTitle("A Wild Last Boss Appeared! Season 2")).toEqual({
      base: "a wild last boss appeared",
      season: 2,
    });
    expect(parseTitle("Boku no Hero Academia 6th Season")).toEqual({
      base: "boku no hero academia",
      season: 6,
    });
    expect(
      parseTitle("Clevatess II: Majuu no Ou to Itsuwari no Yuusha Denshou"),
    ).toEqual({ base: "clevatess", season: 2 });
    expect(parseTitle("Youjo Senki 2")).toEqual({
      base: "youjo senki",
      season: 2,
    });
    expect(parseTitle("Kaiju No. 8")).toEqual({
      base: "kaiju no 8",
      season: 1,
    });
    expect(parseTitle("Overgeared")).toEqual({ base: "overgeared", season: 1 });
  });
});

describe("association MAL sur les 11 animes de la sauvegarde", () => {
  for (const [slug, title, expected] of cases) {
    it(`${title} → ${expected}`, () => {
      expect(matchCandidates([title, slugToTitle(slug)], pool)).toEqual({
        status: "confirmed",
        malId: expected,
        method: "auto",
      });
    });
  }
});

describe("prudence", () => {
  it("ne prend pas la saison 1 quand on regarde la saison 2", () => {
    const s1: MalCandidate = {
      id: 1,
      title: "Clevatess: Majuu no Ou",
      alternative_titles: { en: "Clevatess" },
      media_type: "tv",
    };
    expect(matchCandidates(["Clevatess 2"], [s1])).toEqual({
      status: "pending",
      candidates: [1],
    });
  });

  it("reste en attente si deux fiches de série correspondent", () => {
    const a: MalCandidate = { id: 1, title: "Dandadan", media_type: "tv" };
    const b: MalCandidate = {
      id: 2,
      title: "Dandadan",
      alternative_titles: { en: "Dan Da Dan" },
      media_type: "ona",
    };
    expect(matchCandidates(["Dandadan"], [a, b]).status).toBe("pending");
  });

  it("écarte un film homonyme au profit de la série", () => {
    const tv: MalCandidate = { id: 1, title: "Gachiakuta", media_type: "tv" };
    const movie: MalCandidate = {
      id: 2,
      title: "Gachiakuta",
      media_type: "movie",
    };
    expect(matchCandidates(["Gachiakuta"], [movie, tv])).toEqual({
      status: "confirmed",
      malId: 1,
      method: "auto",
    });
  });

  it("aucun résultat : en attente, sans proposition", () => {
    expect(matchCandidates(["Titre inconnu"], [])).toEqual({
      status: "pending",
      candidates: [],
    });
  });
});
