/**
 * UI Module
 * Рендеринг интерфейса
 */

const UI = (() => {
    let currentTab = 'active';
    let allTasks = [];
    let editingTaskId = null;

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
     * Отсортировать задачи по приоритету и статусу
     * Порядок:
     * 1. Высокий приоритет (high)
     * 2. Средний приоритет (medium)
     * 3. Низкий приоритет (low)
     * 4. Без приоритета
     * 5. Возвращённые из архива в конце
     */
    function sortTasks(tasks) {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        
        return tasks.sort((a, b) => {
            // Сначала возвращённые из архива в конец
            if (a.returned_from_archive && !b.returned_from_archive) return 1;
            if (!a.returned_from_archive && b.returned_from_archive) return -1;
            
            // Потом по приоритету
            const priorityA = priorityOrder[a.priority] ?? 3; // 3 = без приоритета
            const priorityB = priorityOrder[b.priority] ?? 3;
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // Если приоритет одинаковый — по времени создания (новые первыми)
            return new Date(b.created_at) - new Date(a.created_at);
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
            // Если была в работе (in_work_at установлена) — показать кнопку выхода
            if (task.in_work_at) {
                statusButtons += `<button class="btn-work" data-id="${task.id}" data-action="exit-work">Из работы</button>`;
            } else if (task.status !== 'completed') {
                // Иначе если не завершена — показать кнопку входа в работу
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
                ${task.description ? `<div class="task-description">${escapeHtml(task.description).replace(/\n/g, '<br>')}</div>` : ''}
                <div class="task-meta">
                    ${task.deadline ? `<div class="task-meta-item" data-meta-type="deadline">📅 ${Task.formatDate(task.deadline)}</div>` : ''}
                    <div class="task-meta-item" data-meta-type="created">➕ ${Task.formatDate(task.created_at)}</div>
                    ${task.in_work_at ? `<div class="task-meta-item" data-meta-type="in-work">🔧 ${Task.formatDate(task.in_work_at)}</div>` : ''}
                    ${task.completed_at ? `<div class="task-meta-item" data-meta-type="completed">✅ ${Task.formatDate(task.completed_at)}</div>` : ''}
                </div>
                <div class="task-actions">
                    ${actions}
                </div>
            </div>
        `;
    }

    /**
     * Отрендерить все задачи
     */
    function renderTasks() {
        const container = document.getElementById('tasksContainer');
        if (!container) {
            console.warn('tasksContainer не найден!');
            return;
        }

        const filteredTasks = getFilteredTasks();
        const sortedTasks = sortTasks([...filteredTasks]);

        if (sortedTasks.length === 0) {
            container.innerHTML = '<div class="empty-state">Нет задач</div>';
            return;
        }

        const newHTML = sortedTasks.map(task => renderTaskCard(task)).join('');
        container.innerHTML = newHTML;
        
        // Инициализировать autosize для новых textarea
        setTimeout(() => TextareaAutosize.init(), 0);
    }

    /**
     * Обновить одну карточку задачи в DOM (без перерисовки всех)
     */
    function updateTaskCard(taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const cardElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!cardElement) {
            // Если карточка не найдена (например, может быть скрыта фильтром), перерисовать всё
            renderTasks();
            return;
        }

        console.log('📌 updateTaskCard: обновление ТОЛЬКО блока .task-meta');
        
        // Обновить только блок с метаинформацией (датами)
        const metaBlock = cardElement.querySelector('.task-meta');
        if (metaBlock) {
            // НЕ перерендерим дату создания, а только добавляем новую дату входа в работу
            // Проверяем есть ли уже дата входа в работу
            const existingInWorkItem = metaBlock.querySelector('[data-meta-type="in-work"]');
            
            let needsAnimation = false;
            
            if (task.in_work_at && !existingInWorkItem) {
                // Добавляем новый элемент с датой входа в работу после даты создания
                const createdAtItem = metaBlock.querySelector('[data-meta-type="created"]');
                if (createdAtItem) {
                    const newItem = document.createElement('div');
                    newItem.className = 'task-meta-item';
                    newItem.setAttribute('data-meta-type', 'in-work');
                    newItem.innerHTML = `🔧 ${Task.formatDate(task.in_work_at)}`;
                    createdAtItem.insertAdjacentElement('afterend', newItem);
                }
            } else if (task.in_work_at && existingInWorkItem) {
                // Обновляем существующую дату входа в работу
                existingInWorkItem.innerHTML = `🔧 ${Task.formatDate(task.in_work_at)}`;
            } else if (!task.in_work_at && existingInWorkItem) {
                // Удаляем дату входа в работу если её больше нет
                existingInWorkItem.remove();
            }
        }
        
        // Обновить кнопки (статус может измениться)
        const actionsBlock = cardElement.querySelector('.task-actions');
        if (actionsBlock) {
            let actions = '';
            if (task.status === 'archived') {
                actions = `
                    <button class="btn-restore" data-id="${task.id}" data-action="restore">Вернуть</button>
                    <button class="btn-edit" data-id="${task.id}" data-action="edit">Изменить</button>
                    <button class="btn-delete" data-id="${task.id}" data-action="delete">Удалить</button>
                `;
            } else {
                let statusButtons = '';
                // Если была в работе (in_work_at установлена) — показать кнопку выхода
                if (task.in_work_at) {
                    statusButtons += `<button class="btn-work" data-id="${task.id}" data-action="exit-work">Из работы</button>`;
                } else if (task.status !== 'completed') {
                    // Иначе если не завершена — показать кнопку входа в работу
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
            actionsBlock.innerHTML = actions;
        }
        
        // Обновить класс in-work
        if (task.in_work_at && !cardElement.classList.contains('in-work')) {
            cardElement.classList.add('in-work');
        } else if (!task.in_work_at && cardElement.classList.contains('in-work')) {
            cardElement.classList.remove('in-work');
        }
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
            // Сбросить высоту перед инициализацией
            editDescriptionTextarea.style.height = 'auto';
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
        // Очистить обработанные textarea чтобы избежать утечки памяти
        if (TextareaAutosize && TextareaAutosize.clearProcessedTextareas) {
            TextareaAutosize.clearProcessedTextareas();
        }
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
            // Сбросить высоту перед инициализацией
            createDescriptionTextarea.style.height = 'auto';
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
        // Очистить обработанные textarea чтобы избежать утечки памяти
        if (TextareaAutosize && TextareaAutosize.clearProcessedTextareas) {
            TextareaAutosize.clearProcessedTextareas();
        }
    }

    /**
     * Открыть модальное окно подтверждения удаления
     */
    function openConfirmDeleteModal(callback) {
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        const savedHandler = () => callback().then(() => {
            closeConfirmDeleteModal();
        });
        confirmDeleteBtn.onclick = savedHandler;
        document.getElementById('confirmDeleteModal').classList.add('active');
    }

    /**
     * Закрыть модальное окно подтверждения удаления
     */
    function closeConfirmDeleteModal() {
        document.getElementById('confirmDeleteModal').classList.remove('active');
    }

    /**
     * Открыть модальное окно подтверждения завершения
     */
    function openConfirmCompleteModal(callback) {
        const confirmCompleteBtn = document.getElementById('confirmCompleteBtn');
        const savedHandler = () => callback().then(() => {
            closeConfirmCompleteModal();
        });
        confirmCompleteBtn.onclick = savedHandler;
        document.getElementById('confirmCompleteModal').classList.add('active');
    }

    /**
     * Закрыть модальное окно подтверждения завершения
     */
    function closeConfirmCompleteModal() {
        document.getElementById('confirmCompleteModal').classList.remove('active');
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
        updateTaskCard,
        openEditModal,
        closeEditModal,
        openCreateModal,
        closeCreateModal,
        openConfirmDeleteModal,
        closeConfirmDeleteModal,
        openConfirmCompleteModal,
        closeConfirmCompleteModal
    };
})();
