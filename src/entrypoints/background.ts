// Service worker : point d'entrée du cœur (ARCHITECTURE.md §2).
// Seul endroit qui écrit l'historique ; les scripts lui envoient des messages.

import { browser } from "wxt/browser";
import type { EpisodeObservation } from "../connectors/types";
import type { ProgressReport } from "../core/history/playback";
import { runLegacyMigration } from "../core/backup/migration";
import {
  listDomains,
  openDatabase,
  readLibrary,
  recordDomainActivated,
  type Database,
} from "../adapters/storage/database";
import { createMigrationPorts } from "../adapters/storage/migration-ports";
import {
  recordOpened,
  recordProgress,
} from "../adapters/storage/history-store";
import { syncContentScripts } from "../adapters/browser/content-scripts";
import { currentEpisodeView, recentAnimes } from "../core/history/views";
import {
  originPattern,
  playerHosts,
  redirectedPlayerHosts,
} from "../core/domains/origins";
import { createOperation } from "../core/sync/operations";
import { connectors, findConnector } from "../connectors";
import type {
  BackupRequest,
  CloudRequest,
  CoverInfo,
  LibraryState,
  MalRequest,
  PageRequest,
  PopupState,
} from "../shared/messages";
import * as malSync from "../adapters/mal/sync";
import {
  answerMal,
  readCatalog,
  saveLink,
} from "../adapters/storage/catalog-store";
import * as cloudSync from "../adapters/supabase/sync";
import { libraryView } from "../core/history/library-view";
import { buildBackupFile, parseBackupFile } from "../core/backup/backup-file";
import { buildLegacyExportFile } from "../core/backup/legacy-export";
import {
  importBackup,
  latestLegacyBackup,
  readBackupData,
} from "../adapters/storage/backup-store";

type Message =
  | { type: "episode"; observation: EpisodeObservation }
  | { type: "progress"; report: ProgressReport }
  | { type: "players"; srcs: string[] }
  | { type: "probe.result" }
  | PageRequest
  | CloudRequest
  | MalRequest
  | BackupRequest;

interface TabBinding {
  versionId: string;
  site: string;
  url?: string;
}

async function isGranted(host: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [originPattern(host)] });
}

/**
 * Domaines réellement chargés dans les cadres de l'onglet. Révèle les lecteurs qui redirigent
 * (VOE : voe.sx → adresse changeante). Nécessite l'autorisation facultative « webNavigation ».
 */
async function frameHosts(
  tabId: number,
  playerSrcs: string[],
  pageHost: string,
): Promise<string[]> {
  if (!(await browser.permissions.contains({ permissions: ["webNavigation"] })))
    return [];
  const frames = (await browser.webNavigation.getAllFrames({ tabId })) ?? [];
  return redirectedPlayerHosts(
    frames.map((f) => f.url),
    playerSrcs,
    pageHost,
  );
}

async function notGranted(hosts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const host of hosts) if (!(await isGranted(host))) out.push(host);
  return out;
}

/** État de la fenêtre de l'icône pour l'onglet actif. */
async function popupState(
  db: Database,
  tabId: number | null,
): Promise<PopupState> {
  const lib = await readLibrary(db);
  const session =
    tabId === null
      ? {}
      : await browser.storage.session.get([`tab:${tabId}`, `players:${tabId}`]);
  const binding = session[`tab:${tabId}`] as TabBinding | undefined;
  const pageHost = binding?.url ? new URL(binding.url).hostname : "";
  const playerSrcs =
    (session[`players:${tabId}`] as string[] | undefined) ?? [];
  const pagePlayers = [
    ...playerHosts(playerSrcs, pageHost),
    ...(binding && tabId !== null
      ? await frameHosts(tabId, playerSrcs, pageHost)
      : []),
  ];
  const nextUrl = (url: string | undefined, n: number) => {
    if (!url) return null;
    for (const c of connectors) {
      const next = c.episodeUrl(url, n);
      if (next) return next;
    }
    return null;
  };
  const blockedPlayers = binding
    ? await notGranted([...new Set(pagePlayers)])
    : [];
  // Si un lecteur bloque, on propose aussi les autres lecteurs connus du site : une seule confirmation.
  const known = binding
    ? (findConnector(binding.site)?.playerDomains ?? [])
    : [];
  const suggestedPlayers = blockedPlayers.length
    ? await notGranted(known.filter((h) => !blockedPlayers.includes(h)))
    : [];
  const cards = new Map(
    libraryView(lib, await readCatalog(db)).animes.map((a) => [a.id, a]),
  );
  const cover = (animeId: string): CoverInfo => {
    const a = cards.get(animeId);
    return {
      total: a?.total ?? null,
      ...(a?.catalog.picture && { picture: a.catalog.picture }),
      ...(a && { seasonNumber: a.seasonNumber }),
    };
  };
  const current = binding ? currentEpisodeView(lib, binding.versionId) : null;
  return {
    current: current ? { ...current, ...cover(current.animeId) } : null,
    recent: recentAnimes(lib).map((r) => ({
      ...r,
      ...cover(r.animeId),
      nextUrl: nextUrl(r.lastUrl, r.nextNumber),
    })),
    blockedPlayers,
    suggestedPlayers,
    framesVisible: await browser.permissions.contains({
      permissions: ["webNavigation"],
    }),
  };
}

