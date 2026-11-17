import { describe, expect, it } from "vitest";
import { groupByAiring, type AnimeCardView } from "./library-view";

const card = (
  title: string,
  lastActivity: number,
  airing?: { year: number; season: string },
) =>
  ({
    id: title,
    title,
    lastActivity,
    catalog: {
      status: airing ? "confirmed" : "none",
      candidates: [],
      ...(airing && { airing }),
    },
  }) as unknown as AnimeCardView;

describe("regroupement par saison de diffusion", () => {
  it("la plus récente d’abord, inconnue en dernier, dernière lecture d’abord dans un groupe", () => {
    const groups = groupByAiring([
      card("A", 5, { year: 2026, season: "summer" }),
      card("B", 1, { year: 2026, season: "fall" }),
      card("C", 9),
      card("D", 7, { year: 2026, season: "fall" }),
      card("E", 3, { year: 2025, season: "fall" }),
      card("F", 2, { year: 2026, season: "winter" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Automne 2026",
      "Été 2026",
      "Hiver 2026",
      "Automne 2025",
      "Saison de diffusion inconnue",
    ]);
    expect(groups[0]!.animes.map((a) => a.title)).toEqual(["D", "B"]);
  });
});
