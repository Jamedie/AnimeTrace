// Identifiants déterministes (UUID v5) : deux ordinateurs qui migrent les mêmes
// entrées obtiennent les mêmes identifiants (MODELE-DONNEES.md §5, étape 4).

/** Espace de noms fixe des identifiants AnimeTrace. Ne jamais le modifier. */
export const LEGACY_MIGRATION_NAMESPACE =
  "6f1c2a3e-7b4d-5e8f-9a0b-1c2d3e4f5a6b";

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function uuidV5(
  name: string,
  namespace = LEGACY_MIGRATION_NAMESPACE,
): Promise<string> {
  const ns = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + nameBytes.length);
  data.set(ns);
  data.set(nameBytes, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(
    0,
    16,
  );
  hash[6] = (hash[6]! & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8]! & 0x3f) | 0x80; // variante RFC 4122
  return bytesToUuid(hash);
}