/** Bibliothèque complète, avec l'adresse de reprise de chaque anime. */
async function libraryState(db: Database): Promise<LibraryState> {
  const view = libraryView(await readLibrary(db), await readCatalog(db));
  const resumeUrls: Record<string, string | null> = {};
  for (const a of view.animes)
    resumeUrls[a.id] = a.resume?.knownUrl
      ? episodeUrl(a.resume.knownUrl, a.resume.number)
      : null;
  return { ...view, resumeUrls };
}

function episodeUrl(knownUrl: string, n: number): string | null {
  for (const c of connectors) {
    const next = c.episodeUrl(knownUrl, n);
    if (next) return next;
  }
  return null;
}

/** Identifiant stable de cet ordinateur, pour le journal de synchronisation. */
async function getDeviceId(): Promise<string> {
  const { deviceId } = await browser.storage.local.get("deviceId");
  if (typeof deviceId === "string") return deviceId;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ deviceId: id });
  return id;
}

async function start() {
  const db = await openDatabase();
  const record = await runLegacyMigration(createMigrationPorts(db));
  console.info(
    "AnimeTrace : migration 0.3.6 →",
    record.status,
    record.report?.counts ?? record.error ?? "",
  );
  await syncContentScripts();
  return { db, deviceId: await getDeviceId() };
}

let scheduleSync: () => void = () => {};

