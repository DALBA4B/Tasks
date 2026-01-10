/**
 * Textarea Autosize Module
 * Автоматическое расширение textarea при вводе текста
 */

const TextareaAutosize = (() => {
    let mutationObserver = null;
    let processedTextareas = new Set();

    /**
     * Инициализировать автоматическое расширение
     */
    function init() {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            attachAutosize(textarea);
        });

        // Слушать новые textarea (в модальном окне)
        observeNewTextareas();
    }

    /**
     * Привязать автоизменение размера к конкретному textarea
     */
    function attachAutosize(textarea) {
        // Не привязывать дважды
        if (processedTextareas.has(textarea)) return;
        processedTextareas.add(textarea);
        
        // Убрать старые обработчики если были
        textarea.removeEventListener('input', handleInput);
        textarea.addEventListener('input', handleInput);
        
        // Установить начальный размер
        resize(textarea);
    }

    /**
     * Обработчик input события
     */
    function handleInput(e) {
        resize(e.target);
    }

    /**
     * Изменить высоту textarea
     */
    function resize(textarea) {
        // Сбросить высоту чтобы получить правильный scrollHeight
        textarea.style.height = 'auto';
        // Установить высоту равной контенту
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    /**
     * Очистить набор обработанных textarea (предотвращает утечку памяти при многократном открытии модалей)
     */
    function clearProcessedTextareas() {
        processedTextareas.clear();
    }

    /**
     * Наблюдать за добавлением новых textarea (при открытии модала)
     */
    function observeNewTextareas() {
        mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            const textareas = node.querySelectorAll('textarea');
                            textareas.forEach(textarea => {
                                attachAutosize(textarea);
                            });
                        }
                    });
                }
            });
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Публичное API
    return {
        init,
        attachAutosize,
        clearProcessedTextareas
    };
})();
