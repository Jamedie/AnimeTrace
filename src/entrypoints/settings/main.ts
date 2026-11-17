// Réglages : compte cloud, transition depuis la 0.3.6, domaines activés.
// MAL, sauvegarde (export / import).

import { browser } from "wxt/browser";
import "../../ui/theme.css";
import "./settings.css";
import { button, h, logo, relativeTime } from "../../ui/components";
import type { CloudStatus } from "../../adapters/supabase/sync";
import type { ActivatedDomain } from "../../core/domains/origins";
import type {
  BackupRequest,
  CloudRequest,
  MalRequest,
  Reply,
} from "../../shared/messages";
import type { MalStatus } from "../../adapters/mal/sync";
import { MAL_ORIGINS } from "../../adapters/mal/client";
import type { ExportFile } from "../../core/backup/legacy-export";
import type { ImportReport } from "../../adapters/storage/backup-store";

let cloud: CloudStatus | null = null;
let domains: ActivatedDomain[] = [];
let error = "";
let busy = false;
let malStatus: MalStatus | null = null;
let malError = "";

async function ask(request: CloudRequest): Promise<void> {
  busy = true;
  error = "";
  render();
  const reply = (await browser.runtime.sendMessage(
    request,
  )) as Reply<CloudStatus> | null;
  busy = false;
  if (reply?.ok) cloud = reply.value;
  else error = reply?.error ?? "Le service worker ne répond pas.";
  render();
}

function stateBadge(s: CloudStatus): HTMLElement {
  if (s.error)
    return h("span", { class: "state", "data-s": "error" }, h("i"), s.error);
  if (!s.signedIn)
    return h(
      "span",
      { class: "state" },
      h("i"),
      s.configured ? "Non connecté" : "Non configuré",
    );
  if (s.pending)
    return h(
      "span",
      { class: "state", "data-s": "pending" },
      h("i"),
      `${s.pending} en attente`,
    );
  return h(
    "span",
    { class: "state", "data-s": "ok" },
    h("i"),
    s.lastSuccess ? `À jour · ${relativeTime(s.lastSuccess)}` : "Connecté",
  );
}

function configForm(): HTMLElement {
  const url = h("input", {
    name: "url",
    type: "url",
    placeholder: "https://xxxx.supabase.co",
    required: "",
    autocomplete: "off",
  });
  const key = h("input", {
    name: "key",
    placeholder: "sb_publishable_…",
    required: "",
    autocomplete: "off",
  });
  const form = h(
    "form",
    {},
    h("label", {}, "Adresse du projet Supabase", url),
    h("label", {}, "Clé publique (Publishable key)", key),
    h("div", { class: "btns" }, submit("Enregistrer")),
    h(
      "p",
      { class: "fine" },
      "Uniquement la clé publique sb_publishable_. Ne saisis jamais de clé secrète ni de mot de passe de base de données.",
    ),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void ask({ type: "cloud.configure", url: url.value, key: key.value });
  });
  return form;
}

function loginForm(): HTMLElement {
  const email = h("input", {
    name: "email",
    type: "email",
    required: "",
    autocomplete: "username",
  });
  const password = h("input", {
    name: "password",
    type: "password",
    required: "",
    autocomplete: "current-password",
  });
  const form = h(
    "form",
    {},
    h("label", {}, "E-mail", email),
    h("label", {}, "Mot de passe", password),
    h("div", { class: "btns" }, submit("Se connecter et synchroniser")),
    h(
      "p",
      { class: "fine" },
      "Le mot de passe n’est pas conservé : seule la session reste sur cet ordinateur.",
    ),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pwd = password.value;
    password.value = "";
    void ask({ type: "cloud.signIn", email: email.value, password: pwd });
  });
  return form;
}

function submit(label: string): HTMLButtonElement {
  const b = h(
    "button",
    { class: "btn", type: "submit" },
    busy ? "Patiente…" : label,
  );
  b.disabled = busy;
  return b;
}

