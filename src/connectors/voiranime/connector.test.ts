// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { voiranime } from "./connector";
import { detectSite, observeEpisode } from "../index";

function page(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
const episodeHtml = readFileSync(
  "src/connectors/voiranime/fixtures/episode.html",
  "utf8",
);

describe("connecteur Voiranime", () => {
  it("extrait l’épisode d’une page enregistrée", () => {
    const url = new URL(
      "https://voiranime.cx/anime/solo-leveling/solo-leveling-03-vostfr/",
    );
    expect(voiranime.extractEpisode(page(episodeHtml), url)).toEqual({
      site: "voiranime",
      contentKey: "solo-leveling",
      title: "Solo Leveling",
      number: 3,
      language: "VOSTFR",
      url: url.href,
    });
  });

  it("reconnaît le même contenu sur un nouveau domaine", () => {
    const html = episodeHtml.replaceAll("voiranime.cx", "voiranime.to");
    const obs = observeEpisode(
      page(html),
      new URL("https://voiranime.to/anime/solo-leveling/solo-leveling-03-vf/"),
    );
    expect(obs).toMatchObject({
      contentKey: "solo-leveling",
      number: 3,
      language: "VF",
      title: "Solo Leveling",
    });
  });

  it("construit l’adresse de l’épisode suivant sur le domaine le plus récent", () => {
    expect(
      voiranime.episodeUrl(
        "https://voiranime.to/anime/solo-leveling/solo-leveling-03-vostfr/",
        4,
      ),
    ).toBe("https://voiranime.to/anime/solo-leveling/solo-leveling-04-vostfr/");
    expect(
      voiranime.episodeUrl("https://voiranime.to/anime/x/x-9-vf/", 10),
    ).toBe("https://voiranime.to/anime/x/x-10-vf/");
    expect(voiranime.episodeUrl("https://voiranime.to/", 2)).toBeNull();
  });

  it("se rabat sur le slug sans lien de titre", () => {
    const obs = voiranime.extractEpisode(
      page("<p></p>"),
      new URL("https://x.test/anime/dandadan/dandadan-04-vostfr"),
    );
    expect(obs?.title).toBe("dandadan");
  });

  it("ignore les pages qui ne sont pas des épisodes", () => {
    expect(
      voiranime.extractEpisode(
        page("<p></p>"),
        new URL("https://voiranime.cx/anime/solo-leveling/"),
      ),
    ).toBeNull();
    expect(
      voiranime.extractEpisode(
        page("<p></p>"),
        new URL("https://voiranime.cx/"),
      ),
    ).toBeNull();
  });

  it("détecte une fiche anime à la structure Voiranime sur une adresse inconnue", () => {
    const html =
      '<a href="/anime/solo-leveling/solo-leveling-01-vostfr/">Ép. 1</a>';
    expect(
      detectSite(
        page(html),
        new URL("https://nouvelle-adresse.example/anime/solo-leveling/"),
      )?.id,
    ).toBe("voiranime");
  });

  it("ne reconnaît pas un site d’une autre structure", () => {
    expect(
      detectSite(
        page('<a href="/watch?v=1">vidéo</a>'),
        new URL("https://youtube.com/watch?v=1"),
      ),
    ).toBeNull();
  });
});
