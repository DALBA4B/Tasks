/**
 * Storage Manager Module
 * Управление переключением между двумя изолированными хранилищами (storage1, storage2)
 * Или объединение в одно хранилище (merged mode)
 * 
 * Каждое хранилище содержит свои задачи в отдельной таблице IndexedDB
 */

const StorageManager = (() => {
    const STORAGE_KEY = 'currentStorage'; // Ключ для выбранного хранилища
    const MERGE_STATE_KEY = 'mergeState'; // 'merged' или 'split'
    const DEFAULT_STORAGE = 'storage1';
    const MERGE_STATE_MERGED = 'merged';
    const MERGE_STATE_SPLIT = 'split';
    
    let currentStorage = null;
    let currentMergeState = null;

    /**
     * Инициализировать StorageManager
     * Если режим split - показать модальное окно выбора ВСЕГДА (не сохранять)
     * Если режим merged - сразу загрузить storage1
     * @returns {Promise<string>} - текущее активное хранилище
     */
    async function init() {
        // Получить состояние объединения
        const savedMergeState = localStorage.getItem(MERGE_STATE_KEY);
        currentMergeState = savedMergeState || MERGE_STATE_SPLIT;
        
        

        // Если режим merged - автоматически загрузить storage1
        if (currentMergeState === MERGE_STATE_MERGED) {
            currentStorage = 'storage1';
            return currentStorage;
        }

        // Если режим split - ВСЕГДА показать модальное окно выбора
        // (не сохраняем выбор в localStorage, поэтому при каждом входе будет выбор)
        return new Promise((resolve) => {
            showStorageSelectionModal(() => {
                resolve(currentStorage);
            });
        });
    }

    /**
     * Показать модальное окно выбора хранилища
     */
    function showStorageSelectionModal(callback) {
        const modal = document.getElementById('storageSelectionModal');
        const btn1 = document.getElementById('btnStorage1');
        const btn2 = document.getElementById('btnStorage2');

        // Обработчик клика на хранилище
        const selectStorage = (storage) => {
            currentStorage = storage;
            // НЕ сохраняем в localStorage - при каждом входе будет новый выбор
            
            
            // 📌 ВАЖНО: Обновить currentStoreName в DB БЕЗ перезагрузки
            DB.setCurrentStorage(storage);
            
            modal.classList.remove('active');
            
            // Очистить обработчики
            btn1.removeEventListener('click', handleStorage1);
            btn2.removeEventListener('click', handleStorage2);
            
            callback();
        };

        const handleStorage1 = () => selectStorage('storage1');
        const handleStorage2 = () => selectStorage('storage2');

        btn1.addEventListener('click', handleStorage1);
        btn2.addEventListener('click', handleStorage2);

        // Показать модальное окно
        modal.classList.add('active');
    }

    /**
     * Получить текущее активное хранилище
     */
    function getCurrent() {
        return currentStorage || DEFAULT_STORAGE;
    }

    /**
     * Получить текущее состояние (merged или split)
     */
    function getMergeState() {
        return currentMergeState || MERGE_STATE_SPLIT;
    }

    /**
     * Объединить два хранилища в одно
     * Скопировать все задачи из storage2 в storage1, потом очистить storage2
     */
    async function mergeStorages() {
        if (currentMergeState === MERGE_STATE_MERGED) {
            console.warn('⚠️ Хранилища уже объединены');
            return false;
        }

        
        try {
            // Получить все задачи из storage2
            const storage2Tasks = await getTasksFromStorage('storage2');

            // Добавить их в storage1
            if (storage2Tasks.length > 0) {
                await saveTasksToStorage('storage1', storage2Tasks);
            }

            // Установить флаг merged
            currentMergeState = MERGE_STATE_MERGED;
            localStorage.setItem(MERGE_STATE_KEY, MERGE_STATE_MERGED);
            currentStorage = 'storage1';
            localStorage.setItem(STORAGE_KEY, 'storage1');

            
            return true;
        } catch (error) {
            console.error('❌ Ошибка при объединении:', error);
            throw error;
        }
    }

    /**
     * Разделить одно хранилище на два
     * Все задачи остаются в storage1, storage2 становится пустым
     */
    async function splitStorages() {
        if (currentMergeState === MERGE_STATE_SPLIT) {
            console.warn('⚠️ Хранилища уже разделены');
            return false;
        }

        
        try {
            // Очистить storage2
            await clearStorage('storage2');

            // Установить флаг split
            currentMergeState = MERGE_STATE_SPLIT;
            localStorage.setItem(MERGE_STATE_KEY, MERGE_STATE_SPLIT);
            localStorage.removeItem(STORAGE_KEY); // Удалить выбор - будет модаль выбора при входе

            
            return true;
        } catch (error) {
            console.error('❌ Ошибка при разделении:', error);
            throw error;
        }
    }

    /**
     * Получить все задачи из конкретного хранилища
     * @private
     */
    async function getTasksFromStorage(storageName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TaskManager', 4);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([`tasks_${storageName}`], 'readonly');
                const store = transaction.objectStore(`tasks_${storageName}`);
                const getAllRequest = store.getAll();
                
                getAllRequest.onerror = () => reject(getAllRequest.error);
                getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
            };
        });
    }

    /**
     * Сохранить задачи в конкретное хранилище
     * @private
     */
    async function saveTasksToStorage(storageName, tasks) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TaskManager', 4);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([`tasks_${storageName}`], 'readwrite');
                const store = transaction.objectStore(`tasks_${storageName}`);
                
                let completed = 0;
                tasks.forEach(task => {
                    const putRequest = store.put(task);
                    putRequest.onsuccess = () => {
                        completed++;
                        if (completed === tasks.length) {
                            resolve();
                        }
                    };
                    putRequest.onerror = () => reject(putRequest.error);
                });
                
                if (tasks.length === 0) resolve();
            };
        });
    }

    /**
     * Очистить конкретное хранилище
     * @private
     */
    async function clearStorage(storageName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TaskManager', 4);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([`tasks_${storageName}`], 'readwrite');
                const store = transaction.objectStore(`tasks_${storageName}`);
                const clearRequest = store.clear();
                
                clearRequest.onerror = () => reject(clearRequest.error);
                clearRequest.onsuccess = () => resolve();
            };
        });
    }

    /**
     * Получить имя хранилища для отображения
     */
    function getStorageDisplayName(storage = null) {
        const s = storage || currentStorage;
        return s === 'storage1' ? 'Хранилище 1' : 'Хранилище 2';
    }

    /**
     * Получить таблицу IndexedDB для текущего хранилища
     */
    function getStorageTableName() {
        return `tasks_${currentStorage}`;
    }

    // Публичное API
    return {
        init,
        getCurrent,
        getMergeState,
        mergeStorages,
        splitStorages,
        getStorageDisplayName,
        getStorageTableName,
        MERGE_STATE_MERGED,
        MERGE_STATE_SPLIT,
        STORAGE_KEY,
        MERGE_STATE_KEY
    };
})();
