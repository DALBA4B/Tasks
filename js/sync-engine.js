/**
 * Sync Engine Module
 * Ядро синхронизации: управляет состоянием сети, обрабатывает очередь,
 * разрешает конфликты и уведомляет UI об изменениях
 * 
 * Архитектура:
 * 1. Слушает события online/offline и управляет состоянием
 * 2. Коллект операции в очередь при отсутствии сети
 * 3. Обрабатывает очередь при возврате в сеть
 * 4. Разрешает конфликты через Last-Write-Wins (последняя запись побеждает)
 * 5. Испускает события для UI: sync:started, sync:completed, sync:error
 */

const SyncEngine = (() => {
    let isOnline = navigator.onLine;
    let firebaseDb = null;
    let isSyncing = false;
    
    // Отслеживать локально удаленные задачи (их не нужно восстанавливать из облака)
    const locallyDeletedTaskIds = new Set();

    // События, которые испускает engine
    const EVENTS = {
        SYNC_STARTED: 'sync:started',
        SYNC_COMPLETED: 'sync:completed',
        SYNC_ERROR: 'sync:error',
        STATUS_CHANGED: 'sync:status-changed', // изменилось состояние сети
        TASKS_SYNCED: 'sync:tasks-synced' // пришли новые данные с облака
    };

    /**
     * Инициализация синхронизации
     * @param {Object} indexedDB - экземпляр IndexedDB
     */
    async function init(indexedDB) {
        try {
            // Инициализировать хранилище очереди
            await OfflineQueue.initQueueStore(indexedDB);

            // Инициализировать Firebase если настроен
            if (FIREBASE_ENABLED) {
                try {
                    await waitForFirebase(5000); // Ждать Firebase до 5 секунд
                    initFirebase();
                } catch (firebaseError) {
                    console.warn('⚠️ Firebase не загружен, приложение будет работать в режиме offline-only:', firebaseError.message);
                    // Отключаем Firebase и продолжаем работу
                }
            }

            // Слушать изменения состояния сети
            initNetworkListeners();

            // ⚠️ ВАЖНО: НЕ БЛОКИРОВАТЬ на Firebase синхронизацию
            // Запустить синхронизацию в фоне, но не ждать её
            // Это позволяет UI загружаться немедленно с локальными данными
            if (FIREBASE_ENABLED && isOnline && firebaseDb) {
                // Запустить в фоне (асинхронно, без await)
                syncWithCloud().catch(error => {
                    console.warn('Ошибка фоновой синхронизации:', error);
                });
            }

            console.log('🔄 Sync Engine инициализирован');
        } catch (error) {
            console.error('Ошибка инициализации Sync Engine:', error);
            emitEvent(EVENTS.SYNC_ERROR, { message: error.message });
        }
    }

    /**
     * Подождать, пока Firebase загрузится
     */
    async function waitForFirebase(timeoutMs = 5000) {
        const startTime = Date.now();
        while (typeof window.firebase === 'undefined') {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Firebase SDK не загружен за ${timeoutMs}ms`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    /**
     * Инициализация Firebase
     */
    function initFirebase() {
        try {
            if (!FIREBASE_ENABLED) {
                console.warn('Firebase отключен. Используется только IndexedDB.');
                return;
            }

            // Проверить, не инициализирована ли уже Firebase
            if (window.firebase && window.firebase.apps && window.firebase.apps.length > 0) {
                console.log('📡 Firebase уже инициализирована');
                firebaseDb = window.firebase.database();
            } else {
                // Firebase v9 API
                window.firebase.initializeApp(FIREBASE_CONFIG);
                firebaseDb = window.firebase.database();
                console.log('📡 Firebase инициализирована (v9 API)');
            }

            // Слушать изменения задач на облаке
            setupCloudListener();
            
            // Добавить обработчик ошибок подключения
            if (firebaseDb) {
                firebaseDb.ref('.info/connected').on('value', (snapshot) => {
                    if (snapshot.val() === true) {
                        console.log('✅ Firebase подключен к серверу');
                    } else {
                        console.warn('⚠️ Firebase отключен');
                    }
                });
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации Firebase:', error);
            firebaseDb = null;
        }
    }

    /**
     * Установить слушатель на изменения в облаке
     * Когда облако обновляется, мы загружаем свежие данные
     */
    function setupCloudListener() {
        if (!firebaseDb) return;

        firebaseDb.ref('tasks').on('value', async (snapshot) => {
            const cloudTasks = snapshot.val() || {};
            const tasks = Object.values(cloudTasks);
            console.log(`📡 Слушатель сработал: получено ${tasks.length} задач с облака`);
            console.log(`   locallyDeletedTaskIds содержит: ${locallyDeletedTaskIds.size} задач`);

            // Объединить облачные данные с локальными через LWW
            await mergeCloudTasks(tasks);

            // Уведомить UI о синхронизации
            emitEvent(EVENTS.TASKS_SYNCED, { tasks });
        }, (error) => {
            console.error('❌ Ошибка слушателя облака:', error);
            emitEvent(EVENTS.SYNC_ERROR, { message: error.message });
        });
    }

    /**
     * Объединить задачи с облака с локальными через Last-Write-Wins
     * LWW: смотрим на updated_at, у кого метка позже — берём того
     * 
     * @param {Array} cloudTasks - задачи пришедшие с облака
     */
    async function mergeCloudTasks(cloudTasks) {
        const localTasks = await DB.getAllTasks();
        console.log(`📊 Мерж данных: ${localTasks.length} локальных, ${cloudTasks.length} с облака`);
        
        if (localTasks.length > 0) {
            console.log(`   Локальные: ${localTasks.map(t => t.id).join(', ')}`);
        }
        if (cloudTasks.length > 0) {
            console.log(`   С облака: ${cloudTasks.map(t => t.id).join(', ')}`);
        }

        // Построить карту локальных задач по ID для быстрого поиска
        const localMap = {};
        localTasks.forEach(task => {
            localMap[task.id] = task;
        });

        // Построить набор ID задач с облака для быстрого поиска
        const cloudTaskIds = new Set(cloudTasks.map(t => t.id));

        // Для каждой облачной задачи: если её версия свежее локальной — обновить
        for (const cloudTask of cloudTasks) {
            const localTask = localMap[cloudTask.id];
            
            // НЕ восстанавливать локально удаленные задачи (ждем синхронизации DELETE)
            if (locallyDeletedTaskIds.has(cloudTask.id)) {
                console.log(`⏭️ Пропущена удаленная локально задача: ${cloudTask.id}`);
                continue;
            }

            if (!localTask) {
                // Новая задача с облака — добавить локально
                console.log(`➕ Добавлена новая задача с облака: ${cloudTask.id}`);
                await DB.addTask(cloudTask);
            } else if (new Date(cloudTask.updated_at) > new Date(localTask.updated_at)) {
                // Облачная версия свежее — обновить локально
                console.log(`🔄 Обновлена задача с облака: ${cloudTask.id}`);
                await DB.addTask(cloudTask);
            }
            // Иначе локальная версия свежее, оставляем её
        }

        // Удалить локальные задачи которые удалены на облаке
        let deletedCount = 0;
        for (const localTask of localTasks) {
            if (!cloudTaskIds.has(localTask.id)) {
                // Задача удалена на облаке но существует локально
                console.log(`🗑️ Удалена локальная задача (удалена на облаке): ${localTask.id}`);
                await DB.deleteTask(localTask.id);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`✓ Удалено ${deletedCount} локальных задач которые были удалены на облаке`);
        }
        
        // Проверка: все ли локальные задачи теперь синхронны с облаком
        const finalLocalTasks = await DB.getAllTasks();
        console.log(`✅ Финальное состояние: ${finalLocalTasks.length} локальных задач`);
        if (finalLocalTasks.length > 0) {
            console.log(`   Остались: ${finalLocalTasks.map(t => t.id).join(', ')}`);
        }
    }

    /**
     * Добавить операцию в очередь и попробовать синхронизировать
     * Используется когда задача сохраняется/удаляется
     * 
     * @param {string} type - 'save' или 'delete'
     * @param {string} taskId - ID задачи
     * @param {Object} task - объект задачи (для save) или null (для delete)
     */
    async function queueOperation(type, taskId, task = null) {
        try {
            console.log(`📋 Добавление в очередь: ${type.toUpperCase()} ${taskId}`);
            
            // Если это DELETE операция, отметить что задача была локально удалена
            if (type === 'delete') {
                locallyDeletedTaskIds.add(taskId);
                console.log(`🗑️ Задача ${taskId} отмечена как локально удаленная`);
            }
            
            // Добавить в очередь
            await OfflineQueue.addOperation({
                type,
                taskId,
                task,
                timestamp: new Date().toISOString()
            });

            console.log(`✓ Операция добавлена в очередь`);

            // Если онлайн — сразу попробовать синхронизировать
            if (isOnline) {
                console.log(`🔄 Попытка синхронизировать очередь...`);
                processQueue();
            } else {
                console.log(`📴 Нет интернета, очередь будет обработана при подключении`);
            }
        } catch (error) {
            console.error('Ошибка добавления в очередь:', error);
            emitEvent(EVENTS.SYNC_ERROR, { message: error.message });
        }
    }

    /**
     * Обработать очередь: отправить все операции в облако
     * Запускается при возврате в сеть или после сохранения задачи онлайн
     */
    async function processQueue() {
        // Проверить готовность
        if (!isOnline) {
            console.log('📴 Нет интернета, очередь будет обработана позже');
            return;
        }

        if (isSyncing) {
            return;
        }

        if (!firebaseDb) {
            console.log('💾 Firebase недоступен. Приложение работает в режиме offline-only. Данные хранятся локально.');
            return;
        }

        isSyncing = true;
        emitEvent(EVENTS.SYNC_STARTED);

        try {
            const operations = await OfflineQueue.getAllOperations();
            
            if (operations.length === 0) {
                isSyncing = false;
                emitEvent(EVENTS.SYNC_COMPLETED, { count: 0 });
                return;
            }

            console.log(`📤 Синхронизация ${operations.length} операций с Firebase...`);

            // Обработать операции по порядку
            for (const operation of operations) {
                try {
                    if (operation.type === 'save') {
                        await syncTaskToCloud(operation.task);
                    } else if (operation.type === 'delete') {
                        await deleteTaskFromCloud(operation.taskId);
                    }

                    // Удалить операцию из очереди после успеха
                    await OfflineQueue.removeOperation(operation.id);
                    console.log(`✓ Операция ${operation.id} (${operation.type}) удалена из очереди`);
                } catch (error) {
                    // Операция не прошла, но не удаляем её из очереди
                    // Она будет обработана при следующей синхронизации
                    console.error(`❌ Ошибка обработки операции ${operation.id} (${operation.type}):`, error);
                }
            }

            isSyncing = false;
            const queueCount = await OfflineQueue.getCount();
            if (queueCount === 0) {
                console.log('✅ Все операции синхронизированы');
            } else {
                console.log(`⏳ В очереди осталось ${queueCount} операций`);
            }
            emitEvent(EVENTS.SYNC_COMPLETED, { count: queueCount });
        } catch (error) {
            isSyncing = false;
            console.error('❌ Ошибка обработки очереди:', error);
            emitEvent(EVENTS.SYNC_ERROR, { message: error.message });
        }
    }

    /**
     * Отправить задачу в облако
     */
    async function syncTaskToCloud(task) {
        // Проверить, готов ли Firebase
        if (!firebaseDb) {
            console.warn('⚠️ Firebase не готов, пропускаем синхронизацию задачи', task.id);
            return; // Не блокируем, просто пропускаем
        }

        return new Promise((resolve, reject) => {
            try {
                firebaseDb.ref(`tasks/${task.id}`).set(task, (error) => {
                    if (error) {
                        console.error(`❌ Ошибка синхронизации задачи ${task.id}:`, error);
                        reject(error);
                    } else {
                        console.log(`✓ Задача ${task.id} синхронизирована`);
                        resolve();
                    }
                });
            } catch (error) {
                console.error(`❌ Исключение при синхронизации ${task.id}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Удалить задачу из облака
     */
    async function deleteTaskFromCloud(taskId) {
        // Проверить, готов ли Firebase
        if (!firebaseDb) {
            console.warn('⚠️ Firebase не готов, пропускаем удаление задачи', taskId);
            return; // Не блокируем, просто пропускаем
        }

        return new Promise((resolve, reject) => {
            try {
                firebaseDb.ref(`tasks/${taskId}`).remove((error) => {
                    if (error) {
                        console.error(`❌ Ошибка удаления задачи ${taskId}:`, error);
                        reject(error);
                    } else {
                        console.log(`✓ Задача ${taskId} удалена с облака`);
                        // Убрать из отслеживания локально удаленных (DELETE синхронизирована)
                        locallyDeletedTaskIds.delete(taskId);
                        console.log(`✓ Задача ${taskId} больше не отмечена как локально удаленная`);
                        resolve();
                    }
                });
            } catch (error) {
                console.error(`❌ Исключение при удалении ${taskId}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Явно синхронизировать всё с облаком
     * Используется при инициализации
     */
    /**
     * Синхронизация с облаком Firebase
     * С timeout 10 секунд - если Firebase не отвечает, отменяем операцию
     */
    async function syncWithCloud() {
        if (!firebaseDb || !isOnline) {
            return;
        }

        // Добавить timeout 10 секунд
        return Promise.race([
            (async () => {
                try {
                    const snapshot = await firebaseDb.ref('tasks').once('value');
                    const cloudTasks = Object.values(snapshot.val() || {});
                    console.log(`✅ Загружено ${cloudTasks.length} задач с облака`);
                    await mergeCloudTasks(cloudTasks);
                    emitEvent(EVENTS.TASKS_SYNCED, { tasks: cloudTasks });
                } catch (error) {
                    // Не выбрасываем ошибку - приложение работает локально
                    console.warn('⚠️ Ошибка синхронизации с облаком:', error.message);
                    emitEvent(EVENTS.SYNC_ERROR, { message: error.message });
                }
            })(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 10000)
            )
        ]).catch(error => {
            if (error.message === 'Timeout') {
                console.log('💾 Firebase недоступен, приложение работает локально');
            }
        });
    }

    /**
     * Слушатель изменений состояния сети
     */
    function initNetworkListeners() {
        window.addEventListener('online', () => {
            isOnline = true;
            console.log('🌐 Интернет подключён');
            emitEvent(EVENTS.STATUS_CHANGED, { online: true });

            // Попробовать обработать очередь
            processQueue();
        });

        window.addEventListener('offline', () => {
            isOnline = false;
            console.log('📴 Интернет отключён');
            emitEvent(EVENTS.STATUS_CHANGED, { online: false });
        });

        // Проверить начальное состояние каждые 5 секунд
        setInterval(checkConnection, 5000);
    }

    /**
     * Проверить подключение (иногда navigator.onLine может не обновиться вовремя)
     */
    function checkConnection() {
        const actualOnline = navigator.onLine;
        if (actualOnline !== isOnline) {
            isOnline = actualOnline;
            const eventName = actualOnline ? 'online' : 'offline';
            window.dispatchEvent(new Event(eventName));
        }
    }

    /**
     * Испустить событие для UI
     */
    function emitEvent(eventName, detail = {}) {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    /**
     * Получить текущее состояние сети
     */
    function getStatus() {
        return {
            online: isOnline,
            syncing: isSyncing,
            firebaseEnabled: FIREBASE_ENABLED,
            firebaseReady: firebaseDb !== null
        };
    }

    /**
     * Получить количество операций в очереди
     */
    async function getQueueSize() {
        return await OfflineQueue.getCount();
    }

    // Публичное API
    return {
        init,
        queueOperation,
        processQueue,
        getStatus,
        getQueueSize,
        EVENTS,
        // Экспортировать для использования в DB
        mergeCloudTasks,
        emitEvent
    };
})();
