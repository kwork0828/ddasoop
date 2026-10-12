/* ============================================
   따숲 (ddasoop) - backup.js
   전체 백업(파일로 내보내기) · 복원

   폰을 바꾸거나 브라우저 데이터가 지워지면 기록이 사라집니다.
   서버에 저장하지 않는 대신, 이 파일 하나로 옮길 수 있게 합니다.
   ============================================ */

(function () {
  "use strict";

  var PREFIX_RE = /^ddasoop[._]/;
  var LAST_BACKUP_KEY = "ddasoop.backup.last";
  var REMIND_DAYS = 7;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }

  function notify(msg) {
    if (typeof toast === "function") toast(msg); else alert(msg);
  }

  function collect() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && PREFIX_RE.test(k) && k !== LAST_BACKUP_KEY) {
        data[k] = localStorage.getItem(k);
      }
    }
    return data;
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
  }

  function exportBackup() {
    var payload = {
      app: "ddasoop",
      kind: "backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: collect()
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var file = "ddasoop-backup-" + stamp() + ".json";

    // 폰에서는 공유 시트(카톡 나에게 보내기, 드라이브 저장)가 더 편함
    try {
      var f = new File([blob], file, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: "따숲 백업" }).then(markDone, function (err) {
          if (err && err.name === "AbortError") return;
          download(blob, file);
        });
        return;
      }
    } catch (e) { /* 공유 미지원이면 다운로드로 */ }
    download(blob, file);
  }

  function download(blob, file) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    markDone();
  }

  function markDone() {
    try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); } catch (e) {}
    renderBackupState();
    notify("백업 파일을 만들었어요");
  }

  /* 복원: 형식이 맞는 따숲 데이터만 받아들인다 */
  function validate(obj) {
    if (!obj || obj.app !== "ddasoop" || obj.kind !== "backup" || typeof obj.data !== "object") {
      return "따숲 백업 파일이 아니에요.";
    }
    var keys = Object.keys(obj.data);
    if (!keys.length) return "백업 파일에 기록이 없어요.";
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!PREFIX_RE.test(k)) return "알 수 없는 항목이 들어 있어요.";
      if (typeof obj.data[k] !== "string") return "파일 내용이 손상되었어요.";
      try { JSON.parse(obj.data[k]); } catch (e) { return "파일 내용이 손상되었어요."; }
    }
    return "";
  }

  function importBackup(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { notify("파일이 너무 커요."); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj = null;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { obj = null; }
      var err = validate(obj);
      if (err) { notify(err); return; }

      var when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString("ko-KR") : "알 수 없음";
      if (!confirm("백업(" + when + ")으로 되돌릴까요?\n지금 이 기기의 기록은 백업 내용으로 바뀝니다.")) return;

      // 먼저 현재 데이터를 비상용으로 보관해 두고 바꾼다
      var current = collect();
      try {
        Object.keys(obj.data).forEach(function (k) { localStorage.setItem(k, obj.data[k]); });
      } catch (e) {
        Object.keys(current).forEach(function (k) {
          try { localStorage.setItem(k, current[k]); } catch (e2) {}
        });
        notify("저장 공간이 부족해 복원하지 못했어요. 기존 기록은 그대로예요.");
        return;
      }
      notify("복원했어요. 다시 불러올게요.");
      setTimeout(function () { location.reload(); }, 600);
    };
    reader.onerror = function () { notify("파일을 읽지 못했어요."); };
    reader.readAsText(file);
  }

  function daysSinceBackup() {
    var last = null;
    try { last = localStorage.getItem(LAST_BACKUP_KEY); } catch (e) {}
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  }

  /* 첫날부터 백업을 재촉하지 않는다: 행동 기록 5건 이상이거나 쓴 지 7일이 넘었을 때만 */
  function hasMeaningfulData() {
    try {
      var abc = JSON.parse(localStorage.getItem("ddasoop.abc.v1") || "null");
      if (abc && Array.isArray(abc.records) && abc.records.length >= 5) return true;
      var main = JSON.parse(localStorage.getItem("ddasoop_v1") || "null");
      if (main && main.createdAt) {
        return Date.now() - new Date(main.createdAt).getTime() > REMIND_DAYS * 86400000;
      }
    } catch (e) { /* 읽기 실패 시 알림 안 띄움 */ }
    return false;
  }

  function renderBackupState() {
    var info = $("backup-last");
    var since = daysSinceBackup();
    if (info) {
      info.textContent = since === null ? "아직 백업한 적이 없어요."
        : since === 0 ? "오늘 백업했어요."
        : "마지막 백업: " + since + "일 전";
    }
    var remind = $("backup-remind");
    if (remind) {
      var need = hasMeaningfulData() && (since === null || since >= REMIND_DAYS);
      remind.classList.toggle("is-hidden", !need);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var exp = $("btn-backup-export");
    var imp = $("btn-backup-import");
    var input = $("input-backup-file");
    if (exp) exp.addEventListener("click", exportBackup);
    if (imp && input) {
      imp.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        importBackup(input.files && input.files[0]);
        input.value = "";
      });
    }
    document.querySelectorAll("[data-backup-now]").forEach(function (b) {
      b.addEventListener("click", exportBackup);
    });
    renderBackupState();
  });

  window.ddasoopBackup = { validate: validate, collect: collect };
})();
