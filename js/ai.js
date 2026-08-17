/* 따숲 - 마음 쉼터 (AI 기능)
   POST /api/generate 호출 · 빈 입력 / API 오류 / 타임아웃 처리 · localStorage 저장 */
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
  var resultBodyEl = document.getElementById("ai-result-body");
  var saveEl = document.getElementById("ai-save");
  var copyEl = document.getElementById("ai-copy");
  var historyEl = document.getElementById("ai-history");

  var lastResult = null;

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
      meta.textContent = formatDate(item.date) + " · " + (item.mood || "");

      var body = document.createElement("p");
      body.className = "ai-history-body";
      body.textContent = item.result || "";

      li.appendChild(meta);
      li.appendChild(body);
      historyEl.appendChild(li);
    });
  }

  function pickText(data) {
    if (!data || typeof data !== "object") return "";
    var keys = ["result", "text", "message", "content", "output"];
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

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
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (err) { data = null; }
          if (!res.ok) {
            throw new Error((data && (data.error || data.message)) || ("서버 오류 (" + res.status + ")"));
          }
          if (!data) throw new Error("서버 응답을 읽지 못했어요.");
          return data;
        });
      })
      .then(function (data) { clearTimeout(timer); return data; })
      .catch(function (err) { clearTimeout(timer); throw err; });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var text = inputEl.value.trim();
    if (text.length === 0) {
      showStatus("마음 한 줄을 먼저 적어주세요.", "warn");
      inputEl.focus();
      return;
    }
    if (text.length < 5) {
      showStatus("조금만 더 적어주시면 처방이 정확해져요. (5자 이상)", "warn");
      inputEl.focus();
      return;
    }

    resultEl.classList.add("is-hidden");
    setLoading(true);
    showStatus("마음을 읽고 있어요...", "loading");

    requestPrescription({ mood: moodEl.value, text: text })
      .then(function (data) {
        var output = pickText(data);
        if (!output) throw new Error("처방 내용이 비어 있어요. 다시 시도해 주세요.");

        lastResult = {
          date: new Date().toISOString(),
          mood: moodEl.value,
          input: text,
          result: output
        };
        resultBodyEl.textContent = output;
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastResult.result).then(
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
