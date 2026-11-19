/**
 * storageService.ts
 * Sistema resiliente de armazenamento local para HPS Control
 * Suporta IndexedDB (sem limite de 5MB do localStorage) com fallback transparente para localStorage.
 * Previne falhas de QuotaExceededError e comprime imagens automaticamente.
 */

const IDB_NAME = 'HPS_CONTROL_IDB';
const IDB_VERSION = 1;
const IDB_STORE = 'app_data';

// Abre ou cria o banco IndexedDB nativo
function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('Falha ao abrir IndexedDB, usando localStorage');
        resolve(null);
      };
    } catch (e) {
      console.warn('Erro ao inicializar IndexedDB', e);
      resolve(null);
    }
  });
}

/**
 * Salva um valor no IndexedDB
 */
export async function idbSet<T = any>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openIDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const transaction = db.transaction([IDB_STORE], 'readwrite');
      const store = transaction.objectStore(IDB_STORE);
      const req = store.put(value, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn(`Erro ao salvar ${key} no IndexedDB`);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn(`Exceção ao salvar ${key} no IndexedDB`, err);
    return false;
  }
}

/**
 * Lê um valor do IndexedDB
 */
export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openIDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const transaction = db.transaction([IDB_STORE], 'readonly');
      const store = transaction.objectStore(IDB_STORE);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn(`Exceção ao ler ${key} do IndexedDB`, err);
    return null;
  }
}

/**
 * Limpa versões antigas e duplicatas do localStorage para liberar espaço
 */
export function cleanupLegacyStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Remove versões antigas V1 até V11
      if (/^HPS_PRO_DATA_V([1-9]|1[0-1])(_|$)/.test(k) || /^HPS_CATEGORIES_V([1-9]|1[0-1])(_|$)/.test(k)) {
        keysToRemove.push(k);
      }
      
      // Remove logs temporários e chaves obsoletas
      if (k.startsWith('debug_') || k.startsWith('temp_cache_')) {
        keysToRemove.push(k);
      }
    }

    // Se já temos a chave particionada da matriz, remover a cópia duplicada HPS_PRO_DATA_V12 para economizar 50%
    if (localStorage.getItem('HPS_PRO_DATA_V12_tenant_matriz_hps')) {
      keysToRemove.push('HPS_PRO_DATA_V12');
    }

    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch (e) {
    console.warn('Erro ao limpar chaves obsoletas do localStorage', e);
  }
}

/**
 * Remove imagens base64 pesadas de um payload para permitir armazenamento de emergência
 */
function stripOversizedImages(data: any): any {
  if (!data || typeof data !== 'object') return data;

  try {
    const copy = JSON.parse(JSON.stringify(data));
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((item: any) => {
        if (item.imageUrl && item.imageUrl.length > 5000) {
          return { ...item, imageUrl: undefined };
        }
        return item;
      });
    }
    if (Array.isArray(copy.serviceOrders)) {
      copy.serviceOrders = copy.serviceOrders.map((os: any) => {
        // Reduz fotos de inspeção ou anexos muito pesados se houver
        if (os.photos && Array.isArray(os.photos)) {
          return { ...os, photos: [] };
        }
        return os;
      });
    }
    return copy;
  } catch {
    return data;
  }
}

/**
 * Salva com segurança no localStorage prevenindo QuotaExceededError
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    console.warn(`QuotaExceededError ou erro ao salvar ${key} no localStorage. Tentando limpeza...`, e);

    // 1. Tenta limpar dados obsoletos e tentar novamente
    cleanupLegacyStorage();
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e2) {
      // 2. Se for JSON com imagens pesadas, tenta versão enxuta para o localStorage
      try {
        const parsed = JSON.parse(value);
        const slim = stripOversizedImages(parsed);
        const slimStr = JSON.stringify(slim);
        localStorage.setItem(key, slimStr);
        console.info(`Salvo no localStorage com fotos otimizadas para caber na cota de 5MB.`);
        return true;
      } catch (e3) {
        console.warn(`Não foi possível salvar ${key} no localStorage. O IndexedDB continuará mantendo os dados intactos.`);
        return false;
      }
    }
  }
}

/**
 * Lê do localStorage com tratamento de erro
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`Erro ao ler ${key} do localStorage`, e);
    return null;
  }
}

/**
 * Comprime uma imagem (JPEG/WebP) para caber levemente na memória e no storage (< 60KB)
 */
export function compressImage(
  file: File, 
  maxWidth = 800, 
  maxHeight = 800, 
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };

      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