function cloudBox(s: CloudStatus): HTMLElement {
  const box = h(
    "section",
    { class: "box", id: "cloud" },
    h(
      "div",
      { class: "box-head" },
      h(
        "div",
        {},
        h("h2", {}, "Cloud AnimeTrace"),
        h("p", {}, "Retrouve ton historique sur tous tes ordinateurs."),
      ),
      stateBadge(s),
    ),
  );
  if (!s.configured) box.append(configForm());
  else if (!s.signedIn) box.append(loginForm());
  else {
    box.append(
      h(
        "dl",
        { class: "rows" },
        h("dt", {}, "Compte"),
        h("dd", {}, s.email ?? "—"),
        h("dt", {}, "Synchronisation"),
        h(
          "dd",
          {},
          "Chaque minute quand Brave est ouvert, et après chaque lecture",
        ),
        h("dt", {}, "En attente d’envoi"),
        h("dd", {}, String(s.pending)),
      ),
      h(
        "div",
        { class: "btns" },
        button(
          busy ? "Patiente…" : "Synchroniser maintenant",
          "ghost",
          busy ? undefined : () => void ask({ type: "cloud.sync" }),
        ),
        button(
          "Se déconnecter",
          "text",
          busy ? undefined : () => void ask({ type: "cloud.signOut" }),
        ),
      ),
    );
  }
  if (error) box.append(h("p", { class: "error", role: "alert" }, error));
  return box;
}

function transitionBanner(s: CloudStatus): HTMLElement | null {
  if (!s.signedIn || s.legacy.closed) return null;
  const close = button("Clore la transition", "ghost", () => {
    if (
      confirm(
        "Clore la transition ? L’historique 0.3.6 du cloud ne sera plus importé. Fais-le une fois tous tes ordinateurs passés en V1.",
      )
    )
      void ask({ type: "legacy.close" });
  });
  return h(
    "div",
    { class: "banner" },
    h(
      "span",
      {},
      h("b", {}, "Transition depuis la 0.3.6 en cours. "),
      `L’ancien historique du cloud est importé régulièrement, en lecture seule${s.legacy.versions !== undefined ? ` (${s.legacy.versions} épisodes lus la dernière fois)` : ""}. Clos-la quand tous tes ordinateurs sont en V1.`,
    ),
    close,
  );
}

function domainsBox(): HTMLElement {
  const sites = domains.filter((d) => d.kind === "site");
  const players = domains.filter((d) => d.kind === "player");
  return h(
    "section",
    { class: "box", id: "domaines" },
    h("h2", {}, "Domaines activés"),
    h(
      "p",
      {},
      "Ajoute un domaine en cliquant sur l’icône d’AnimeTrace depuis la nouvelle adresse. Voiranime (voiranime.cx) et ses lecteurs d’origine sont inclus d’office.",
    ),
    h(
      "div",
      { class: "domains" },
      h(
        "div",
        { class: "domain" },
        h("b", {}, "Sites"),
        h(
          "span",
          {},
          h("span", { class: "mono" }, "voiranime.cx"),
          h("span", { class: "tag" }, "inclus"),
          ...sites.map((d) =>
            h("span", {}, " · ", h("span", { class: "mono" }, d.host)),
          ),
        ),
      ),
      h(
        "div",
        { class: "domain" },
        h("b", {}, "Lecteurs"),
        h(
          "span",
          { class: "mono" },
          players.length
            ? players.map((d) => d.host).join(" · ")
            : "aucun ajouté",
        ),
      ),
    ),
  );
}

function render() {
  const app = document.getElementById("app")!;
  if (!cloud) return;
  app.replaceChildren(
    h(
      "div",
      { class: "page" },
      h(
        "header",
        { class: "top" },
        logo(),
        h(
          "a",
          { class: "back", href: browser.runtime.getURL("/library.html") },
          "← Ma bibliothèque",
        ),
      ),
      h(
        "div",
        { class: "layout" },
        h(
          "nav",
          {},
          h("h1", {}, "Réglages"),
          h(
            "div",
            { class: "nav" },
            h("a", { href: "#cloud" }, "Synchronisation"),
            h("a", { href: "#mal" }, "MyAnimeList"),
            h("a", { href: "#sauvegarde" }, "Sauvegarde"),
            h("a", { href: "#domaines" }, "Domaines activés"),
            h(
              "a",
              { class: "version", href: "#" },
              `À propos · v${browser.runtime.getManifest().version}`,
            ),
          ),
        ),
        h(
          "div",
          { class: "sections" },
          transitionBanner(cloud) ?? "",
          cloudBox(cloud),
          malBox(),
          backupBox(),
          domainsBox(),
        ),
      ),
    ),
  );
}

async function load() {
  const reply = (await browser.runtime.sendMessage({
    type: "cloud.status",
  })) as Reply<CloudStatus> | null;
  if (!reply?.ok)
    throw new Error(reply?.error ?? "Le service worker ne répond pas.");
  cloud = reply.value;
  malStatus = await askMalValue({ type: "mal.status" }).catch(() => null);
  domains =
    ((await browser.runtime.sendMessage({ type: "domains.list" })) as
      | ActivatedDomain[]
      | null) ?? [];
  render();
}

