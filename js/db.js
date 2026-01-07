/**
 * Database Module
 * Работа с IndexedDB (основной) и Firebase (синхронизация)
 */

const DB = (() => {
    const DB_NAME = 'TaskManager';
    const DB_VERSION = 1;
    const STORE_NAME = 'tasks';
    
    let db = null;
    let firebaseDb = null;
    let isOnline = navigator.onLine;
    let syncQueue = [];

    /**
     * Инициализация IndexedDB
     */
    async function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                db = request.result;
                console.log('IndexedDB инициализирована');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    console.log('Object Store создана');
                }
            };
        });
    }

    /**
     * Инициализация Firebase
     */
    function initFirebase() {
        if (!FIREBASE_ENABLED) {
            console.warn('Firebase не настроен. Используется только IndexedDB.');
            return;
        }

        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            firebaseDb = firebase.database();
            console.log('Firebase инициализирован');
            loadFromFirebase();
        } catch (error) {
            console.error('Ошибка инициализации Firebase:', error);
            firebaseDb = null;
        }
    }

    /**
     * Загрузка данных из Firebase
     */
    function loadFromFirebase() {
        if (!firebaseDb) return;

        firebaseDb.ref('tasks').on('value', async (snapshot) => {
            const firebaseTasks = snapshot.val() || {};
            const tasks = Object.values(firebaseTasks);
            
            // Очистить и обновить IndexedDB
            await clearStore();
            for (const task of tasks) {
                await addTask(task);
            }
            
            // Уведомить приложение об обновлении
            window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: tasks }));
        }, (error) => {
            console.error('Ошибка загрузки из Firebase:', error);
        });
    }

    /**
     * Получить все задачи из IndexedDB
     */
    async function getAllTasks() {
        if (!db) return [];

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Добавить или обновить задачу в IndexedDB
     */
    async function addTask(task) {
        if (!db) return null;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(task);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(task);
        });
    }

    /**
     * Удалить задачу из IndexedDB
     */
    async function deleteTask(taskId) {
        if (!db) return;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(taskId);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Очистить всё хранилище
     */
    async function clearStore() {
        if (!db) return;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Сохранить задачу (IndexedDB + Firebase)
     */
    async function saveTask(task) {
        // Обновить IndexedDB
        await addTask(task);

        // Синхронизировать с Firebase
        if (firebaseDb && isOnline) {
            syncToFirebase(task);
        } else if (firebaseDb) {
            syncQueue.push(task);
            updateSyncStatus();
        }

        return task;
    }

    /**
     * Удалить задачу (IndexedDB + Firebase)
     */
    async function removeTask(taskId) {
        // Удалить из IndexedDB
        await deleteTask(taskId);

        // Удалить из Firebase
        if (firebaseDb && isOnline) {
            syncDeleteFromFirebase(taskId);
        }
    }

    /**
     * Синхронизировать задачу с Firebase
     */
    function syncToFirebase(task) {
        if (!firebaseDb) return;

        firebaseDb.ref(`tasks/${task.id}`).set(task, (error) => {
            if (error) {
                console.error('Ошибка синхронизации:', error);
                if (!syncQueue.find(t => t.id === task.id)) {
                    syncQueue.push(task);
                }
            } else {
                syncQueue = syncQueue.filter(t => t.id !== task.id);
            }
            updateSyncStatus();
        });
    }

    /**
     * Удалить задачу из Firebase
     */
    function syncDeleteFromFirebase(taskId) {
        if (!firebaseDb) return;

        firebaseDb.ref(`tasks/${taskId}`).remove((error) => {
            if (error) {
                console.error('Ошибка удаления из Firebase:', error);
            }
        });
    }

    /**
     * Обновить статус синхронизации в UI
     */
    function updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        const statusText = document.getElementById('syncText');

        if (!statusEl) return;

        if (!isOnline) {
            statusEl.className = 'sync-status offline';
            statusText.textContent = 'Офлайн режим';
        } else if (firebaseDb && syncQueue.length === 0) {
            statusEl.className = 'sync-status synced';
            statusText.textContent = '✓ Синхронизировано';
        } else if (syncQueue.length > 0) {
            statusEl.className = 'sync-status syncing';
            statusText.textContent = `⟳ Синхронизация (${syncQueue.length})`;
        } else {
            statusEl.className = 'sync-status synced';
            statusText.textContent = '✓ Готово';
        }
    }

    /**
     * Инициализация слушателей сети
     */
    function initNetworkListeners() {
        window.addEventListener('online', () => {
            isOnline = true;
            updateSyncStatus();
            // Синхронизировать отложенные задачи
            if (firebaseDb && syncQueue.length > 0) {
                syncQueue.forEach(task => syncToFirebase(task));
            }
        });

        window.addEventListener('offline', () => {
            isOnline = false;
            updateSyncStatus();
        });
    }

    /**
     * Инициализация
     */
    async function init() {
        try {
            await initIndexedDB();
            initFirebase();
            initNetworkListeners();
            updateSyncStatus();
            console.log('База данных инициализирована');
        } catch (error) {
            console.error('Ошибка инициализации БД:', error);
        }
    }

    // Публичное API
    return {
        init,
        getAllTasks,
        saveTask,
        removeTask,
        updateSyncStatus
    };
})();
