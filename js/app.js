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
     * Показать уведомление (toast) от приложения
     * @param {string} message - текст сообщения
     * @param {string} type - тип: 'success', 'error', 'info'
     */
    window.showAppNotification = function(message, type = 'info') {
        // Удалить старое уведомление если есть
        const existing = document.getElementById('appNotification');
        if (existing) existing.remove();

        // Создать новое уведомление
        const notification = document.createElement('div');
        notification.id = 'appNotification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        `;
        notification.textContent = message;

        // Добавить CSS анимацию если её нет
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(400px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Автоматически удалить через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };

    /**
     * Инициализация приложения
     */
    async function init() {
        

        try {
            // 0. Инициализировать выбор хранилища (пока не выбрано - показать модаль)
            await StorageManager.init();

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

            // 6. Инициализировать обработчики настроек
            setupSettingsHandlers();

            // 7. Отрендерить начальное состояние
            UI.renderTasks();

            // 8. Слушать события синхронизации от SyncEngine
            setupSyncListeners();

            // 9. Показать статус
            updateSyncStatus(navigator.onLine);
            
            
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
        // Игнорируем TASKS_SYNCED для UI - используем только для уведомлений
        // (облачные данные могут быть неполными)
        
        // Вместо этого UI обновляется явно в handlers.js после создания/редактирования

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
     * Показать уведомление (toast) от приложения
     * @param {string} message - текст сообщения
     * @param {string} type - тип: 'success', 'error', 'info'
     */
    function showNotification(message, type = 'info') {
        window.showAppNotification(message, type);
    }

    /**
     * Инициализировать обработчики настроек и хранилищ
     */
    function setupSettingsHandlers() {
        const btnSettings = document.getElementById('btnSettings');
        const settingsModal = document.getElementById('settingsModal');
        const settingsModalClose = document.getElementById('settingsModalClose');
        const currentStateDisplay = document.getElementById('currentStateDisplay');
        const storageToggle = document.getElementById('storageToggle');

        // Обновить состояние отображения
        function updateStorageDisplay() {
            const mergeState = StorageManager.getMergeState();
            if (mergeState === StorageManager.MERGE_STATE_MERGED) {
                currentStateDisplay.textContent = '🔗 Объединено';
                storageToggle.checked = true;
            } else {
                currentStateDisplay.textContent = '📂 Разделено';
                storageToggle.checked = false;
            }
        }

        // Показать модальное окно настроек
        btnSettings.addEventListener('click', () => {
            updateStorageDisplay();
            settingsModal.classList.add('active');
        });

        // Закрыть модальное окно
        settingsModalClose.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });

        // Обработчик ползунка
        storageToggle.addEventListener('change', async () => {
            const isMerged = storageToggle.checked;
            const currentState = StorageManager.getMergeState();

            try {
                if (isMerged && currentState === StorageManager.MERGE_STATE_SPLIT) {
                    // Переключиться на объединение
                    const msg = '⚠️ Это объединит все задачи из Хранилища 2 в Хранилище 1.\n\nПосле этого будет только одно хранилище. Продолжить?';
                    if (!confirm(msg)) {
                        storageToggle.checked = false;
                        return;
                    }

                    storageToggle.disabled = true;
                    showNotification('⏳ Объединение хранилищ...', 'info');

                    await StorageManager.mergeStorages();
                    
                    showNotification('✅ Хранилища объединены!', 'success');
                    settingsModal.classList.remove('active');
                    setTimeout(() => window.location.reload(), 800);
                } else if (!isMerged && currentState === StorageManager.MERGE_STATE_MERGED) {
                    // Переключиться на разделение
                    const msg = '⚠️ Это разделит хранилище на два отдельных.\n\nВсе текущие задачи останутся в Хранилище 1, Хранилище 2 будет пустым. Продолжить?';
                    if (!confirm(msg)) {
                        storageToggle.checked = true;
                        return;
                    }

                    storageToggle.disabled = true;
                    showNotification('⏳ Разделение хранилищ...', 'info');

                    await StorageManager.splitStorages();
                    
                    showNotification('✅ Хранилище разделено!', 'success');
                    settingsModal.classList.remove('active');
                    setTimeout(() => window.location.reload(), 800);
                }
            } catch (error) {
                console.error('❌ Ошибка:', error);
                showNotification('❌ Ошибка: ' + error.message, 'error');
                storageToggle.disabled = false;
                updateStorageDisplay();
            }
        });

        // Закрыть по клику на backdrop
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
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

    // Публичное API
    return {
        init
    };
})();

// Инициализировать приложение когда DOM готов
document.addEventListener('DOMContentLoaded', App.init);
