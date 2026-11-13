import CryptoJS from "crypto-js";

// Хранилище для секретов (токены доверенных устройств).
// В Electron — системное шифрование через главный процесс (DPAPI в Windows): файл не
// расшифровать под другим пользователем Windows или на другом компьютере.
// В вебе такого механизма нет — остаётся localStorage с прежним (обфусцирующим) шифрованием.
//
// Ключ ниже — только для чтения старых значений: раньше всё «шифровалось» им, а он
// зашит в код лаунчера, то есть по-настоящему ничего не защищал.
const LEGACY_KEY = '63dbdffc0f08d6741587a5efbe6cd047746f0cda3b4bd7a10e0a63aa8c6c3dee';

type NativeStore = {
    get: (key: string) => string | null;
    set: (key: string, value: string) => boolean;
    remove: (key: string) => boolean;
};

function nativeStore(): NativeStore | null {
    return ((window as any).electron?.secureStore as NativeStore | undefined) ?? null;
}

function readLegacy(key: string): unknown {
    const data = localStorage.getItem(key);
    if (!data) return null;
    try {
        return JSON.parse(CryptoJS.AES.decrypt(data, LEGACY_KEY).toString(CryptoJS.enc.Utf8));
    } catch {
        return null;
    }
}

export const secureStorage = {
    setItem: (key: string, value: any) => {
        const store = nativeStore();
        if (store) {
            store.set(key, JSON.stringify(value));
            localStorage.removeItem(key); // старую копию не оставляем
            return;
        }
        localStorage.setItem(key, CryptoJS.AES.encrypt(JSON.stringify(value), LEGACY_KEY).toString());
    },

    getItem: (key: string) => {
        const store = nativeStore();
        if (store) {
            const raw = store.get(key);
            if (raw != null) {
                try { return JSON.parse(raw); } catch { return null; }
            }
            // перенос значения из старого localStorage в защищённое хранилище
            const legacy = readLegacy(key);
            if (legacy != null) {
                store.set(key, JSON.stringify(legacy));
                localStorage.removeItem(key);
            }
            return legacy;
        }
        return readLegacy(key);
    },

    removeItem: (key: string) => {
        nativeStore()?.remove(key);
        localStorage.removeItem(key);
    },
};
