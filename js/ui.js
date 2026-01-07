/**
 * UI Module
 * Рендеринг интерфейса
 */

const UI = (() => {
    let currentTab = 'active';
    let allTasks = [];
    let editingTaskId = null;
    
    // Callback storage вместо window объекта
    let callbackStorage = {
        delete: null,
        complete: null
    };

    /**
     * Установить текущую вкладку
     */
    function setCurrentTab(tab) {
        currentTab = tab;
    }

    /**
     * Получить текущую вкладку
     */
    function getCurrentTab() {
        return currentTab;
    }

    /**
     * Установить редактируемую задачу
     */
    function setEditingTaskId(id) {
        editingTaskId = id;
    }

    /**
     * Получить редактируемую задачу
     */
    function getEditingTaskId() {
        return editingTaskId;
    }

    /**
     * Установить все задачи
     */
    function setAllTasks(tasks) {
        allTasks = tasks;
    }

    /**
     * Получить все задачи
     */
    function getAllTasks() {
        return allTasks;
    }

    /**
     * Отфильтровать задачи по текущей вкладке
     */
    function getFilteredTasks() {
        if (currentTab === 'active') {
            return allTasks.filter(task => task.status !== 'archived');
        } else {
            return allTasks.filter(task => task.status === 'archived');
        }
    }

    /**
     * Отсортировать задачи (возвращённые из архива внизу)
     */
    function sortTasks(tasks) {
        return tasks.sort((a, b) => {
            if (a.returned_from_archive && !b.returned_from_archive) return 1;
            if (!a.returned_from_archive && b.returned_from_archive) return -1;
            return 0;
        });
    }

    /**
     * Экранировать HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Создать HTML задачи
     */
    function renderTaskCard(task) {
        const color = Task.getColor(task);
        const priority = Task.getPriorityInfo(task.priority);
        const inWorkClass = task.status === 'in_work' ? 'in-work' : '';

        let actions = '';
        if (task.status === 'archived') {
            actions = `
                <button class="btn-restore" data-id="${task.id}" data-action="restore">Вернуть</button>
                <button class="btn-edit" data-id="${task.id}" data-action="edit">Изменить</button>
                <button class="btn-delete" data-id="${task.id}" data-action="delete">Удалить</button>
            `;
        } else {
            let statusButtons = '';
            if (task.status !== 'in_work') {
                statusButtons += `<button class="btn-work" data-id="${task.id}" data-action="work">В работу</button>`;
            }
            if (task.status !== 'completed') {
                statusButtons += `<button class="btn-complete" data-id="${task.id}" data-action="complete">Готово</button>`;
            }
            actions = `
                ${statusButtons}
                <button class="btn-edit" data-id="${task.id}" data-action="edit">Изменить</button>
                <button class="btn-delete" data-id="${task.id}" data-action="delete">Удалить</button>
            `;
        }

        return `
            <div class="task-card ${color} ${inWorkClass}" data-task-id="${task.id}">
                <div class="task-header">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    ${priority ? `<div class="task-badge ${priority.class}">${priority.text}</div>` : ''}
                </div>
                ${task.description ? `<div class="task-description"></div>` : ''}
                <div class="task-meta">
                    ${task.deadline ? `<div class="task-meta-item">📅 ${Task.formatDate(task.deadline)}</div>` : ''}
                    <div class="task-meta-item">➕ ${Task.formatDate(task.created_at)}</div>
                    ${task.in_work_at ? `<div class="task-meta-item">🔧 ${Task.formatDate(task.in_work_at)}</div>` : ''}
                    ${task.completed_at ? `<div class="task-meta-item">✅ ${Task.formatDate(task.completed_at)}</div>` : ''}
                </div>
                <div class="task-actions">
                    ${actions}
                </div>
            </div>
        `;
    }

    /**
     * Заполнить описание задачи с сохранением переносов строк
     */
    function fillTaskDescription(cardElement, description) {
        if (!description) return;
        
        const descElement = cardElement.querySelector('.task-description');
        if (descElement) {
            descElement.textContent = description;
        }
    }

    /**
     * Отрендерить все задачи
     */
    function renderTasks() {
        const container = document.getElementById('tasksContainer');
        if (!container) return;

        const filteredTasks = getFilteredTasks();
        const sortedTasks = sortTasks([...filteredTasks]);

        if (sortedTasks.length === 0) {
            container.innerHTML = '<div class="empty-state">Нет задач</div>';
            return;
        }

        container.innerHTML = sortedTasks.map(task => renderTaskCard(task)).join('');
        
        // Заполнить описания с сохранением переносов строк
        sortedTasks.forEach(task => {
            const cardElement = container.querySelector(`[data-task-id="${task.id}"]`);
            if (cardElement && task.description) {
                fillTaskDescription(cardElement, task.description);
            }
        });
    }

    /**
     * Открыть модальное окно редактирования
     */
    function openEditModal(task) {
        editingTaskId = task.id;

        document.getElementById('editTitle').value = task.title;
        document.getElementById('editDescription').value = task.description;
        document.getElementById('editDeadline').value = task.deadline || '';
        document.getElementById('editPriority').value = task.priority || '';
        document.getElementById('editStatus').value = task.status;
        document.getElementById('editCreatedAt').value = Task.toDatetimeLocalFormat(task.created_at);
        document.getElementById('editInWorkAt').value = Task.toDatetimeLocalFormat(task.in_work_at);
        document.getElementById('editCompletedAt').value = Task.toDatetimeLocalFormat(task.completed_at);

        document.getElementById('editModal').classList.add('active');
        
        // Инициализировать автоматическое расширение textarea в модальном окне
        setTimeout(() => {
            const editDescriptionTextarea = document.getElementById('editDescription');
            if (editDescriptionTextarea && TextareaAutosize) {
                TextareaAutosize.attachAutosize(editDescriptionTextarea);
            }
        }, 0);
    }

    /**
     * Закрыть модальное окно редактирования
     */
    function closeEditModal() {
        document.getElementById('editModal').classList.remove('active');
        editingTaskId = null;
    }

    /**
     * Открыть модальное окно создания
     */
    function openCreateModal() {
        document.getElementById('createTitle').value = '';
        document.getElementById('createDescription').value = '';
        document.getElementById('createDeadline').value = '';
        document.getElementById('createPriority').value = '';

        document.getElementById('createModal').classList.add('active');
        
        // Инициализировать автоматическое расширение textarea
        setTimeout(() => {
            const createDescriptionTextarea = document.getElementById('createDescription');
            if (createDescriptionTextarea && TextareaAutosize) {
                TextareaAutosize.attachAutosize(createDescriptionTextarea);
            }
        }, 0);
    }

    /**
     * Закрыть модальное окно создания
     */
    function closeCreateModal() {
        document.getElementById('createModal').classList.remove('active');
    }

    /**
     * Открыть модальное окно подтверждения удаления
     */
    function openConfirmDeleteModal(callback) {
        callbackStorage.delete = callback;
        document.getElementById('confirmDeleteModal').classList.add('active');
    }

    /**
     * Закрыть модальное окно подтверждения удаления
     */
    function closeConfirmDeleteModal() {
        document.getElementById('confirmDeleteModal').classList.remove('active');
        callbackStorage.delete = null;
    }

    /**
     * Получить callback удаления
     */
    function getDeleteCallback() {
        return callbackStorage.delete;
    }

    /**
     * Открыть модальное окно подтверждения завершения
     */
    function openConfirmCompleteModal(callback) {
        callbackStorage.complete = callback;
        document.getElementById('confirmCompleteModal').classList.add('active');
    }

    /**
     * Закрыть модальное окно подтверждения завершения
     */
    function closeConfirmCompleteModal() {
        document.getElementById('confirmCompleteModal').classList.remove('active');
        callbackStorage.complete = null;
    }

    /**
     * Получить callback завершения
     */
    function getCompleteCallback() {
        return callbackStorage.complete;
    }

    // Публичное API
    return {
        setCurrentTab,
        getCurrentTab,
        setEditingTaskId,
        getEditingTaskId,
        setAllTasks,
        getAllTasks,
        getFilteredTasks,
        sortTasks,
        renderTasks,
        openEditModal,
        closeEditModal,
        openCreateModal,
        closeCreateModal,
        openConfirmDeleteModal,
        closeConfirmDeleteModal,
        getDeleteCallback,
        openConfirmCompleteModal,
        closeConfirmCompleteModal,
        getCompleteCallback
    };
})();
