const CACHE_NAME = 'pdf-app-cache-v4'; // 🔁 버전 올려서 예전 캐시 무효화

// HTML 말고, 진짜 "정적 리소스"만 선캐싱
const PRECACHE = [
  './',
  './manifest.json',
  './pdfjs/viewer.html',
  './pdfjs/viewer.css',
  './pdfjs/app.js'
  // 주의: ./index.html 이나 개별 PDF 는 여기서 빼둡니다 (네트워크 우선으로 처리할 거라서)
];

// 설치 시: 정적 리소스 캐싱 + 즉시 활성화 준비
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting(); // 새 SW가 바로 대기 상태로 넘어가도록
});

// 활성화 시: 이전 캐시들 정리 + 클라이언트 장악
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// 요청 가로채기
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 🔹 외부 도메인(YouTube 등)은 SW가 건드리지 않고 네트워크에 맡김
  if (url.origin !== self.location.origin) {
    return; // 그냥 브라우저 기본 동작(네트워크)으로 처리
  }

  // 1) HTML, PDF 는 "네트워크 우선" 전략
  const isHtmlRequest =
    request.mode === 'navigate' || url.pathname.endsWith('.html');
  const isPdfRequest = url.pathname.endsWith('.pdf');

  if (isHtmlRequest || isPdfRequest) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2) 나머지 파일(CSS/JS/폰트/이미지 등)은 "캐시 우선"
  event.respondWith(cacheFirst(request));
});

// 네트워크 우선: 항상 서버에서 먼저 받아보고, 실패하면 캐시 사용
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    // 성공하면 캐시에 최신 버전 저장
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // 오프라인/실패 시 캐시 사용
    const cached = await cache.match(request);
    if (cached) return cached;

    // 네비게이션 요청인데 ./ 캐시가 있으면 fallback
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// 캐시 우선: 캐시 있으면 그거, 없으면 네트워크 + 캐시에 저장
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(CACHE_NAME);
  const networkResponse = await fetch(request);

  if (networkResponse && networkResponse.status === 200) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}
