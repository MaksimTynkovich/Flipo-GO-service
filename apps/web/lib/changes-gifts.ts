const CHANGES_API = "https://api.changes.tg";
const CHANGES_CDN = "https://cdn.changes.tg";

export type ChangesGiftCollection = {
  name: string;
  collectionSlug: string;
  previewUrl: string;
};

export type ChangesGiftModelVariant = {
  name: string;
  rarityPermille?: number;
  previewUrl: string;
};

/** Selection from the gift picker: collection-only (random model) or collection+model. */
export type GiftPickerSelection = {
  collectionName: string;
  collectionSlug: string;
  /** Empty = any model from the collection */
  modelName: string;
  displayName: string;
  previewUrl: string;
};

/** @deprecated use GiftPickerSelection / ChangesGiftCollection */
export type ChangesGiftModel = {
  modelName: string;
  displayName: string;
  collectionSlug: string;
  previewUrl: string;
};

let collectionsCache: ChangesGiftCollection[] | null = null;
let collectionsPromise: Promise<ChangesGiftCollection[]> | null = null;
const modelsCache = new Map<string, ChangesGiftModelVariant[]>();
const modelsPromises = new Map<string, Promise<ChangesGiftModelVariant[]>>();

/** collection_slug used in API/DB — lowercase alphanumeric from gift title. */
export function giftNameToCollectionSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** @deprecated alias for giftNameToCollectionSlug */
export function modelNameToCollectionSlug(modelName: string): string {
  return giftNameToCollectionSlug(modelName);
}

export function changesGiftCollectionImageUrl(collectionName: string): string {
  return `${CHANGES_API}/original/${encodeURIComponent(collectionName)}.png?size=256`;
}

export function changesGiftModelVariantImageUrl(collectionName: string, modelName: string): string {
  return `${CHANGES_API}/model/${encodeURIComponent(collectionName)}/${encodeURIComponent(modelName)}.png?size=256`;
}

/** Original model PNG on cdn.changes.tg (legacy flat models folder). */
export function changesGiftModelImageUrl(modelName: string): string {
  const encoded = modelName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${CHANGES_CDN}/gifts/models/${encoded}/png/Original.png`;
}

export function isChangesGiftImageUrl(url?: string): boolean {
  return Boolean(
    url?.includes("cdn.changes.tg/gifts/models/") ||
      url?.includes("api.changes.tg/model/") ||
      url?.includes("api.changes.tg/original/"),
  );
}

/** Try to recover model folder name from a saved CDN image_url. */
export function modelNameFromChangesImageUrl(url?: string): string | null {
  if (!url) return null;
  const apiMatch = url.match(/\/model\/[^/]+\/([^/?#]+)/i);
  if (apiMatch?.[1]) {
    try {
      return decodeURIComponent(apiMatch[1]);
    } catch {
      return apiMatch[1];
    }
  }
  const match = url.match(/\/gifts\/models\/([^/]+)\/png\/Original\.png/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function toCollection(name: string): ChangesGiftCollection {
  const collectionSlug = giftNameToCollectionSlug(name);
  return {
    name,
    collectionSlug,
    previewUrl: changesGiftCollectionImageUrl(name),
  };
}

/** Fetch gift collections from api.changes.tg (cached). */
export async function fetchChangesGiftCollections(): Promise<ChangesGiftCollection[]> {
  if (collectionsCache) return collectionsCache;
  if (!collectionsPromise) {
    collectionsPromise = (async () => {
      const res = await fetch(`${CHANGES_API}/gifts`, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`Не удалось загрузить коллекции (${res.status})`);
      }
      const raw = (await res.json()) as unknown;
      if (!Array.isArray(raw)) {
        throw new Error("Некорректный ответ каталога коллекций");
      }
      const names = raw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      collectionsCache = names.map(toCollection);
      return collectionsCache;
    })().catch((err) => {
      collectionsPromise = null;
      throw err;
    });
  }
  return collectionsPromise;
}

type ChangesModelRow = { name?: string; rarityPermille?: number };

/** Fetch models for a collection (gift name as on changes.tg). */
export async function fetchChangesGiftModelsForCollection(
  collectionName: string,
): Promise<ChangesGiftModelVariant[]> {
  const key = collectionName.trim();
  if (!key) return [];
  const cached = modelsCache.get(key);
  if (cached) return cached;
  const existing = modelsPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(
      `${CHANGES_API}/models/${encodeURIComponent(key)}?sorted`,
      { cache: "force-cache" },
    );
    if (!res.ok) {
      throw new Error(`Не удалось загрузить модели (${res.status})`);
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) {
      throw new Error("Некорректный ответ каталога моделей");
    }
    const models: ChangesGiftModelVariant[] = [];
    for (const row of raw) {
      const name =
        typeof row === "string"
          ? row.trim()
          : typeof (row as ChangesModelRow)?.name === "string"
            ? String((row as ChangesModelRow).name).trim()
            : "";
      if (!name) continue;
      const rarity =
        typeof row === "object" && row && typeof (row as ChangesModelRow).rarityPermille === "number"
          ? (row as ChangesModelRow).rarityPermille
          : undefined;
      models.push({
        name,
        rarityPermille: rarity,
        previewUrl: changesGiftModelVariantImageUrl(key, name),
      });
    }
    modelsCache.set(key, models);
    return models;
  })().catch((err) => {
    modelsPromises.delete(key);
    throw err;
  });

  modelsPromises.set(key, promise);
  return promise;
}

export function filterByNameQuery<T extends { name?: string; displayName?: string; collectionSlug?: string }>(
  items: T[],
  query: string,
  extra?: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const slugQ = q.replace(/[^a-z0-9]/g, "");
  return items.filter((item) => {
    const name = (item.name || item.displayName || "").toLowerCase();
    const slug = (item.collectionSlug || "").toLowerCase();
    if (name.includes(q) || (slugQ && slug.includes(slugQ))) return true;
    if (extra && extra(item).toLowerCase().includes(q)) return true;
    return false;
  });
}

/** @deprecated prefer fetchChangesGiftCollections + models */
export async function fetchChangesGiftModels(): Promise<ChangesGiftModel[]> {
  const collections = await fetchChangesGiftCollections();
  return collections.map((c) => ({
    modelName: c.name,
    displayName: c.name,
    collectionSlug: c.collectionSlug,
    previewUrl: c.previewUrl,
  }));
}

export function filterChangesGiftModels(
  models: ChangesGiftModel[],
  query: string,
): ChangesGiftModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (m) =>
      m.modelName.toLowerCase().includes(q) ||
      m.collectionSlug.includes(q.replace(/[^a-z0-9]/g, "")),
  );
}
