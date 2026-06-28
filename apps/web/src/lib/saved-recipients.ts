import { isAddress } from "viem";

const LEGACY_KEY = "cop_by_recent_recipients";
const STORAGE_KEY = "cop_by_saved_recipients";
export const MAX_SAVED_RECIPIENTS = 5;
const MAX_RECIPIENTS = MAX_SAVED_RECIPIENTS;

export type SavedRecipient = {
  address: string;
  alias: string;
  lastUsedAt: string;
};

function readStorage(): SavedRecipient[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return migrateLegacy();

      return parsed
        .filter(
          (item): item is SavedRecipient =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as SavedRecipient).address === "string" &&
            isAddress((item as SavedRecipient).address)
        )
        .map((item) => ({
          address: item.address.toLowerCase(),
          alias: typeof item.alias === "string" ? item.alias.trim().slice(0, 24) : "",
          lastUsedAt:
            typeof item.lastUsedAt === "string"
              ? item.lastUsedAt
              : new Date().toISOString(),
        }));
    }
  } catch {
    return migrateLegacy();
  }

  return migrateLegacy();
}

function migrateLegacy(): SavedRecipient[] {
  if (typeof window === "undefined") return [];

  try {
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(legacy)) return [];

    const migrated = legacy
      .filter((item): item is string => typeof item === "string" && isAddress(item))
      .map((address) => ({
        address: address.toLowerCase(),
        alias: "",
        lastUsedAt: new Date().toISOString(),
      }));

    if (migrated.length) {
      writeStorage(migrated);
      window.localStorage.removeItem(LEGACY_KEY);
    }

    return migrated;
  } catch {
    return [];
  }
}

function writeStorage(recipients: SavedRecipient[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipients));
}

export function getSavedRecipients() {
  return readStorage().sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
  );
}

export function getRecipientAlias(address: string) {
  const normalized = address.toLowerCase();
  return getSavedRecipients().find((item) => item.address === normalized)?.alias;
}

export function isRecipientSaved(address: string) {
  if (!isAddress(address)) return false;
  const normalized = address.toLowerCase();
  return getSavedRecipients().some((item) => item.address === normalized);
}

export type SaveRecipientResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "limit" };

export function saveSavedRecipient(input: {
  address: string;
  alias?: string;
}): SaveRecipientResult {
  if (typeof window === "undefined" || !isAddress(input.address)) {
    return { ok: false, reason: "invalid" };
  }

  const normalized = input.address.toLowerCase();
  const alias =
    typeof input.alias === "string" ? input.alias.trim().slice(0, 24) : "";
  const current = getSavedRecipients();
  const previous = current.find((item) => item.address === normalized);
  const existing = current.filter((item) => item.address !== normalized);

  if (!previous && existing.length >= MAX_RECIPIENTS) {
    return { ok: false, reason: "limit" };
  }

  const next: SavedRecipient[] = [
    {
      address: normalized,
      alias: alias || previous?.alias || "",
      lastUsedAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, MAX_RECIPIENTS);

  writeStorage(next);
  return { ok: true };
}

export function removeSavedRecipient(address: string) {
  if (typeof window === "undefined" || !isAddress(address)) return;
  const normalized = address.toLowerCase();
  writeStorage(getSavedRecipients().filter((item) => item.address !== normalized));
}
