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
            console.log('📝 CREATE: добавление новой карточки');
            const title = document.getElementById('createTitle').value;
            const description = document.getElementById('createDescription').value;
            const deadline = document.getElementById('createDeadline').value;
            const priority = document.getElementById('createPriority').value;

            const newTask = Task.create(title, description, deadline, priority);
            await DB.saveTask(newTask);
            UI.closeCreateModal();
            
            // Добавить новую карточку в конец списка (для активной вкладки)
            if (UI.getCurrentTab() === 'active') {
                const allTasks = UI.getAllTasks();
                allTasks.push(newTask);
                UI.setAllTasks(allTasks);
                UI.renderTasks();
            }
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
            console.log('✏️ EDIT: обновление одной карточки');
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
            UI.updateTaskCard(task.id);
        } catch (error) {
            console.error('Ошибка редактирования задачи:', error);
            window.showAppNotification('❌ Ошибка: не удалось отредактировать задачу', 'error');
        }
    }

    /**
     * Инициализировать управление модальными окнами
     */
    function initModalControls() {
        // Функция безопасного добавления слушателя с проверкой элемента
        const safeAddListener = (elementId, event, callback) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener(event, callback);
            } else {
                console.warn(`⚠️ Элемент #${elementId} не найден`);
            }
        };

        // Функция закрытия модального окна по клику на backdrop
        const attachBackdropListener = (modalId, closeCallback) => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        closeCallback();
                    }
                });
            }
        };

        // Edit modal
        safeAddListener('modalClose', 'click', UI.closeEditModal);
        safeAddListener('cancelEdit', 'click', UI.closeEditModal);
        attachBackdropListener('editModal', UI.closeEditModal);

        // Create modal
        safeAddListener('createModalClose', 'click', UI.closeCreateModal);
        safeAddListener('cancelCreate', 'click', UI.closeCreateModal);
        attachBackdropListener('createModal', UI.closeCreateModal);

        // Confirm delete modal
        safeAddListener('cancelDeleteBtn', 'click', UI.closeConfirmDeleteModal);
        attachBackdropListener('confirmDeleteModal', UI.closeConfirmDeleteModal);

        // Confirm complete modal
        safeAddListener('cancelCompleteBtn', 'click', UI.closeConfirmCompleteModal);
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
                console.log('🔧 ACTION: work - обновление одной карточки');
                Task.startWork(task);
                await DB.saveTask(task);
                UI.updateTaskCard(task.id);
                break;

            case 'exit-work':
                console.log('🔧 ACTION: exit-work - обновление одной карточки');
                Task.exitWork(task);
                await DB.saveTask(task);
                UI.updateTaskCard(task.id);
                break;

            case 'complete':
                console.log('🔧 ACTION: complete - полная перезагрузка (из-за архивирования)');
                UI.openConfirmCompleteModal(async () => {
                    Task.complete(task);
                    await DB.saveTask(task);
                    // Анимировать удаление карточки
                    const cardElement = document.querySelector(`[data-task-id="${task.id}"]`);
                    if (cardElement) {
                        cardElement.classList.add('removing');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    Task.archive(task);
                    await DB.saveTask(task);
                    await loadAndRenderTasks();
                    UI.closeConfirmCompleteModal();
                });
                break;

            case 'restore':
                console.log('🔧 ACTION: restore - полная перезагрузка (смена вкладки)');
                Task.restore(task);
                await DB.saveTask(task);
                // Полная перезагрузка т.к. нужно переключить вкладку
                await loadAndRenderTasks();
                break;

            case 'edit':
                console.log('🔧 ACTION: edit - открытие модального окна');
                UI.openEditModal(task);
                break;

            case 'delete':
                console.log('🔧 ACTION: delete - удаление с анимацией');
                UI.openConfirmDeleteModal(async () => {
                    try {
                        await DB.removeTask(task.id);
                        // Удалить карточку из DOM
                        const cardElement = document.querySelector(`[data-task-id="${task.id}"]`);
                        if (cardElement) {
                            cardElement.classList.add('removing');
                            await new Promise(resolve => setTimeout(resolve, 300));
                            cardElement.remove();
                        }
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
