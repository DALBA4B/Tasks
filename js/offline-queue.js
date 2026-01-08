/**
 * Offline Queue Module
 * Управляет очередью операций в IndexedDB
 * Хранит операции, которые нужно синхронизировать с облаком
 * 
 * ⚠️ ВАЖНО: Store 'syncQueue' ДОЛЖЕН быть создан в db.js при инициализации
 */

const OfflineQueue = (() => {
    const DB_NAME = 'TaskManager';
    const QUEUE_STORE = 'syncQueue';
    
    let db = null;

    /**
     * Инициализация хранилища очереди в IndexedDB
     * ⚠️ Store должен уже существовать (создан в db.js)
     */
    async function initQueueStore(indexedDB) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                db = request.result;
                
                // Проверить что store существует
                if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                    console.error('❌ Store "syncQueue" не найден. Он должен быть создан в db.js');
                    reject(new Error('Store syncQueue not found'));
                    return;
                }
                
                console.log('✓ Offline Queue готова к использованию');
                resolve();
            };

            request.onerror = () => {
                reject(new Error(`Ошибка при открытии БД: ${request.error}`));
            };
        });
    }

    /**
     * Добавить операцию в очередь
     * @param {Object} operation - {type: 'save'|'delete', taskId, task}
     */
    async function addOperation(operation) {
        if (!db) throw new Error('Queue store не инициализирован');

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([QUEUE_STORE], 'readwrite');
                const store = transaction.objectStore(QUEUE_STORE);
                const request = store.add({
                    ...operation,
                    createdAt: new Date().toISOString()
                });

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Получить все операции из очереди (в порядке добавления)
     */
    async function getAllOperations() {
        if (!db) return [];

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([QUEUE_STORE], 'readonly');
                const store = transaction.objectStore(QUEUE_STORE);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || []);
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Удалить операцию из очереди (после успешной синхронизации)
     * @param {number} operationId - ID операции в очереди
     */
    async function removeOperation(operationId) {
        if (!db) return;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([QUEUE_STORE], 'readwrite');
                const store = transaction.objectStore(QUEUE_STORE);
                const request = store.delete(operationId);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Очистить всю очередь (при успешной синхронизации или очистке)
     */
    async function clear() {
        if (!db) return;

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([QUEUE_STORE], 'readwrite');
                const store = transaction.objectStore(QUEUE_STORE);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Получить количество операций в очереди
     */
    async function getCount() {
        const operations = await getAllOperations();
        return operations.length;
    }

    // Публичное API
    return {
        initQueueStore,
        addOperation,
        getAllOperations,
        removeOperation,
        clear,
        getCount
    };
})();
