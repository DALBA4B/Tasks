/**
 * Event Handlers Module
 * Обработка всех событий приложения
 */

const Handlers = (() => {
    /**
     * Инициализировать все слушатели событий
     */
    function init() {
        initNavTabs();
        initAddTaskButton();
        initCreateForm();
        initEditForm();
        initModalControls();
        initTaskActions();
    }

    /**
     * Инициализировать обработчики вкладок навигации
     */
    function initNavTabs() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', handleTabClick);
        });
    }

    /**
     * Обработчик клика на вкладку
     */
    function handleTabClick(e) {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        UI.setCurrentTab(e.target.dataset.tab);
        UI.renderTasks();
    }

    /**
     * Инициализировать кнопку добавления задачи
     */
    function initAddTaskButton() {
        document.getElementById('btnAddTask').addEventListener('click', handleAddTaskButtonClick);
    }

    /**
     * Обработчик клика на кнопку добавления задачи
     */
    function handleAddTaskButtonClick() {
        UI.openCreateModal();
    }

    /**
     * Инициализировать форму создания задачи
     */
    function initCreateForm() {
        document.getElementById('createForm').addEventListener('submit', handleCreateTask);
    }

    /**
     * Обработчик отправки формы создания задачи
     */
    async function handleCreateTask(e) {
        e.preventDefault();

        try {
            const title = document.getElementById('createTitle').value;
            const description = document.getElementById('createDescription').value;
            const deadline = document.getElementById('createDeadline').value;
            const priority = document.getElementById('createPriority').value;

            const newTask = Task.create(title, description, deadline, priority);
            console.log('[CREATE] ID:', newTask.id, 'Title:', newTask.title);
            
            await DB.saveTask(newTask);
            console.log('[CREATE] Сохранена в DB');

            UI.closeCreateModal();
            await loadAndRenderTasks();
            console.log('[CREATE] Отрендерена');
        } catch (error) {
            console.error('Ошибка создания задачи:', error);
            window.showAppNotification('❌ Ошибка: не удалось создать задачу', 'error');
        }
    }

    /**
     * Инициализировать форму редактирования
     */
    function initEditForm() {
        document.getElementById('editForm').addEventListener('submit', handleEditTask);
    }

    /**
     * Обработчик отправки формы редактирования
     */
    async function handleEditTask(e) {
        e.preventDefault();

        try {
            const taskId = UI.getEditingTaskId();
            if (!taskId) return;

            const tasks = UI.getAllTasks();
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;

            const newTitle = document.getElementById('editTitle').value.trim();
            if (!newTitle) {
                window.showAppNotification('⚠️ Название обязательно', 'info');
                return;
            }

            task.title = newTitle;
            task.description = document.getElementById('editDescription').value.trim();
            task.deadline = document.getElementById('editDeadline').value || null;
            task.priority = document.getElementById('editPriority').value || null;
            task.status = document.getElementById('editStatus').value;
            task.created_at = Task.fromDatetimeLocalFormat(document.getElementById('editCreatedAt').value) || task.created_at;
            task.in_work_at = Task.fromDatetimeLocalFormat(document.getElementById('editInWorkAt').value);
            task.completed_at = Task.fromDatetimeLocalFormat(document.getElementById('editCompletedAt').value);

            Task.updateTimestamp(task);
            await DB.saveTask(task);

            UI.closeEditModal();
            await loadAndRenderTasks();
        } catch (error) {
            console.error('Ошибка редактирования задачи:', error);
            window.showAppNotification('❌ Ошибка: не удалось отредактировать задачу', 'error');
        }
    }

    /**
     * Инициализировать управление модальными окнами
     */
    function initModalControls() {
        // Функция закрытия модального окна по клику на backdrop
        const attachBackdropListener = (modalId, closeCallback) => {
            document.getElementById(modalId).addEventListener('click', (e) => {
                if (e.target === document.getElementById(modalId)) {
                    closeCallback();
                }
            });
        };

        // Edit modal
        document.getElementById('modalClose').addEventListener('click', UI.closeEditModal);
        document.getElementById('cancelEdit').addEventListener('click', UI.closeEditModal);
        attachBackdropListener('editModal', UI.closeEditModal);

        // Create modal
        document.getElementById('createModalClose').addEventListener('click', UI.closeCreateModal);
        document.getElementById('cancelCreate').addEventListener('click', UI.closeCreateModal);
        attachBackdropListener('createModal', UI.closeCreateModal);

        // Confirm delete modal
        document.getElementById('cancelDeleteBtn').addEventListener('click', UI.closeConfirmDeleteModal);
        attachBackdropListener('confirmDeleteModal', UI.closeConfirmDeleteModal);

        // Confirm complete modal
        document.getElementById('cancelCompleteBtn').addEventListener('click', UI.closeConfirmCompleteModal);
        attachBackdropListener('confirmCompleteModal', UI.closeConfirmCompleteModal);
    }

    /**
     * Инициализировать обработчики действий над задачами
     */
    function initTaskActions() {
        document.addEventListener('click', handleTaskAction);
    }



    /**
     * Обработчик действий над задачей
     */
    async function handleTaskAction(e) {
        if (!e.target.dataset.action) return;

        const id = e.target.dataset.id;
        const action = e.target.dataset.action;
        const tasks = UI.getAllTasks();
        const task = tasks.find(t => t.id === id);

        if (!task) return;

        switch (action) {
            case 'work':
                Task.startWork(task);
                await DB.saveTask(task);
                await loadAndRenderTasks();
                break;

            case 'exit-work':
                Task.exitWork(task);
                await DB.saveTask(task);
                await loadAndRenderTasks();
                break;

            case 'complete':
                UI.openConfirmCompleteModal(async () => {
                    Task.complete(task);
                    await DB.saveTask(task);
                    // Небольшая задержка для анимации
                    await new Promise(resolve => setTimeout(resolve, 500));
                    Task.archive(task);
                    await DB.saveTask(task);
                    await loadAndRenderTasks();
                    UI.closeConfirmCompleteModal();
                });
                break;

            case 'restore':
                Task.restore(task);
                await DB.saveTask(task);
                await loadAndRenderTasks();
                break;

            case 'edit':
                UI.openEditModal(task);
                break;

            case 'delete':
                UI.openConfirmDeleteModal(async () => {
                    try {
                        await DB.removeTask(task.id);
                        await loadAndRenderTasks();
                        UI.closeConfirmDeleteModal();
                    } catch (error) {
                        console.error('Ошибка при удалении задачи:', error);
                        window.showAppNotification('❌ Ошибка: не удалось удалить задачу', 'error');
                    }
                });
                break;
        }
    }

    /**
     * Загрузить все задачи и отрендерить
     */
    async function loadAndRenderTasks() {
        const tasks = await DB.getAllTasks();
        UI.setAllTasks(tasks);
        UI.renderTasks();
    }

    // Публичное API
    return {
        init,
        loadAndRenderTasks
    };
})();
