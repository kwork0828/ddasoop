/* 따숲 - 마음 쉼터 (AI)
   POST /api/generate
   보내는 값 : { mood, note, mission }
   받는 값   : { ok: true, data: { title, message, action, keyword } }
             { ok: false, code, message }
*/
(function () {
  "use strict";

  var TIMEOUT_MS = 25000;
  var STORAGE_KEY = "ddasoop.ai.history";
  var MAX_HISTORY = 10;

  var form = document.getElementById("ai-form");
  if (!form) return;

  var moodEl = document.getElementById("ai-mood");
  var inputEl = document.getElementById("ai-input");
  var countEl = document.getElementById("ai-count");
  var submitEl = document.getElementById("ai-submit");
  var resetEl = document.getElementById("ai-reset");
  var statusEl = document.getElementById("ai-status");

  var resultEl = document.getElementById("ai-result");
  var keywordEl = document.getElementById("ai-keyword");
  var titleEl = document.getElementById("ai-result-title");
  var messageEl = document.getElementById("ai-result-message");
  var actionEl = document.getElementById("ai-result-action");

  var saveEl = document.getElementById("ai-save");
  var copyEl = document.getElementById("ai-copy");
  var historyEl = document.getElementById("ai-history");

  var lastResult = null;

  /* ---------- 상태 표시 ---------- */

  function showStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = "ai-status" + (kind ? " is-" + kind : "");
    statusEl.dataset.kind = kind || "";
  }

  function hideStatus() {
    statusEl.textContent = "";
    statusEl.className = "ai-status is-hidden";
    statusEl.dataset.kind = "";
  }

  function setLoading(isLoading) {
    submitEl.disabled = isLoading;
    inputEl.disabled = isLoading;
    moodEl.disabled = isLoading;
    submitEl.textContent = isLoading ? "처방 받는 중..." : "쉼 처방 받기";
  }

  /* ---------- 저장소 ---------- */

  function readHistory() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function writeHistory(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
      return true;
    } catch (err) {
      return false;
    }
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function pad(n) { return String(n).length < 2 ? "0" + n : String(n); }
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function renderHistory() {
    var list = readHistory();
    historyEl.innerHTML = "";

    if (list.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty-text";
      empty.textContent = "아직 저장된 처방이 없어요.";
      historyEl.appendChild(empty);
      return;
    }

    list.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "ai-history-item";

      var meta = document.createElement("p");
      meta.className = "ai-history-meta";
      meta.textContent = formatDate(item.date) + " · " + (item.mood || "") +
                         (item.keyword ? " · " + item.keyword : "");

      var body = document.createElement("p");
      body.className = "ai-history-body";
      body.textContent = item.message || "";

      li.appendChild(meta);
      li.appendChild(body);

      if (item.action) {
        var act = document.createElement("p");
        act.className = "ai-history-action";
        act.textContent = "→ " + item.action;
        li.appendChild(act);
      }

      historyEl.appendChild(li);
    });
  }

  /* ---------- 진행 중인 미션 (있으면 같이 보냄) ---------- */

  function currentMission() {
    var el = document.querySelector("#mission-list .mission-title");
    return el ? el.textContent.trim().slice(0, 60) : "";
  }

  /* ---------- 서버 호출 ---------- */

  function requestPrescription(payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    return fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then(function (res) {
        return res.text().then(function (raw) {
          var json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch (err) { json = null; }

          if (!json) throw new Error("서버 응답을 읽지 못했어요.");
          if (!res.ok || json.ok !== true) {
            throw new Error(json.message || ("서버 오류 (" + res.status + ")"));
          }
          if (!json.data || !json.data.message) {
            throw new Error("이번엔 답을 만들지 못했어요. 다시 시도해 주세요.");
          }
          return json.data;
        });
      })
      .then(function (data) { clearTimeout(timer); return data; })
      .catch(function (err) { clearTimeout(timer); throw err; });
  }

  /* ---------- 제출 ---------- */

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var note = inputEl.value.trim();
    if (note.length === 0) {
      showStatus("마음 한 줄을 먼저 적어주세요.", "warn");
      inputEl.focus();
      return;
    }
    if (note.length < 5) {
      showStatus("조금만 더 적어주시면 처방이 정확해져요. (5자 이상)", "warn");
      inputEl.focus();
      return;
    }

    resultEl.classList.add("is-hidden");
    setLoading(true);
    showStatus("마음을 읽고 있어요...", "loading");

    requestPrescription({
      mood: moodEl.value,
      note: note,
      mission: currentMission()
    })
      .then(function (data) {
        lastResult = {
          date: new Date().toISOString(),
          mood: moodEl.value,
          note: note,
          title: data.title || "오늘의 쉼",
          message: data.message || "",
          action: data.action || "",
          keyword: data.keyword || ""
        };

        keywordEl.textContent = lastResult.keyword;
        keywordEl.style.display = lastResult.keyword ? "" : "none";
        titleEl.textContent = lastResult.title;
        messageEl.textContent = lastResult.message;
        actionEl.textContent = lastResult.action;
        actionEl.parentNode.style.display = lastResult.action ? "" : "none";

        resultEl.classList.remove("is-hidden");
        hideStatus();
      })
      .catch(function (err) {
        var message;
        if (err && err.name === "AbortError") {
          message = "응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.";
        } else if (location.protocol === "file:") {
          message = "파일로 직접 열면 AI 기능은 동작하지 않아요. vercel dev 또는 배포 주소에서 확인해 주세요.";
        } else if (err && err.message === "Failed to fetch") {
          message = "서버에 연결하지 못했어요. 네트워크 상태를 확인해 주세요.";
        } else {
          message = (err && err.message) || "알 수 없는 오류가 발생했어요.";
        }
        showStatus(message, "error");
      })
      .then(function () { setLoading(false); });
  });

  /* ---------- 보조 버튼 ---------- */

  resetEl.addEventListener("click", function () {
    inputEl.value = "";
    countEl.textContent = "0";
    resultEl.classList.add("is-hidden");
    lastResult = null;
    hideStatus();
    inputEl.focus();
  });

  saveEl.addEventListener("click", function () {
    if (!lastResult) return;
    var list = readHistory();
    list.unshift(lastResult);
    if (writeHistory(list)) {
      renderHistory();
      showStatus("기록에 저장했어요.", "ok");
    } else {
      showStatus("저장 공간이 부족해요. 지난 기록을 정리해 주세요.", "error");
    }
  });

  copyEl.addEventListener("click", function () {
    if (!lastResult) return;
    var text = lastResult.title + "\n\n" + lastResult.message +
               (lastResult.action ? "\n\n오늘의 한 걸음: " + lastResult.action : "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { showStatus("복사했어요.", "ok"); },
        function () { showStatus("복사에 실패했어요.", "error"); }
      );
    } else {
      showStatus("이 브라우저에서는 복사를 지원하지 않아요.", "warn");
    }
  });

  inputEl.addEventListener("input", function () {
    countEl.textContent = String(inputEl.value.trim().length);
    if (statusEl.dataset.kind === "warn") hideStatus();
  });

  renderHistory();
})();

