// DS-BOX — Persistência das ISOs criadas (IndexedDB).
// "Faça que salva as isos criadas": toda ISO compilada é gravada em IndexedDB
// (bytes completos + kernel/initrd embutidos) e a prateleira é restaurada no
// boot do app — nada se perde ao recarregar. IndexedDB aguenta megabytes
// (localStorage não: 5 MB e sem blobs).

export interface SavedIso {
  id: string;
  name: string;
  size: number;
  bootable: boolean;
  created: number;
  bytes: Uint8Array;
  kernelBytes?: ArrayBuffer;
  initrdBytes?: ArrayBuffer;
  cmdline?: string;
}

const DB_NAME = "dsbox-isos";
const DB_VERSION = 1;
const STORE = "isos";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction falhou"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction abortada"));
  });
}

/** Salva (ou substitui) uma ISO na base local. Nunca lança — devolve ok/erro. */
export async function isoDbSave(item: SavedIso): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...item });
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

export async function isoDbDelete(id: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

export async function isoDbClear(): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

/** Lista TODAS as ISOs salvas (mais recentes primeiro). */
export async function isoDbList(): Promise<SavedIso[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as SavedIso[];
        rows.sort((a, b) => b.created - a.created);
        resolve(rows.filter(r => r && r.bytes instanceof Uint8Array && r.id && r.name));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}
