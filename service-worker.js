const CACHE_NAME = 'task-manager-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/colors.css',
  '/js/app.js',
  '/js/autosize.js',
  '/js/config.js',
  '/js/db.js',
  '/js/handlers.js',
  '/js/offline-queue.js',
  '/js/storage-manager.js',
  '/js/sync-engine.js',
  '/js/task.js',
  '/js/ui.js'
];

// Установка service worker и кэширование ресурсов
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Активация и удаление старых кэшей
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Стратегия: сначала кэш, потом сеть (Cache First)
// Для статических ресурсов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Игнорируем запросы к Firebase и другим внешним сервисам
  if (url.hostname !== self.location.hostname) {
    return;
  }

  // Для HTML - Network First (для обновлений)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Кэшируем успешный ответ
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          // Если сеть не доступна, используем кэш
          return caches.match(event.request);
        })
    );
    return;
  }

  // Для остальных ресурсов - Cache First
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        // Кэшируем успешные ответы
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});

// Оптимизация для mobile - убираем задержку 300ms при touch
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
