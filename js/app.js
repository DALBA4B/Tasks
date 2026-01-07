/**
 * Main Application
 * Инициализация и управление приложением
 */

const App = (() => {
    /**
     * Инициализация приложения
     */
    async function init() {
        console.log('🚀 Инициализация приложения...');

        try {
            // 0. Инициализировать автоматическое расширение textarea
            TextareaAutosize.init();

            // 0. Инициализировать автоматическое расширение textarea
            TextareaAutosize.init();

            // 1. Инициализировать базу данных (IndexedDB + Firebase)
            await DB.init();

            // 2. Загрузить задачи
            const tasks = await DB.getAllTasks();
            UI.setAllTasks(tasks);

            // 3. Инициализировать обработчики событий
            Handlers.init();

            // 4. Отрендерить начальное состояние
            UI.renderTasks();

            // 5. Слушать обновления задач (для синхронизации с Firebase)
            window.addEventListener('tasksUpdated', handleTasksUpdated);

            console.log('✅ Приложение инициализировано');
        } catch (error) {
            console.error('❌ Ошибка инициализации:', error);
        }
    }

    /**
     * Обработчик обновления задач (из Firebase)
     */
    async function handleTasksUpdated(event) {
        const tasks = event.detail;
        UI.setAllTasks(tasks);
        UI.renderTasks();
        console.log('📡 Задачи обновлены из Firebase');
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
