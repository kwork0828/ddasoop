/* ============================================
   따숲 (ddasoop) - sw.js (서비스워커)

   - 앱 화면 파일을 기기에 저장해 인터넷이 없어도 열리게 합니다.
   - /api/ 요청은 절대 저장하지 않습니다 (개인 기록이 캐시에 남지 않도록).
   - 배포할 때 VERSION 을 올리면 사용자 화면에 "업데이트" 버튼이 뜹니다.
   ============================================ */

const VERSION = "2026-10-12.1";
const CACHE = "ddasoop-" + VERSION;

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/style.css",
  "/js/data.js",
  "/js/verses.js",
  "/js/fallback.js",
  "/js/storage.js",
  "/js/app.js",
  "/js/ai.js",
  "/js/behavior.js",
  "/js/backup.js",
  "/js/pwa.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 하나라도 실패하면 설치를 멈춰서, 반쪽짜리 앱이 저장되지 않게 한다
      return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); }));
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("ddasoop-") === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function networkFirstPage(request) {
  return new Promise(function (resolve) {
    let settled = false;
    const timer = setTimeout(function () {
      // 느린 망에서는 3초 뒤 저장된 화면으로
      caches.match("/index.html").then(function (cached) {
        if (cached && !settled) { settled = true; resolve(cached); }
      });
    }, 3000);

    fetch(request).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("/index.html", copy); });
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      caches.match("/index.html").then(function (cached) {
        if (!settled) {
          settled = true;
          resolve(cached || new Response("오프라인입니다. 인터넷 연결 후 다시 열어 주세요.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
          }));
        }
      });
    });
  });
}

/* 저장된 파일을 바로 보여주고, 뒤에서 새 파일로 갈아 둔다(stale-while-revalidate).
   VERSION 올리는 걸 깜빡해도 다음 실행 때는 새 파일이 쓰인다. */
function staleWhileRevalidate(event, request) {
  return caches.match(request, { ignoreSearch: true }).then(function (cached) {
    const fresh = fetch(request).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(request, copy); });
      }
      return res;
    }).catch(function () { return cached; });

    if (cached) {
      event.waitUntil(fresh.then(function () {}, function () {}));
      return cached;
    }
    return fresh;
  });
}

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, req));
});
