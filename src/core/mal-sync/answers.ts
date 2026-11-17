// Application d'une réponse de l'utilisateur à l'état MAL d'une fiche. Fonction pure,
// utilisée localement et à la réception depuis un autre ordinateur.

import type { MalSyncState } from "../catalog/links";
import type { MalAnswer } from "../sync/operations";

export function applyMalAnswer(
  state: MalSyncState,
  answer: MalAnswer,
  at: number,
): MalSyncState {
  const next: MalSyncState = { ...state, updatedAt: at };
  if (answer.previousAnswer !== undefined) {
    next.previousAnswer = answer.previousAnswer;
    delete next.question;
  }
  if (answer.keepRemote) {
    next.lastSent = answer.keepRemote.remote;
    next.ignoreUntil = answer.keepRemote.ignoreUntil;
    delete next.conflict;
  }
  if (answer.resend) {
    next.lastSent = answer.resend.remote;
    delete next.ignoreUntil;
    delete next.conflict;
  }
  return next;
}
