/**
 * Database Module
 * Управляет локальным хранилищем (IndexedDB)
 * Поддерживает два изолированных хранилища (storage1, storage2)
 * Синхронизация с облаком делегирована SyncEngine
 * 
 * Архитектура: offline-first
 * 1. Все записи сохраняются в IndexedDB немедленно
 * 2. Операции добавляются в очередь синхронизации (SyncEngine их обработает)
 * 3. UI всегда видит актуальные локальные данные
 */

const DB = (() => {
    const DB_NAME = 'TaskManager';
    const DB_VERSION = 4;  // Увеличена для поддержки двух хранилищ
    
    let db = null;
    let currentStoreName = null;  // Будет установлено StorageManager'ом

    /**
     * Инициализация IndexedDB
     * Создаёт хранилища для двух изолированных наборов задач
     */
    async function initIndexedDB() {
        // Получить текущее хранилище от StorageManager
        currentStoreName = `tasks_${StorageManager.getCurrent()}`;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                db = request.result;
                // Если режим split - убедиться что storage2 пустой
                if (StorageManager.getMergeState() === StorageManager.MERGE_STATE_SPLIT) {
                    const transaction = db.transaction(['tasks_storage2'], 'readwrite');
                    const store = transaction.objectStore('tasks_storage2');
                    const clearRequest = store.clear();
                    clearRequest.onerror = () => console.warn('Не удалось очистить storage2');
                }
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Создать таблицы для обоих хранилищ если их нет
                if (!database.objectStoreNames.contains('tasks_storage1')) {
                    database.createObjectStore('tasks_storage1', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('tasks_storage2')) {
                    database.createObjectStore('tasks_storage2', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('syncQueue')) {
                    database.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }



    /**
     * Получить все задачи из IndexedDB
     * Это локальное хранилище, синхронизация с облаком в SyncEngine
     */
    async function getAllTasks() {
        if (!db) return [];

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([currentStoreName], 'readonly');
            const store = transaction.objectStore(currentStoreName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                let tasks = request.result || [];
                resolve(tasks);
            };
        });
    }

    /**
     * Добавить или обновить задачу в IndexedDB
     * Синхронизация с облаком происходит в SyncEngine.queueOperation()
     */
    async function addTask(task) {
        if (!db || !task || !task.id) return null;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([currentStoreName], 'readwrite');
            const store = transaction.objectStore(currentStoreName);
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
            const transaction = db.transaction([currentStoreName], 'readwrite');
            const store = transaction.objectStore(currentStoreName);
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
            const transaction = db.transaction([currentStoreName], 'readwrite');
            const store = transaction.objectStore(currentStoreName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Сохранить задачу (IndexedDB + очередь синхронизации)
     * 
     * Процесс:
     * 1. Сохраняем в IndexedDB немедленно (offline-first)
     * 2. Добавляем в очередь операцию на синхронизацию (SyncEngine обработает)
     */
    async function saveTask(task) {
        await addTask(task);
        // Очередь для синхронизации с облаком (неблокирующая операция)
        if (FIREBASE_ENABLED) {
            try {
                await SyncEngine.queueOperation('save', task.id, task);
            } catch (error) {
                console.warn('Ошибка при добавлении в очередь синхронизации:', error);
            }
        }

        return task;
    }

    /**
     * Удалить задачу (IndexedDB + очередь синхронизации)
     * 
     * Процесс:
     * 1. Удаляем из IndexedDB немедленно (offline-first)
     * 2. Добавляем в очередь операцию на удаление в облаке
     */
    async function removeTask(taskId) {
        await deleteTask(taskId);

        // Очередь для синхронизации с облаком
        if (FIREBASE_ENABLED) {
            await SyncEngine.queueOperation('delete', taskId, null);
        }
    }

    /**
     * Инициализация: подготовить IndexedDB
     * SyncEngine инициализируется отдельно в app.js после этого
     */
    async function init() {
        try {
            await initIndexedDB();
        } catch (error) {
            console.error('❌ Ошибка инициализации БД:', error);
            throw error;
        }
    }

    /**
     * Изменить текущее хранилище БЕЗ перезагрузки
     * Используется при переключении между storage1 и storage2
     * @param {string} storageName - 'storage1' или 'storage2'
     */
    function setCurrentStorage(storageName) {
        if (storageName !== 'storage1' && storageName !== 'storage2') {
            console.error('❌ Неверное имя хранилища:', storageName);
            return false;
        }
        
        currentStoreName = `tasks_${storageName}`;
        return true;
    }

    /**
     * Получить текущее имя хранилища
     */
    function getCurrentStorage() {
        return currentStoreName;
    }

    // Публичное API
    return {
        init,
        getAllTasks,
        addTask,
        deleteTask,
        saveTask,
        removeTask,
        setCurrentStorage,
        getCurrentStorage
    };
})();
