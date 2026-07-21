const CHANGES_CDN = "https://cdn.changes.tg";
const MODELS_INDEX_URL = `${CHANGES_CDN}/gifts/models/`;

export type ChangesGiftModel = {
  modelName: string;
  displayName: string;
  collectionSlug: string;
  previewUrl: string;
};

let catalogCache: ChangesGiftModel[] | null = null;
let catalogPromise: Promise<ChangesGiftModel[]> | null = null;

/** collection_slug used in API/DB — lowercase alphanumeric from model title. */
export function modelNameToCollectionSlug(modelName: string): string {
  return modelName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Original model PNG on cdn.changes.tg (e.g. Bling Binky → …/Bling%20Binky/png/Original.png). */
export function changesGiftModelImageUrl(modelName: string): string {
  const encoded = modelName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${CHANGES_CDN}/gifts/models/${encoded}/png/Original.png`;
}

export function isChangesGiftImageUrl(url?: string): boolean {
  return Boolean(url?.includes("cdn.changes.tg/gifts/models/"));
}

/** Try to recover model folder name from a saved CDN image_url. */
export function modelNameFromChangesImageUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/gifts\/models\/([^/]+)\/png\/Original\.png/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function parseModelsFromIndexHtml(html: string): string[] {
  const names: string[] = [];
  const re = /href="\.\/([^"]+)\/"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (!raw || raw === "..") continue;
    try {
      names.push(decodeURIComponent(raw));
    } catch {
      names.push(raw);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function toCatalogEntry(modelName: string): ChangesGiftModel {
  return {
    modelName,
    displayName: modelName,
    collectionSlug: modelNameToCollectionSlug(modelName),
    previewUrl: changesGiftModelImageUrl(modelName),
  };
}

/** Fetch gift model catalog from cdn.changes.tg directory listing (cached). */
export async function fetchChangesGiftModels(): Promise<ChangesGiftModel[]> {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const res = await fetch(MODELS_INDEX_URL, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`Не удалось загрузить каталог подарков (${res.status})`);
      }
      const html = await res.text();
      const models = parseModelsFromIndexHtml(html);
      catalogCache = models.map(toCatalogEntry);
      return catalogCache;
    })().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
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
