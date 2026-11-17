// Règles de mise à jour de la liste MAL, validées par l'utilisateur
// (FONCTIONNALITES.md §8, ARCHITECTURE.md §10). Fonction pure.

export interface RemoteStatus {
  status?: string;
  num_episodes_watched?: number;
}

export interface LocalProgress {
  /** Numéros d'épisodes vus dans AnimeTrace pour cette fiche. */
  watched: number[];
  /** Total connu de la fiche MAL ; null si inconnu (MAL indique 0). */
  total: number | null;
  /** Dernier compteur envoyé par AnimeTrace, pour reconnaître une baisse manuelle sur MAL. */
  lastSent?: number;
  /** Réponse à « les épisodes précédents sont-ils vus ? » : true = oui, false = non. */
  previousAnswer?: boolean;
}

export type MalDecision =
  | { action: "none" }
  | {
      action: "update";
      fields: { num_watched_episodes?: number; status?: string };
    }
  | { action: "ask-previous"; from: number; to: number }
  | { action: "conflict"; remote: number; lastSent: number };

export function decideMalUpdate(
  remote: RemoteStatus | null,
  local: LocalProgress,
): MalDecision {
  const remoteCount = remote?.num_episodes_watched ?? 0;

  // Compteur baissé sur MAL après un envoi : choix volontaire probable, on attend l'utilisateur.
  if (local.lastSent !== undefined && remoteCount < local.lastSent) {
    return {
      action: "conflict",
      remote: remoteCount,
      lastSent: local.lastSent,
    };
  }

  const highest = local.watched.length ? Math.max(...local.watched) : 0;
  let target = remoteCount;
  if (highest > remoteCount) {
    // Le compteur MAL sert de point de départ ; les épisodes entre lui et le plus haut vu
    // doivent avoir été vus dans AnimeTrace, sinon on demande (épisode isolé).
    const seen = new Set(local.watched);
    const missing: number[] = [];
    for (let n = remoteCount + 1; n < highest; n++)
      if (!seen.has(n)) missing.push(n);
    if (missing.length && local.previousAnswer === undefined)
      return {
        action: "ask-previous",
        from: missing[0]!,
        to: missing[missing.length - 1]!,
      };
    // « Non » : on n'avance que jusqu'au dernier épisode vu d'affilée depuis le compteur MAL.
    if (missing.length && local.previousAnswer === false)
      target = missing[0]! - 1;
    else target = highest;
  }
  // Jamais de diminution automatique.
  target = Math.max(target, remoteCount);

  const fields: { num_watched_episodes?: number; status?: string } = {};
  if (target > remoteCount) fields.num_watched_episodes = target;
  // Terminé seulement si le total est connu et atteint ; sinon « En cours » dès qu'on avance.
  // « En pause » et « Abandonné » ne sont pas préservés ; la note n'est jamais modifiée.
  if (local.total && target >= local.total) {
    if (remote?.status !== "completed") fields.status = "completed";
  } else if (target > remoteCount && remote?.status !== "watching") {
    fields.status = "watching";
  }
  return Object.keys(fields).length
    ? { action: "update", fields }
    : { action: "none" };
}
