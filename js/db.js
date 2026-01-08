/**
 * Database Module
 * Управляет локальным хранилищем (IndexedDB)
 * Синхронизация с облаком делегирована SyncEngine * 
 * Архитектура: offline-first
 * 1. Все записи сохраняются в IndexedDB немедленно
 * 2. Операции добавляются в очередь синхронизации (SyncEngine их обработает)
 * 3. UI всегда видит актуальные локальные данные */

const DB = (() => {
    const DB_NAME = 'TaskManager';
    const DB_VERSION = 3;  // Увеличена версия чтобы пересоздать stores с обоими хранилищами
    const STORE_NAME = 'tasks';
    
    let db = null;

    /**
     * Инициализация IndexedDB
     * Создаёт хранилища для задач и очереди синхронизации
     */
    async function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                db = request.result;
                console.log('💾 IndexedDB инициализирована');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Создать store для задач если его нет
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    console.log('📦 Store "tasks" создан');
                }
                
                // Создать store для очереди синхронизации если его нет
                if (!database.objectStoreNames.contains('syncQueue')) {
                    database.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    console.log('📦 Store "syncQueue" создан');
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
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Добавить или обновить задачу в IndexedDB
     * Синхронизация с облаком происходит в SyncEngine.queueOperation()
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
     * Сохранить задачу (IndexedDB + очередь синхронизации)
     * 
     * Процесс:
     * 1. Сохраняем в IndexedDB немедленно (offline-first)
     * 2. Добавляем в очередь операцию на синхронизацию (SyncEngine обработает)
     */
    async function saveTask(task) {
        await addTask(task);
        
        // Очередь для синхронизации с облаком
        if (FIREBASE_ENABLED) {
            await SyncEngine.queueOperation('save', task.id, task);
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
            console.log('🗄️  БД готова');
        } catch (error) {
            console.error('❌ Ошибка инициализации БД:', error);
            throw error;
        }
    }

    // Публичное API
    return {
        init,
        getAllTasks,
        addTask,
        deleteTask,
        clearStore,
        saveTask,
        removeTask
    };
})();