export default defineBackground(() => {
  const ready = start();
  ready.catch((error) =>
    console.error("AnimeTrace : démarrage impossible", error),
  );
  // Les messages sont traités un par un, dans l'ordre d'arrivée.
  let queue: Promise<unknown> = Promise.resolve();

  browser.runtime.onMessage.addListener(
    (message: Message, sender, sendResponse) => {
      // Demandes des pages de l'extension (fenêtre de l'icône, bibliothèque…).
      // sendResponse + « return true » : compatible avec toutes les versions de Chromium.
      if (message.type.startsWith("mal.")) {
        const m = message as MalRequest;
        void ready
          .then(async ({ db, deviceId }): Promise<unknown> => {
            if (m.type === "mal.status") return malSync.status(db);
            if (m.type === "mal.connect") {
              const s = await malSync.connect(db);
              void malSync.runMal(db, deviceId);
              return s;
            }
            if (m.type === "mal.disconnect") return malSync.disconnect(db);
            if (m.type === "mal.search") return malSync.search(db, m.query);
            if (m.type === "mal.choose") {
              await saveLink(
                db,
                m.malId === null
                  ? {
                      seasonId: m.seasonId,
                      status: "rejected",
                      method: "user",
                      at: Date.now(),
                    }
                  : {
                      seasonId: m.seasonId,
                      status: "confirmed",
                      malId: m.malId,
                      method: "user",
                      at: Date.now(),
                    },
                deviceId,
              );
              void malSync.runMal(db, deviceId);
              return true;
            }
            if (m.type === "mal.answer") {
              await answerMal(db, m.malId, m.answer, deviceId);
              void malSync.runMal(db, deviceId);
              return true;
            }
            await malSync.runMal(db, deviceId);
            return malSync.status(db);
          })
          .then(
            (value) => sendResponse({ ok: true, value }),
            (error) =>
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
          );
        return true;
      }
      if (
        message.type.startsWith("cloud.") ||
        message.type === "legacy.close"
      ) {
        // Le cloud ne passe pas par la file : une synchronisation ne bloque pas l'enregistrement des lectures.
        const m = message as CloudRequest;
        void ready
          .then(async ({ db }): Promise<unknown> => {
            if (m.type === "cloud.status") return cloudSync.status(db);
            if (m.type === "cloud.configure") {
              await cloudSync.configure({ url: m.url, key: m.key });
              return cloudSync.status(db);
            }
            if (m.type === "cloud.signIn")
              return cloudSync.signIn(db, m.email, m.password);
            if (m.type === "cloud.signOut") return cloudSync.signOut(db);
            if (m.type === "legacy.close")
              return cloudSync.closeLegacyTransition(db);
            return cloudSync.syncNow(db);
          })
          .then(
            (value) => sendResponse({ ok: true, value }),
            (error) =>
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
          );
        return true;
      }
      if (message.type.startsWith("backup.")) {
        const m = message as BackupRequest;
        // Dans la file : l'import ne croise pas l'enregistrement d'une lecture.
        const task = queue.then(async (): Promise<unknown> => {
          const { db, deviceId } = await ready;
          if (m.type === "backup.export") {
            const d = await readBackupData(db);
            return buildBackupFile(d.library, d.links, Date.now());
          }
          if (m.type === "backup.exportLegacy") {
            const b = await latestLegacyBackup(db);
            if (!b) throw new Error("Aucune copie 0.3.6 sur cet ordinateur.");
            return buildLegacyExportFile(b.history, b.at);
          }
          const report = await importBackup(
            db,
            await parseBackupFile(m.content),
            deviceId,
            Date.now(),
          );
          scheduleSync();
          return report;
        });
        queue = task.catch(() => {});
        task.then(
          (value) => sendResponse({ ok: true, value }),
          (error) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
        );
        return true;
      }
      if (
        message.type === "popup.state" ||
        message.type === "library.state" ||
        message.type === "domains.list" ||
        message.type === "domains.activated"
      ) {
        const task = queue.then(async () => {
          const { db, deviceId } = await ready;
          if (message.type === "popup.state")
            return popupState(db, message.tabId);
          if (message.type === "library.state") return libraryState(db);
          if (message.type === "domains.list") return listDomains(db);
          for (const d of message.hosts) {
            const domain = { ...d, activatedAt: Date.now() };
            await recordDomainActivated(
              db,
              domain,
              createOperation(
                { type: "domain.activated", payload: domain },
                deviceId,
                domain.activatedAt,
              ),
            );
          }
          await syncContentScripts();
          return { ok: true };
        });
        queue = task.catch(() => {});
        task.then(sendResponse, (error) => {
          console.error("AnimeTrace : demande non traitée", error);
          sendResponse(null);
        });
        return true;
      }
      if (message.type === "probe.result") return; // destiné à la fenêtre de l'icône

      const tabId = sender.tab?.id;
      if (tabId === undefined || !sender.url) return;
      const tabKey = `tab:${tabId}`;
      queue = queue
        .then(async () => {
          const { db, deviceId } = await ready;
          if (message.type === "episode" && sender.frameId === 0) {
            const version = await recordOpened(
              db,
              message.observation,
              deviceId,
              Date.now(),
            );
            // Associe l'onglet à cette version pour les rapports du lecteur.
            const binding: TabBinding = {
              versionId: version.id,
              site: message.observation.site,
              url: sender.tab?.url,
            };
            await browser.storage.session.set({ [tabKey]: binding });
          } else if (message.type === "players" && sender.frameId === 0) {
            await browser.storage.session.set({
              [`players:${tabId}`]: message.srcs,
            });
          } else if (message.type === "progress") {
            const binding = (await browser.storage.session.get(tabKey))[
              tabKey
            ] as TabBinding | undefined;
            if (!binding || binding.url !== sender.tab?.url) return;
            await recordProgress(
              db,
              binding.versionId,
              message.report,
              deviceId,
              Date.now(),
            );
          }
          scheduleSync();
        })
        .catch((error) =>
          console.error("AnimeTrace : message non traité", error),
        );
    },
  );

  // Synchronisation : chaque minute, et quelques secondes après une lecture enregistrée.
  void browser.alarms.create("cloud-sync", { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "cloud-sync")
      void ready.then(async ({ db, deviceId }) => {
        await cloudSync.syncNow(db);
        await malSync.runMal(db, deviceId);
      });
  });
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  scheduleSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(
      () => void ready.then(({ db }) => cloudSync.syncNow(db)),
      5000,
    );
  };

  browser.tabs.onRemoved.addListener(
    (id) => void browser.storage.session.remove([`tab:${id}`, `players:${id}`]),
  );
  // Nouveau domaine accordé ou retiré : les scripts suivent.
  browser.permissions.onAdded.addListener(() => void syncContentScripts());
  browser.permissions.onRemoved.addListener(() => void syncContentScripts());
});