load().catch((e) => {
  document
    .getElementById("app")!
    .replaceChildren(
      h(
        "p",
        { class: "page" },
        `Impossible de charger les réglages : ${String(e)}`,
      ),
    );
});

async function askMalValue(request: MalRequest): Promise<MalStatus> {
  const reply = (await browser.runtime.sendMessage(
    request,
  )) as Reply<MalStatus> | null;
  if (!reply?.ok)
    throw new Error(reply?.error ?? "Le service worker ne répond pas.");
  return reply.value;
}

async function malAction(request: MalRequest) {
  busy = true;
  malError = "";
  render();
  try {
    malStatus = await askMalValue(request);
  } catch (e) {
    malError = e instanceof Error ? e.message : String(e);
  }
  busy = false;
  render();
}

/**
 * Active MAL : Brave demande l'accès à MyAnimeList (et, pour le compte, l'autorisation de connexion).
 * La demande doit partir directement du clic.
 */
function enableMal(withAccount: boolean) {
  void browser.permissions
    .request({
      origins: MAL_ORIGINS,
      ...(withAccount && { permissions: ["identity"] }),
    })
    .then((ok) => {
      if (!ok) {
        malError = "Brave n’a pas donné l’accès à MyAnimeList.";
        render();
        return;
      }
      void malAction(
        withAccount ? { type: "mal.connect" } : { type: "mal.run" },
      );
    });
}

function malBox(): HTMLElement {
  const s = malStatus;
  const box = h("section", { class: "box", id: "mal" });
  const head = (badge: HTMLElement | null) =>
    h(
      "div",
      { class: "box-head" },
      h(
        "div",
        {},
        h("h2", {}, "MyAnimeList", h("small", {}, "facultatif")),
        h(
          "p",
          {},
          "Affiches, saisons et total d’épisodes ; et, si tu connectes ton compte, ta liste MAL mise à jour toute seule. Ta note n’est jamais modifiée.",
        ),
      ),
      badge,
    );
  if (!s) {
    box.append(head(null), h("p", { class: "fine" }, "État MAL indisponible."));
    return box;
  }

  if (!s.connected) {
    const badge = s.needsReconnect
      ? h(
          "span",
          { class: "state", "data-s": "error" },
          h("i"),
          "Reconnexion nécessaire",
        )
      : h(
          "span",
          { class: "state" },
          h("i"),
          s.enabled ? "Catalogue actif · compte non connecté" : "Non activé",
        );
    box.append(
      head(badge),
      h(
        "ul",
        { class: "fine" },
        h(
          "li",
          {},
          "Seuls le nombre d’épisodes vus et le statut sont envoyés ; le compteur n’est jamais baissé.",
        ),
        h(
          "li",
          {},
          "La connexion se fait sur la page officielle de MAL ; ton mot de passe n’est jamais saisi ici.",
        ),
      ),
      h(
        "div",
        { class: "btns" },
        button(
          busy
            ? "Patiente…"
            : s.needsReconnect
              ? "Se reconnecter ↗"
              : "Connecter MAL ↗",
          "primary",
          busy ? undefined : () => enableMal(true),
        ),
        !s.enabled
          ? button(
              "Activer seulement le catalogue",
              "text",
              busy ? undefined : () => enableMal(false),
            )
          : null,
      ),
    );
  } else {
    const pending = s.questions + s.conflicts;
    box.append(
      head(
        h(
          "span",
          { class: "state", "data-s": pending ? "pending" : "ok" },
          h("i"),
          pending
            ? `${pending} point${pending > 1 ? "s" : ""} à vérifier`
            : "Connecté",
        ),
      ),
      h(
        "dl",
        { class: "rows" },
        h("dt", {}, "Compte MAL"),
        h("dd", {}, s.userName ?? "—"),
        h("dt", {}, "Dernier envoi"),
        h(
          "dd",
          {},
          s.lastSent
            ? `${s.lastSent.title} → ${s.lastSent.count} · ${relativeTime(s.lastSent.at)}`
            : "—",
        ),
        h("dt", {}, "Fiches à confirmer"),
        h("dd", {}, String(s.pendingLinks)),
        h("dt", {}, "Questions / conflits"),
        h("dd", {}, `${s.questions} / ${s.conflicts}`),
      ),
      h(
        "div",
        { class: "btns" },
        button(
          busy ? "Patiente…" : "Mettre à jour maintenant",
          "ghost",
          busy ? undefined : () => void malAction({ type: "mal.run" }),
        ),
        button(
          "Déconnecter MAL",
          "text",
          busy ? undefined : () => void malAction({ type: "mal.disconnect" }),
        ),
      ),
      h(
        "p",
        { class: "fine" },
        "Après déconnexion, les mises à jour en attente sont conservées.",
      ),
    );
  }
  if (s.error) box.append(h("p", { class: "error" }, s.error));
  if (malError) box.append(h("p", { class: "error", role: "alert" }, malError));
  return box;
}

