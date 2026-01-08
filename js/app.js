/**
 * Main Application
 * Оркестрирует инициализацию и управляет потоком данных
 * 
 * Архитектура:
 * 1. DB слой: хранилище (IndexedDB) + очередь операций
 * 2. SyncEngine: управляет сетью, облаком, разрешением конфликтов
 * 3. UI слой: просто слушает события и отрисовывает
 * 
 * UI не знает о сети, это забота SyncEngine
 */

const App = (() => {
    /**
     * Инициализация приложения
     */
    async function init() {
        console.log('🚀 Инициализация приложения...');

        try {
            // 1. Инициализировать автоматическое расширение textarea
            TextareaAutosize.init();

            // 2. Инициализировать базу данных (только IndexedDB)
            await DB.init();

            // 3. Инициализировать движок синхронизации (управляет сетью и облаком)
            await SyncEngine.init(indexedDB);

            // 4. Загрузить локальные задачи в UI
            const tasks = await DB.getAllTasks();
            UI.setAllTasks(tasks);

            // 5. Инициализировать обработчики событий UI
            Handlers.init();

            // 6. Отрендерить начальное состояние
            UI.renderTasks();

            // 7. Слушать события синхронизации от SyncEngine
            setupSyncListeners();

            // 8. Показать статус
            updateSyncStatus(navigator.onLine);
            
            console.log('✅ Приложение готово к работе');
            console.log('💾 Все данные сохраняются локально в IndexedDB');
            console.log('📤 Если Firebase доступен, данные автоматически синхронизируются');
        } catch (error) {
            console.error('❌ Ошибка инициализации:', error);
        }
    }

    /**
     * Установить слушатели событий синхронизации от SyncEngine
     * 
     * События которые испускает SyncEngine:
     * - sync:started - начала обработка очереди
     * - sync:completed - очередь обработана
     * - sync:error - ошибка синхронизации
     * - sync:status-changed - изменилось состояние сети (online/offline)
     * - sync:tasks-synced - пришли новые данные с облака
     */
    function setupSyncListeners() {
        // Когда с облака пришли новые данные — обновить UI
        window.addEventListener(SyncEngine.EVENTS.TASKS_SYNCED, async (event) => {
            console.log('📡 Задачи синхронизированы с облаком');
            const tasks = await DB.getAllTasks();
            UI.setAllTasks(tasks);
            UI.renderTasks();
        });

        // Когда изменилось состояние сети — обновить статус
        window.addEventListener(SyncEngine.EVENTS.STATUS_CHANGED, (event) => {
            const { online } = event.detail;
            updateSyncStatus(online);
        });

        // Когда начинается синхронизация — показать статус
        window.addEventListener(SyncEngine.EVENTS.SYNC_STARTED, () => {
            updateSyncStatus(navigator.onLine, true);
        });

        // Когда синхронизация завершена — показать новый статус
        window.addEventListener(SyncEngine.EVENTS.SYNC_COMPLETED, async (event) => {
            const { count } = event.detail;
            updateSyncStatus(navigator.onLine, false, count);
        });

        // Когда ошибка синхронизации — показать её
        window.addEventListener(SyncEngine.EVENTS.SYNC_ERROR, (event) => {
            const { message } = event.detail;
            console.error('❌ Ошибка синхронизации:', message);
            // Можно показать пользователю уведомление, но это не критично
        });
    }

    /**
     * Обновить статус синхронизации в UI
     * 
     * @param {boolean} online - есть ли интернет
     * @param {boolean} syncing - идёт ли синхронизация (опционально)
     * @param {number} queueCount - количество операций в очереди (опционально)
     */
    function updateSyncStatus(online, syncing = false, queueCount = 0) {
        const statusEl = document.getElementById('syncStatus');
        const statusText = document.getElementById('syncText');

        if (!statusEl) return;

        if (!online) {
            statusEl.className = 'sync-status offline';
            statusText.textContent = 'Офлайн режим';
        } else if (syncing) {
            statusEl.className = 'sync-status syncing';
            statusText.textContent = queueCount > 0 ? 
                `⟳ Синхронизация (${queueCount})` : 
                '⟳ Синхронизация...';
        } else if (queueCount > 0) {
            statusEl.className = 'sync-status syncing';
            statusText.textContent = `⟳ Синхронизация (${queueCount})`;
        } else {
            statusEl.className = 'sync-status synced';
            statusText.textContent = '✓ Синхронизировано';
        }
    }

    /**
     * Загрузить и отрендерить задачи (используется из Handlers)
     */
    async function loadAndRender() {
        return Handlers.loadAndRenderTasks();
    }

    // Публичное API
    return {
        init,
        loadAndRender
    };
})();

// Инициализировать приложение когда DOM готов
document.addEventListener('DOMContentLoaded', App.init);
