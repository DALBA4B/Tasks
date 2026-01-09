/**
 * Task Model
 * Логика работы с задачами и вычисление цветов
 */

const Task = (() => {
    /**
     * Генерация UUID
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Создать новую задачу
     */
    function create(title, description = '', deadline = null, priority = null) {
        const now = new Date().toISOString();
        return {
            id: generateUUID(),
            title: title.trim(),
            description: description.trim(),
            deadline: deadline || null,
            priority: priority || null,
            status: 'normal',
            created_at: now,
            in_work_at: null,
            completed_at: null,
            updated_at: now,
            returned_from_archive: false
        };
    }

    /**
     * Обновить поле updated_at
     */
    function updateTimestamp(task) {
        task.updated_at = new Date().toISOString();
        return task;
    }

    /**
     * Перейти в статус "В работе"
     */
    function startWork(task) {
        task.status = 'in_work';
        task.in_work_at = new Date().toISOString();
        return updateTimestamp(task);
    }

    /**
     * Перейти в статус "Выполнена"
     */
    function complete(task) {
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        return updateTimestamp(task);
    }

    /**
     * Отправить в архив
     */
    function archive(task) {
        task.status = 'archived';
        return updateTimestamp(task);
    }

    /**
     * Вернуть из архива
     */
    function restore(task) {
        task.status = 'normal';
        task.returned_from_archive = true;
        return updateTimestamp(task);
    }

    /**
     * Выйти из работы (вернуться в нормальный статус)
     */
    function exitWork(task) {
        task.status = 'normal';
        task.in_work_at = null;
        return updateTimestamp(task);
    }

    /**
     * Вычислить цвет задачи по дедлайну
     * Логика:
     * - Если задача возвращена из архива → Фиолетовый (приоритет)
     * - Если нет дедлайна → Белый
     * - Дедлайн прошёл → Чёрный
     * - Дедлайн сегодня → Красный
     * - Завтра → Оранжевый
     * - Через 2 дня → Жёлтый
     * - Через 3 дня → Светло-жёлтый
     * - Через 4+ дней → Серый
     */
    function getColor(task) {
        // Фиолетовый имеет наивысший приоритет
        if (task.returned_from_archive) {
            return 'purple';
        }

        // Белый, если нет дедлайна
        if (!task.deadline) {
            return 'white';
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadline = new Date(task.deadline);
        deadline.setHours(0, 0, 0, 0);

        const diffTime = deadline - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'black';      // Дедлайн прошёл
        if (diffDays === 0) return 'red';      // Дедлайн сегодня
        if (diffDays === 1) return 'orange';   // Завтра
        if (diffDays === 2) return 'yellow';   // Через 2 дня
        if (diffDays === 3) return 'light-yellow'; // Через 3 дня
        return 'gray';                         // Через 4+ дней
    }

    /**
     * Получить информацию о приоритете
     */
    function getPriorityInfo(priority) {
        const priorityMap = {
            high: { text: 'Высокий', class: 'badge-high' },
            medium: { text: 'Средний', class: 'badge-medium' },
            low: { text: 'Низкий', class: 'badge-low' }
        };
        return priorityMap[priority] || null;
    }

    /**
     * Форматировать дату для отображения
     */
    function formatDate(dateString) {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('ru-RU');
    }

    /**
     * Преобразовать дату в формат для datetime-local input
     */
    function toDatetimeLocalFormat(isoString) {
        if (!isoString) return '';
        return isoString.slice(0, 16);
    }

    /**
     * Преобразовать значение datetime-local в ISO формат
     */
    function fromDatetimeLocalFormat(datetimeLocal) {
        if (!datetimeLocal) return null;
        return new Date(datetimeLocal).toISOString();
    }

    // Публичное API
    return {
        create,
        updateTimestamp,
        startWork,
        exitWork,
        complete,
        archive,
        restore,
        getColor,
        getPriorityInfo,
        formatDate,
        toDatetimeLocalFormat,
        fromDatetimeLocalFormat
    };
})();
