import axios from "axios";
import { getCachedDeviceInfo } from "../utils/deviceInfo";
import { API_URL } from "./config";
import { invalidateWhere } from "../utils/resourceCache";
import { allDeviceTokens } from "./deviceTokens";

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Без таймаута запрос, застрявший на «мёртвом» keep-alive соединении (сон ПК, смена сети, VPN),
// висел бесконечно: раздел крутил загрузку до перезапуска, а кэш ресурсов отдавал
// всем читателям этот же зависший промис.
const REQUEST_TIMEOUT_MS = 20_000;

api.interceptors.request.use((config) => {
    // только чтение: мутации (импорт игр, автоперевод, оплата) бывают долгими
    if (!config.timeout && (config.method || 'get').toLowerCase() === 'get') config.timeout = REQUEST_TIMEOUT_MS;

    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    const device = getCachedDeviceInfo();
    if (device.id) {
        config.headers['X-Device-Id'] = device.id;
        config.headers['X-Device-Name'] = device.name;
        config.headers['X-Device-Platform'] = device.platform;
    }

    return config;
})

// Любая успешная мутация (POST/PUT/PATCH/DELETE) может изменить статические данные
// (значки, лента активности, уровень). Помечаем соответствующие кэши устаревшими —
// следующее чтение сразу возьмёт свежие данные, но не чаще кулдауна.
api.interceptors.response.use((response) => {
    // Сервер отдаёт сессионный токен в теле (помимо HttpOnly-куки).
    // В Electron (origin file://) кука не отправляется, поэтому храним токен
    // локально и шлём его в заголовке Authorization.
    const issued = response.data && (response.data as any).token;
    if (typeof issued === 'string' && issued) {
        // НЕ перезаписываем пользовательскую сессию токеном LiveKit:
        // POST /calls/token отвечает { token: <LiveKit-JWT> } (iss = API-ключ LiveKit),
        // и его сохранение затирало localStorage['token'] при звонке — дальше
        // все запросы уходили с чужим Bearer'ом →401-спам и сброс авторизации.
        const url = response.config?.url || '';
        if (!url.startsWith('/calls/token')) {
            localStorage.setItem('token', issued);
        }
    }

    const method = (response.config.method || 'get').toLowerCase();
    if (method !== 'get' && method !== 'head') {
        invalidateWhere('badges:');
        invalidateWhere('activity:');
    }
    return response;
}, async (error) => {
    // GET, оборвавшийся по таймауту или без ответа сервера, один раз повторяем:
    // браузер откроет новое соединение вместо зависшего. Мутации не повторяем — могут задвоиться.
    const failed = error?.config;
    const method = (failed?.method || 'get').toLowerCase();
    if (failed && !error.response && method === 'get' && !failed._retriedNetwork && !axios.isCancel(error)) {
        failed._retriedNetwork = true;
        await new Promise((r) => setTimeout(r, 400));
        return api(failed);
    }

    // 401 — сессия могла истечь: один раз продлеваем её (на доверенном устройстве — даже
    // истёкшую) и повторяем запрос. Раньше 401 сразу выбрасывал на экран входа.
    // Токена в localStorage может не быть (вход через встроенное окно OAuth — только кука),
    // поэтому продлеваем по любому 401: сервер возьмёт сессию из куки.
    const config = error?.config;
    const url: string = config?.url || '';
    if (
        error?.response?.status === 401 && config && !config._retriedAfterRefresh &&
        !NO_REFRESH.some((p) => url.startsWith(p))
    ) {
        config._retriedAfterRefresh = true;
        const outcome = await refreshSessionOutcome();
        if (outcome === 'ok') {
            config.headers = config.headers || {};
            const token = localStorage.getItem('token');
            if (token) config.headers.Authorization = `Bearer ${token}`;
            return api(config);
        }
        // Продлить не удалось из-за сети/сбоя сервера, а не из-за отказа: это не выход из
        // аккаунта — AuthContext оставит пользователя и попробует позже.
        if (outcome === 'unavailable') error.sessionCheckUnavailable = true;
    }
    return Promise.reject(error);
});

// Запросы, на которые продлевать сессию бессмысленно (вход, выход и само продление)
const NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/logout', '/auth/register', '/auth/confirm', '/auth/verify-email', '/auth/reset-password', '/auth/forgot-password'];

export type RefreshOutcome = 'ok' | 'denied' | 'unavailable';

let refreshing: Promise<RefreshOutcome> | null = null;

/**
 * Продлить сессию. Параллельные вызовы ждут один запрос.
 * denied — сервер отказал (401: сессия отозвана/истекла без доверенного устройства);
 * unavailable — нет сети или сбой сервера: сессию НЕ считаем завершённой.
 */
export function refreshSessionOutcome(): Promise<RefreshOutcome> {
    if (!refreshing) {
        refreshing = api
            .post('/auth/refresh', { device_tokens: allDeviceTokens() }, { _retriedAfterRefresh: true } as any)
            .then((res): RefreshOutcome => (res.data?.token ? 'ok' : 'unavailable')) // токен сохраняет перехватчик
            .catch((err): RefreshOutcome => (err?.response?.status === 401 ? 'denied' : 'unavailable'))
            .finally(() => { refreshing = null; });
    }
    return refreshing;
}

export function refreshSession(): Promise<boolean> {
    return refreshSessionOutcome().then((o) => o === 'ok');
}

/** Срок действия текущего токена (мс от эпохи) из его payload, без проверки подписи. */
function tokenExpiry(): number | null {
    const token = localStorage.getItem('token');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    try {
        const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.exp === 'number' ? json.exp * 1000 : null;
    } catch {
        return null;
    }
}

const RENEW_BEFORE_MS = 48 * 3600_000; // продлеваем, когда до конца меньше 2 суток

/**
 * Пока лаунчер открыт, сессия продлевается заранее: раз в 30 минут и при возврате
 * к окну/появлении сети проверяем срок токена. Возвращает функцию остановки.
 */
export function startSessionKeepAlive(): () => void {
    const check = () => {
        const exp = tokenExpiry();
        // Нет токена в localStorage (сессия только в куке) — продлеваем: ответ вернёт
        // токен в теле, дальше срок отслеживается как обычно.
        if (exp === null || exp - Date.now() < RENEW_BEFORE_MS) void refreshSession();
    };
    check();
    const timer = window.setInterval(check, 30 * 60_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => {
        window.clearInterval(timer);
        window.removeEventListener('focus', check);
        window.removeEventListener('online', check);
    };
}

export default api