// ── Sauvegarde ───────────────────────────────────────────────────────────────

let backupMessage = "";
let backupError = "";

async function askBackup<T>(request: BackupRequest): Promise<T> {
  const reply = (await browser.runtime.sendMessage(request)) as Reply<T> | null;
  if (!reply?.ok)
    throw new Error(reply?.error ?? "Le service worker ne répond pas.");
  return reply.value;
}

/** Enregistre le fichier dans Téléchargements (aucune permission nécessaire). */
function download(file: ExportFile) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: "application/json" }),
  );
  const a = h("a", { href: url, download: file.filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function backupAction(run: () => Promise<string>) {
  busy = true;
  backupMessage = "";
  backupError = "";
  render();
  try {
    backupMessage = await run();
  } catch (e) {
    backupError = e instanceof Error ? e.message : String(e);
  }
  busy = false;
  render();
}

function importSummary(r: ImportReport): string {
  const parts = [
    `${r.added} épisode${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""}`,
    `${r.updated} complété${r.updated > 1 ? "s" : ""}`,
    `${r.unchanged} déjà à jour`,
  ];
  if (r.links)
    parts.push(`${r.links} association${r.links > 1 ? "s" : ""} MAL`);
  return `Import ${r.kind === "legacy" ? "de la sauvegarde 0.3.6" : "terminé"} : ${parts.join(" · ")}.${cloud?.signedIn && (r.added || r.updated) ? " Les nouveautés partent vers tes autres ordinateurs." : ""}`;
}

function backupBox(): HTMLElement {
  const input = h("input", {
    type: "file",
    accept: ".json,application/json",
    hidden: "",
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    void backupAction(async () => {
      if (file.size > 20 * 1024 * 1024)
        throw new Error(
          "Fichier trop volumineux pour une sauvegarde AnimeTrace.",
        );
      return importSummary(
        await askBackup<ImportReport>({
          type: "backup.import",
          content: await file.text(),
        }),
      );
    });
  });
  const box = h(
    "section",
    { class: "box", id: "sauvegarde" },
    h(
      "div",
      {},
      h("h2", {}, "Sauvegarde"),
      h(
        "p",
        {},
        "Un fichier avec tout ton historique, à garder de côté ou à importer sur un autre ordinateur.",
      ),
    ),
    h(
      "div",
      { class: "btns" },
      button(
        busy ? "Patiente…" : "Exporter mon historique",
        "ghost",
        busy
          ? undefined
          : () =>
              void backupAction(async () => {
                const file = await askBackup<ExportFile>({
                  type: "backup.export",
                });
                download(file);
                return `Fichier ${file.filename} enregistré dans tes téléchargements.`;
              }),
      ),
      button(
        "Importer un fichier…",
        "ghost",
        busy ? undefined : () => input.click(),
      ),
      button(
        "Exporter la copie 0.3.6",
        "text",
        busy
          ? undefined
          : () =>
              void backupAction(async () => {
                const file = await askBackup<ExportFile>({
                  type: "backup.exportLegacy",
                });
                download(file);
                return `Copie intacte de la 0.3.6 enregistrée (${file.filename}).`;
              }),
      ),
      input,
    ),
    h(
      "ul",
      { class: "fine" },
      h(
        "li",
        {},
        "L’import n’efface rien : un épisode vu reste vu, la progression la plus récente est gardée.",
      ),
      h("li", {}, "Les fichiers exportés par la 0.3.6 sont acceptés."),
      h("li", {}, "Le fichier ne contient ni mot de passe ni session."),
    ),
  );
  if (backupMessage)
    box.append(h("p", { class: "fine", role: "status" }, backupMessage));
  if (backupError)
    box.append(h("p", { class: "error", role: "alert" }, backupError));
  return box;
}
