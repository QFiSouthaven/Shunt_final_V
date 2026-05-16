// utils/storage.ts
import { get, set, del, clear } from 'idb-keyval';

/**
 * A wrapper around idb-keyval to handle async storage with fallback migration.
 * This moves heavy data operations off the main thread.
 */
export const storage = {
    get: async <T>(key: string, fallback?: T): Promise<T | undefined> => {
        try {
            const val = await get(key);
            return val !== undefined ? val : fallback;
        } catch (e) {
            console.error(`IndexedDB read error for ${key}:`, e);
            return fallback;
        }
    },
    
    set: async (key: string, value: any) => {
        try {
            await set(key, value);
        } catch (e) {
            console.error(`IndexedDB write error for ${key}:`, e);
        }
    },
    
    del: async (key: string) => {
        try {
            await del(key);
        } catch (e) {
            console.error(`IndexedDB delete error for ${key}:`, e);
        }
    },

    clear: async () => {
        await clear();
    },

    /**
     * Attempts to load from IndexedDB. If not found, checks localStorage,
     * migrates the data to IndexedDB, and cleans up localStorage.
     */
    migrateAndGet: async <T>(key: string, fallback?: T): Promise<T | undefined> => {
        // 1. Check IndexedDB
        const dbVal = await get(key);
        if (dbVal !== undefined) {
            return dbVal;
        }

        // 2. Check LocalStorage (Legacy)
        try {
            const localVal = localStorage.getItem(key);
            if (localVal !== null) {
                const parsed = JSON.parse(localVal);
                // 3. Migrate
                await set(key, parsed);
                localStorage.removeItem(key);
                console.log(`[Storage] Migrated ${key} to IndexedDB.`);
                return parsed;
            }
        } catch (e) {
            console.warn(`[Storage] Failed to migrate ${key} from localStorage.`, e);
        }

        return fallback;
    }
};