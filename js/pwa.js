/* ============================================
   따숲 (ddasoop) - pwa.js
   폰 홈 화면 설치 · 오프라인 · 업데이트 · 데이터 보존

   - 서비스워커로 앱 화면을 기기에 저장해 인터넷이 없어도 열립니다.
   - 새 버전이 올라오면 "업데이트" 버튼을 보여주고, 누를 때만 바꿉니다
     (기록 중에 화면이 갑자기 새로고침되지 않도록).
   - 브라우저에 "이 사이트 데이터는 지우지 말아 달라"고 요청합니다.
   ============================================ */

(function () {
  "use strict";

  var deferredPrompt = null;
  var refreshing = false;

  function $(id) { return document.getElementById(id); }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    var iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/.test(ua) || iPadOs;
  }

  function isInAppBrowser() {
    return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent || "");
  }

  /* ---------- 설치 안내 ---------- */

  function renderInstall() {
    var cards = document.querySelectorAll("[data-install-card]");
    cards.forEach(function (card) {
      var btn = card.querySelector("[data-install-btn]");
      var guide = card.querySelector("[data-install-guide]");
      var done = card.querySelector("[data-install-done]");

      card.classList.remove("is-hidden");
      if (btn) btn.classList.add("is-hidden");
      if (guide) guide.textContent = "";
      if (done) done.classList.add("is-hidden");

      if (isStandalone()) {
        if (card.hasAttribute("data-hide-when-installed")) {
          card.classList.add("is-hidden");
        } else if (done) {
          done.classList.remove("is-hidden");
        }
        return;
      }

      if (isInAppBrowser()) {
        guide.textContent = "카카오톡·네이버 앱 안에서는 설치가 안 돼요. 오른쪽 위 메뉴(⋮ 또는 공유)에서 " +
          (isIos() ? "'Safari로 열기'" : "'다른 브라우저로 열기'") + "를 누른 뒤 다시 와 주세요.";
        return;
      }

      if (deferredPrompt && btn) {
        btn.classList.remove("is-hidden");
        guide.textContent = "버튼 한 번이면 홈 화면에 앱 아이콘이 생겨요.";
        return;
      }

      if (isIos()) {
        guide.textContent = "Safari 아래쪽 공유 버튼(□↑) → '홈 화면에 추가' → 오른쪽 위 '추가'를 누르세요.";
      } else {
        guide.textContent = "Chrome 오른쪽 위 메뉴(⋮) → '앱 설치' 또는 '홈 화면에 추가'를 누르세요.";
      }
    });
  }

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      renderInstall();
    });

    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      renderInstall();
      if (typeof toast === "function") toast("홈 화면에 설치했어요");
    });

    document.querySelectorAll("[data-install-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!deferredPrompt) { renderInstall(); return; }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          renderInstall();
        });
      });
    });

    renderInstall();
  }

  /* ---------- 서비스워커 · 업데이트 ---------- */

  function showUpdateBar(worker) {
    var bar = $("update-bar");
    if (!bar) return;
    bar.classList.remove("is-hidden");
    $("btn-update-now").onclick = function () {
      worker.postMessage({ type: "SKIP_WAITING" });
    };
  }

  function setupServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var secure = location.protocol === "https:" ||
      location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) return;

    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);

      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBar(nw);
          }
        });
      });

      // 앱을 다시 열 때마다 새 버전 확인
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") reg.update().catch(function () {});
      });
    }).catch(function () { /* 등록 실패해도 웹으로는 그대로 동작 */ });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  /* ---------- 데이터 보존 요청 ---------- */

  var persistAsked = false;
  function requestPersist() {
    if (persistAsked) return;
    persistAsked = true;
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (already) {
        if (!already) return navigator.storage.persist();
      }).catch(function () {});
    }
  }

  /* ---------- 온라인/오프라인 표시 ---------- */

  function setupNetwork() {
    var badge = $("offline-badge");
    function update() {
      if (!badge) return;
      badge.classList.toggle("is-hidden", navigator.onLine);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  window.ddasoopPwa = {
    requestPersist: requestPersist,
    isStandalone: isStandalone,
    renderInstall: renderInstall
  };

  document.addEventListener("DOMContentLoaded", function () {
    setupInstall();
    setupServiceWorker();
    setupNetwork();
    if (isStandalone()) requestPersist();
  });
})();
