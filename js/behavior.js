/* ============================================
   따숲 (ddasoop) - behavior.js
   행동 코칭: ABC 기록 · 패턴 · 상황 코칭(AI) · 이번 주 실천

   - 모든 기록은 이 기기(localStorage)에만 저장합니다.
   - 상황 코칭을 보낼 때만 적은 글이 AI 서버를 거칩니다.
     보내기 전에 아이 별명과 가릴 이름은 [아이] [이름1] 로 바뀌고,
     답이 오면 이 기기 안에서만 원래 이름으로 되돌려 보여줍니다.
   ============================================ */

(function () {
  "use strict";

  var ABC_KEY = "ddasoop.abc.v1";
  var PRACTICE_KEY = "ddasoop.practice.v1";
  var COACH_KEY = "ddasoop.coach.v1";
  var NAMES_KEY = "ddasoop.coach.names";
  var MAX_RECORDS = 3000;
  var MAX_COACH_HISTORY = 15;
  var PATTERN_DAYS = 14;
  var MIN_FOR_PATTERN = 10;
  var COACH_TIMEOUT_MS = 55000;

  var OPTIONS = {
    a: ["요구 거절", "지시 받음", "활동 전환", "원하는 물건 못 가짐", "혼자 있음", "소음·자극", "기타"],
    b: ["울음", "때리기·꼬집기", "물기", "드러눕기", "물건 던지기·찢기", "침 뱉기", "자기자극", "기타"],
    c: ["들어줌", "무시함", "달램", "활동 중단", "물건 줌", "크게 혼남", "기타"]
  };

  /* 기능별 이번 주 실천 후보 */
  var PRACTICES = {
    "회피": {
      title: "\"쉬어요\" 카드 연습",
      when: "가벼운 지시(정리, 옷 입기) 때 하루 3~5번",
      script: "하기 싫구나. 알아. 그럼 '쉬어요' 주면 돼. … 좋아, 숫자 다섯 세고 다시 하자. 하나~ 둘~ 셋~ 넷~ 다섯.",
      success: "하루 1번이라도 카드를 스스로 건네면 성공. 처음 일주일은 건넬 때마다 100% 들어주기."
    },
    "관심": {
      title: "먼저 다가가 관심 주기",
      when: "아이가 혼자 잘 놀고 있을 때 2~3분마다",
      script: "(옆에 앉아서) 와, 이거 만들고 있었구나. 엄마(아빠)도 같이 볼래.",
      success: "문제행동 없이 놀 때 먼저 말 걸기를 하루 5번 하면 성공."
    },
    "물건획득": {
      title: "\"주세요\" 먼저, 3초 안에 주기",
      when: "원하는 걸 달라고 할 법한 순간마다",
      script: "이거 갖고 싶구나. '주세요' 해 볼까? (손짓·카드도 괜찮아요) … 그렇지! 여기 있어.",
      success: "말·손짓·카드 중 하나로 요구하면 3초 안에 주기. 하루 3번이면 성공."
    },
    "감각": {
      title: "안전한 감각 놀이 시간 넣기",
      when: "자기자극이 잦은 시간대 직전에 5분",
      script: "지금은 빙글빙글 시간! 같이 돌자. … 다섯 세면 그만, 다음은 간식.",
      success: "정해진 시간에 감각 놀이를 하루 2번 넣으면 성공. 다치지 않는 자기자극은 막지 않기."
    },
    "신체·컨디션": {
      title: "그 시간대 몸 상태 먼저 확인",
      when: "기록이 몰린 시간대 30분 전",
      script: "배고픈지, 졸린지, 화장실 갈지 먼저 확인해 볼게.",
      success: "그 시간대에 간식·물·화장실·휴식을 미리 챙기면 성공. 계속되면 소아과 상담."
    },
    "보류": {
      title: "직전 상황 한 줄 기록하기",
      when: "행동이 나올 때마다",
      script: "(기록만) 무슨 일 직후였지? 그 다음 어떻게 됐지?",
      success: "기록 5건 더 모이면 성공. 패턴은 그다음에 보여드려요."
    }
  };

  var sel = { a: null, b: null, c: null };

  function $(id) { return document.getElementById(id); }

  /* ---------- 저장소 (실패해도 앱이 멈추지 않게) ---------- */

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadRecords() {
    var box = readJson(ABC_KEY, null);
    if (!box || !Array.isArray(box.records)) return [];
    return box.records.filter(function (r) {
      return r && typeof r.ts === "number" && r.a && r.b && r.c;
    });
  }

  function saveRecords(records) {
    var trimmed = records.slice(-MAX_RECORDS);
    return writeJson(ABC_KEY, { version: 1, records: trimmed });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 날짜 ---------- */

  function dayStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function weekStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function hhmm(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function mdhm(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + hhmm(ts);
  }

  /* ---------- 패턴 분석 (규칙 기반, 서버 없이) ---------- */

  function countBy(list, key) {
    var m = {};
    list.forEach(function (r) { m[r[key]] = (m[r[key]] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; })
      .sort(function (x, y) { return y[1] - x[1]; });
  }

  function recentRecords(records, days) {
    var from = dayStart(Date.now()) - (days - 1) * 86400000;
    return records.filter(function (r) { return r.ts >= from; });
  }

  function busiestWindow(list) {
    // 2시간 창 중 가장 많이 몰린 시간대
    var best = { start: 0, count: 0 };
    for (var h = 0; h < 24; h++) {
      var c = list.filter(function (r) {
        var hr = new Date(r.ts).getHours();
        return hr === h || hr === (h + 1) % 24;
      }).length;
      if (c > best.count) best = { start: h, count: c };
    }
    return best;
  }

  function ratio(list, fn) {
    if (!list.length) return 0;
    return list.filter(fn).length / list.length;
  }

  function inSet(v, arr) { return arr.indexOf(v) !== -1; }

  function analyze(records) {
    var list = recentRecords(records, PATTERN_DAYS);
    var n = list.length;
    var out = {
      n: n,
      topA: countBy(list, "a"),
      topB: countBy(list, "b"),
      topC: countBy(list, "c"),
      window: busiestWindow(list),
      ready: n >= MIN_FOR_PATTERN,
      hypotheses: []
    };
    if (!out.ready) return out;

    function conf(r, threshold) {
      if (n >= 20 && r >= Math.max(0.6, threshold + 0.15)) return "높음";
      return "중간";
    }

    // 신체·컨디션은 가장 먼저 확인
    var w = out.window;
    var wr = w.count / n;
    if (wr >= 0.5) {
      out.hypotheses.push({
        fn: "신체·컨디션", confidence: conf(wr, 0.5),
        reason: w.start + "시~" + ((w.start + 2) % 24) + "시에 " + Math.round(wr * 100) + "%가 몰려 있어요."
      });
    }

    var rules = [
      { fn: "물건획득", th: 0.4, test: function (r) {
        return inSet(r.a, ["요구 거절", "원하는 물건 못 가짐"]) && inSet(r.c, ["들어줌", "물건 줌"]); },
        reason: "원하는 걸 못 가졌을 때 시작해서, 결국 얻게 된 경우가 " },
      { fn: "회피", th: 0.4, test: function (r) {
        return inSet(r.a, ["지시 받음", "활동 전환"]) && inSet(r.c, ["활동 중단", "들어줌", "크게 혼남"]); },
        reason: "지시·전환 직후 시작해서 그 활동이 멈춘 경우가 " },
      { fn: "관심", th: 0.35, test: function (r) {
        return r.a === "혼자 있음" && inSet(r.c, ["달램", "들어줌", "크게 혼남"]); },
        reason: "혼자 있을 때 시작해서 어른의 반응을 받은 경우가 " },
      { fn: "감각", th: 0.4, test: function (r) {
        return r.a === "소음·자극" || (r.a === "혼자 있음" && r.c === "무시함"); },
        reason: "소음·자극 속이거나 반응이 없어도 이어진 경우가 " }
    ];

    rules.forEach(function (rule) {
      var r = ratio(list, rule.test);
      if (r >= rule.th) {
        out.hypotheses.push({
          fn: rule.fn, confidence: conf(r, rule.th),
          reason: rule.reason + Math.round(r * 100) + "%예요."
        });
      }
    });

    if (!out.hypotheses.length) {
      out.hypotheses.push({
        fn: "보류", confidence: "낮음",
        reason: "아직 한쪽으로 뚜렷하게 모이지 않았어요."
      });
    }
    return out;
  }

  /* AI에 같이 보낼 요약: 자유 메모는 넣지 않고 숫자만 */
  function patternSummary(records) {
    var p = analyze(records);
    if (p.n === 0) return "";
    function top(arr) {
      return arr.slice(0, 3).map(function (x) { return x[0] + " " + x[1] + "건"; }).join(", ");
    }
    var lines = [
      "최근 " + PATTERN_DAYS + "일 기록 " + p.n + "건",
      "직전 상황: " + top(p.topA),
      "행동: " + top(p.topB),
      "직후 결과: " + top(p.topC)
    ];
    if (p.window.count >= 2) {
      lines.push("가장 많은 시간대: " + p.window.start + "~" + ((p.window.start + 2) % 24) + "시 (" + p.window.count + "건)");
    }
    return lines.join("\n");
  }

  /* ---------- 이름 가리기 ---------- */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function maskNames() {
    var map = [];
    var nick = (typeof state !== "undefined" && state && state.profile && state.profile.nickname) || "";
    if (nick.trim()) map.push([nick.trim(), "[아이]"]);
    var extra = (readJson(NAMES_KEY, "") || "").split(/[,\s]+/).filter(Boolean);
    extra.forEach(function (name, i) {
      if (name.length >= 1 && name !== nick.trim()) map.push([name, "[이름" + (i + 1) + "]"]);
    });
    // 긴 이름부터 치환해야 '시온'보다 '황시온'이 먼저 바뀜
    map.sort(function (x, y) { return y[0].length - x[0].length; });
    return map;
  }

  function applyMask(text, map) {
    var out = text;
    map.forEach(function (pair) {
      out = out.replace(new RegExp(escapeRe(pair[0]), "g"), pair[1]);
    });
    out = out.replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "[번호 삭제]");
    out = out.replace(/\d{6}[-\s]?[1-4]\d{6}/g, "[번호 삭제]");
    return out;
  }

  function unmask(text, map) {
    if (!text) return "";
    var out = String(text);
    map.forEach(function (pair) {
      out = out.split(pair[1]).join(pair[0]);
    });
    return out.split("[아이]").join("아이");
  }

  function deepUnmask(value, map) {
    if (typeof value === "string") return unmask(value, map);
    if (Array.isArray(value)) return value.map(function (v) { return deepUnmask(v, map); });
    if (value && typeof value === "object") {
      var o = {};
      Object.keys(value).forEach(function (k) { o[k] = deepUnmask(value[k], map); });
      return o;
    }
    return value;
  }

  /* ---------- 공통 렌더 도우미 ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function notify(msg) {
    if (typeof toast === "function") toast(msg); else alert(msg);
  }

  function gainXp(action) {
    if (typeof state === "undefined" || !state) return;
    try {
      addXp(state, XP_RULES.record);
      touchStreak(state);
      addLog(state, { area: "behavior", action: action, xp: XP_RULES.record });
      saveState(state);
    } catch (e) { /* 게임 요소 실패는 기록을 막지 않음 */ }
  }

  /* ---------- 탭 ---------- */

  function setTab(name) {
    document.querySelectorAll(".bh-tab").forEach(function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle("is-current", on);
      b.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll(".bh-panel").forEach(function (p) {
      p.classList.toggle("is-hidden", p.id !== "bh-panel-" + name);
    });
    try { sessionStorage.setItem("ddasoop.bh.tab", name); } catch (e) {}
    if (name === "pattern") renderPattern();
    if (name === "coach") renderCoachHistory();
  }

  /* ---------- 기록 탭 ---------- */

  function renderChips() {
    ["a", "b", "c"].forEach(function (k) {
      var box = $("bh-chips-" + k);
      if (!box || box.childElementCount) return;
      OPTIONS[k].forEach(function (label) {
        var b = el("button", "bh-chip", label);
        b.type = "button";
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          sel[k] = sel[k] === label ? null : label;
          Array.prototype.forEach.call(box.children, function (c) {
            c.setAttribute("aria-pressed", String(c.textContent === sel[k]));
          });
          $("bh-save").disabled = !(sel.a && sel.b && sel.c);
        });
        box.appendChild(b);
      });
    });
  }

  function clearSelection() {
    sel = { a: null, b: null, c: null };
    document.querySelectorAll(".bh-chip").forEach(function (c) {
      c.setAttribute("aria-pressed", "false");
    });
    $("bh-note").value = "";
    $("bh-save").disabled = true;
  }

  function saveRecord() {
    if (!(sel.a && sel.b && sel.c)) return;
    var records = loadRecords();
    records.push({
      id: newId(), ts: Date.now(), a: sel.a, b: sel.b, c: sel.c,
      note: $("bh-note").value.trim().slice(0, 140)
    });
    if (!saveRecords(records)) {
      notify("저장 공간이 부족해요. 설정에서 백업 후 정리해 주세요.");
      return;
    }
    gainXp("abc");
    clearSelection();
    renderToday();
    showInsight(records);
    if (window.ddasoopPwa) window.ddasoopPwa.requestPersist();
  }

  function showInsight(records) {
    var wk = records.filter(function (r) { return r.ts >= weekStart(Date.now()); });
    var top = countBy(wk, "a")[0];
    var box = $("bh-insight");
    box.innerHTML = "";
    box.appendChild(el("strong", "", "이번 주 " + wk.length + "번째 기록이에요."));
    var sub;
    if (top && wk.length >= 3) {
      sub = "이번 주 기록 중 " + Math.round(top[1] / wk.length * 100) + "%가 '" + top[0] + "' 직후였어요.";
    } else {
      sub = "3건쯤 쌓이면 어떤 상황에서 자주 나오는지 보이기 시작해요.";
    }
    box.appendChild(el("span", "", sub));
    box.classList.remove("is-hidden");
  }

  function renderToday() {
    var records = loadRecords();
    var today = records.filter(function (r) { return r.ts >= dayStart(Date.now()); })
      .sort(function (x, y) { return y.ts - x.ts; });
    var ul = $("bh-log");
    ul.innerHTML = "";
    $("bh-today-count").textContent = today.length + "건";
    $("bh-empty").classList.toggle("is-hidden", today.length > 0);

    today.forEach(function (r) {
      var li = el("li", "bh-log-item");
      li.appendChild(el("span", "bh-log-time", hhmm(r.ts)));
      var body = el("div", "bh-log-body");
      body.appendChild(el("p", "bh-log-seq", r.a + "  ›  " + r.b + "  ›  " + r.c));
      if (r.note) body.appendChild(el("p", "bh-log-note", r.note));
      li.appendChild(body);
      var del = el("button", "bh-log-del", "삭제");
      del.type = "button";
      del.setAttribute("aria-label", hhmm(r.ts) + " 기록 삭제");
      del.addEventListener("click", function () {
        if (!confirm("이 기록을 지울까요?")) return;
        saveRecords(loadRecords().filter(function (x) { return x.id !== r.id; }));
        renderToday();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  /* ---------- 패턴 탭 ---------- */

  function bars(container, pairs, total) {
    container.innerHTML = "";
    if (!pairs.length) {
      container.appendChild(el("p", "empty-text", "아직 기록이 없어요."));
      return;
    }
    pairs.slice(0, 4).forEach(function (p) {
      var row = el("div", "bh-bar-row");
      row.appendChild(el("span", "bh-bar-label", p[0]));
      var track = el("span", "bh-bar-track");
      var fill = el("span", "bh-bar-fill");
      fill.style.width = Math.max(4, Math.round(p[1] / total * 100)) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "bh-bar-num", p[1] + "건"));
      container.appendChild(row);
    });
  }

  function renderPattern() {
    var records = loadRecords();
    var p = analyze(records);
    $("bh-pattern-n").textContent = "최근 " + PATTERN_DAYS + "일 기록 " + p.n + "건";
    bars($("bh-bars-a"), p.topA, p.n || 1);
    bars($("bh-bars-c"), p.topC, p.n || 1);

    var box = $("bh-hypo");
    box.innerHTML = "";
    if (!p.ready) {
      box.appendChild(el("p", "bh-hypo-wait",
        "기록이 " + MIN_FOR_PATTERN + "건 모이면 '왜 그러는지' 가설을 보여드려요. " +
        (MIN_FOR_PATTERN - p.n) + "건 남았어요."));
      box.appendChild(el("p", "bh-hypo-why",
        "적은 기록으로 섣불리 판단하면 엉뚱한 방향으로 몇 주를 쓰게 돼요. 그래서 일부러 기다립니다."));
      return;
    }

    p.hypotheses.forEach(function (h) {
      var card = el("div", "bh-hypo-card");
      var head = el("p", "bh-hypo-head");
      head.appendChild(el("strong", "", h.fn === "보류" ? "판단 보류" : h.fn + " 가능성"));
      head.appendChild(el("span", "bh-conf bh-conf-" + h.confidence, "확신도 " + h.confidence));
      card.appendChild(head);
      card.appendChild(el("p", "bh-hypo-reason", h.reason));
      var pr = PRACTICES[h.fn];
      if (pr) {
        card.appendChild(el("p", "bh-hypo-practice", "이번 주 실천 후보: " + pr.title));
        var btn = el("button", "btn btn-secondary btn-sm", "이걸로 이번 주 실천 정하기");
        btn.type = "button";
        btn.addEventListener("click", function () { setPractice(pr, "pattern"); });
        card.appendChild(btn);
      }
      box.appendChild(card);
    });
    box.appendChild(el("p", "bh-hypo-why", "가설일 뿐이에요. 담당 치료사와 같이 확인해 주세요."));
  }

  /* ---------- 이번 주 실천 ---------- */

  function getPractice() {
    var p = readJson(PRACTICE_KEY, null);
    if (!p || !p.title) return null;
    return p;
  }

  function setPractice(src, source) {
    var current = getPractice();
    if (current && current.title !== src.title &&
        !confirm("지금 실천(" + current.title + ")을 바꿀까요?\n실천은 한 번에 하나만 해요.")) {
      return;
    }
    writeJson(PRACTICE_KEY, {
      title: src.title, when: src.when || "", script: src.script || "", success: src.success || "",
      source: source, startedAt: new Date().toISOString(), checks: {}
    });
    renderPractice();
    notify("이번 주 실천을 정했어요");
    window.scrollTo(0, 0);
  }

  function renderPractice() {
    var p = getPractice();
    var boxes = [$("bh-practice"), $("dash-practice")];
    boxes.forEach(function (box) {
      if (!box) return;
      box.innerHTML = "";
      if (!p) {
        box.appendChild(el("p", "empty-text",
          "아직 정한 실천이 없어요. 패턴이나 상황 코칭에서 하나만 골라보세요."));
        return;
      }
      box.appendChild(el("p", "bh-practice-title", p.title));
      if (p.when) box.appendChild(el("p", "bh-practice-when", "언제: " + p.when));
      if (p.script) box.appendChild(el("p", "bh-practice-script", "“" + p.script + "”"));
      if (p.success) box.appendChild(el("p", "bh-practice-success", "성공 기준: " + p.success));

      var today = todayStr();
      var row = el("div", "bh-practice-checks");
      [["done", "했어요"], ["some", "조금 했어요"], ["no", "오늘은 못 했어요"]].forEach(function (opt) {
        var b = el("button", "bh-check" + (p.checks[today] === opt[0] ? " is-on" : ""), opt[1]);
        b.type = "button";
        b.addEventListener("click", function () {
          var fresh = getPractice();
          if (!fresh) return;
          var first = !fresh.checks[today];
          fresh.checks[today] = opt[0];
          writeJson(PRACTICE_KEY, fresh);
          if (first && opt[0] !== "no") gainXp("practice");
          renderPractice();
          notify(opt[0] === "no" ? "괜찮아요. 내일 다시 하면 돼요." : "기록했어요. 잘하고 계세요.");
        });
        row.appendChild(b);
      });
      box.appendChild(row);

      var days = Object.keys(p.checks).filter(function (d) { return p.checks[d] !== "no"; }).length;
      box.appendChild(el("p", "bh-practice-days", "실천한 날 " + days + "일"));
    });
  }

  /* ---------- 상황 코칭 탭 ---------- */

  function setCoachStatus(msg, kind) {
    var s = $("bh-coach-status");
    s.textContent = msg || "";
    s.className = "ai-status" + (kind ? " is-" + kind : "") + (msg ? "" : " is-hidden");
  }

  function offlineGuide(reason) {
    return {
      offline: true,
      summary: reason + " 대신 기본 가이드를 보여드려요. 아래 순서대로 정리하면 다음 코칭이 훨씬 정확해져요.",
      abc: [],
      hypotheses: [],
      teacherMessage:
        "선생님, 오늘 [아이] 일 알려주셔서 감사합니다.\n" +
        "집에서도 같이 연습해 보려고 하는데 세 가지만 여쭤봐도 될까요?\n" +
        "1. 그때 어떤 활동을 하자고 하셨는지\n" +
        "2. 그 행동 직후에 활동이 멈췄는지, 어떤 반응이 있었는지\n" +
        "3. 식사 전후였는지, 그날 피곤해 보였는지\n" +
        "늘 신경 써 주셔서 감사합니다.",
      practice: PRACTICES["보류"],
      inTheMoment: [
        "공감 → 이유 → 대신 할 것: \"이거 하고 싶구나. 맞아. 그런데 지금은 ○○라서 안 되네. 숫자 다섯 세고 / 이거 먼저 하고 하자.\"",
        "흥분해서 뛰어다닐 때: 붙잡지 말고 몸으로 살짝 막고 \"잠깐만, 숫자 셀게. 하나~ 둘~ 셋~ 넷~ 다섯. 잘했네.\" 그다음 좋아하는 걸로 전환."
      ],
      avoid: ["기관에서 있었던 일로 집에서 다시 혼내기", "행동 직후 긴 설교나 큰 감정 반응"],
      referral: ""
    };
  }

  function requestCoach(payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, COACH_TIMEOUT_MS);
    return fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (res) {
      return res.text().then(function (raw) {
        var json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = null; }
        if (!json) throw new Error("서버 응답을 읽지 못했어요.");
        if (!res.ok || json.ok !== true || !json.data) {
          var err = new Error(json.message || ("서버 오류 (" + res.status + ")"));
          err.code = json.code;
          throw err;
        }
        return json.data;
      });
    }).then(function (d) { clearTimeout(timer); return d; },
      function (e) { clearTimeout(timer); throw e; });
  }

  function renderCoachResult(data, names) {
    var box = $("bh-coach-result");
    box.innerHTML = "";
    var u = function (t) { return unmask(t, names); };

    if (data.offline) box.appendChild(el("p", "bh-offline-badge", "기본 가이드 (AI 미사용)"));

    box.appendChild(el("h3", "bh-res-h", "한 줄 결론"));
    box.appendChild(el("p", "bh-res-summary", u(data.summary)));

    if (data.referral) {
      var ref = el("div", "card card-safety bh-referral");
      ref.appendChild(el("p", "", u(data.referral)));
      box.appendChild(ref);
    }

    if (data.abc && data.abc.length) {
      box.appendChild(el("h3", "bh-res-h", "ABC 정리"));
      var t = el("div", "bh-abc");
      data.abc.forEach(function (row, i) {
        var r = el("div", "bh-abc-row");
        r.appendChild(el("span", "bh-abc-n", String(i + 1)));
        var cells = el("div", "bh-abc-cells");
        cells.appendChild(el("p", "", "A 직전: " + u(row.a)));
        cells.appendChild(el("p", "", "B 행동: " + u(row.b)));
        cells.appendChild(el("p", "", "C 직후: " + u(row.c)));
        if (row.source) cells.appendChild(el("p", "bh-abc-src", "출처: " + u(row.source)));
        r.appendChild(cells);
        t.appendChild(r);
      });
      box.appendChild(t);
    }

    if (data.hypotheses && data.hypotheses.length) {
      box.appendChild(el("h3", "bh-res-h", "가설"));
      data.hypotheses.forEach(function (h) {
        var c = el("div", "bh-hypo-card");
        var head = el("p", "bh-hypo-head");
        head.appendChild(el("strong", "", h.function));
        head.appendChild(el("span", "bh-conf bh-conf-" + h.confidence, "확신도 " + h.confidence));
        c.appendChild(head);
        c.appendChild(el("p", "bh-hypo-reason", u(h.reason)));
        box.appendChild(c);
      });
    }

    if (data.practice && data.practice.title) {
      box.appendChild(el("h3", "bh-res-h", "이번 주 실천 딱 1개"));
      var pc = el("div", "bh-practice-preview");
      pc.appendChild(el("p", "bh-practice-title", u(data.practice.title)));
      if (data.practice.when) pc.appendChild(el("p", "bh-practice-when", "언제: " + u(data.practice.when)));
      if (data.practice.script) pc.appendChild(el("p", "bh-practice-script", "“" + u(data.practice.script) + "”"));
      if (data.practice.success) pc.appendChild(el("p", "bh-practice-success", "성공 기준: " + u(data.practice.success)));
      var setBtn = el("button", "btn btn-primary", "이걸로 이번 주 실천 정하기");
      setBtn.type = "button";
      setBtn.addEventListener("click", function () {
        setPractice({
          title: u(data.practice.title), when: u(data.practice.when),
          script: u(data.practice.script), success: u(data.practice.success)
        }, "coach");
      });
      pc.appendChild(setBtn);
      box.appendChild(pc);
    }

    if (data.inTheMoment && data.inTheMoment.length) {
      box.appendChild(el("h3", "bh-res-h", "그 순간 이렇게 말해보세요"));
      var ul = el("ul", "bh-res-list");
      data.inTheMoment.forEach(function (s) { ul.appendChild(el("li", "", u(s))); });
      box.appendChild(ul);
    }

    if (data.avoid && data.avoid.length) {
      box.appendChild(el("h3", "bh-res-h", "하지 말 것"));
      var ul2 = el("ul", "bh-res-list bh-res-avoid");
      data.avoid.forEach(function (s) { ul2.appendChild(el("li", "", u(s))); });
      box.appendChild(ul2);
    }

    if (data.teacherMessage) {
      box.appendChild(el("h3", "bh-res-h", "선생님께 보낼 메시지"));
      var msg = u(data.teacherMessage);
      box.appendChild(el("pre", "bh-teacher-msg", msg));
      var copy = el("button", "btn btn-secondary", "메시지 복사");
      copy.type = "button";
      copy.addEventListener("click", function () { copyText(msg); });
      box.appendChild(copy);
    }

    box.appendChild(el("p", "ai-note", "진단이나 치료가 아니라 기록 정리와 실천 제안이에요. 담당 치료사와 공유해 주세요."));
    box.classList.remove("is-hidden");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { notify("복사했어요"); },
        function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.className = "sr-only";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); notify("복사했어요"); }
    catch (e) { notify("복사하지 못했어요. 길게 눌러 직접 복사해 주세요."); }
    document.body.removeChild(ta);
  }

  function saveCoachHistory(input, data, names) {
    var list = readJson(COACH_KEY, []);
    if (!Array.isArray(list)) list = [];
    list.unshift({
      at: Date.now(),
      input: input.slice(0, 2000),
      // 이름은 기기 안에서만 다시 붙여 저장
      data: deepUnmask(data, names)
    });
    writeJson(COACH_KEY, list.slice(0, MAX_COACH_HISTORY));
  }

  function renderCoachHistory() {
    var list = readJson(COACH_KEY, []);
    var ul = $("bh-coach-history");
    ul.innerHTML = "";
    if (!Array.isArray(list) || !list.length) {
      ul.appendChild(el("li", "empty-text", "아직 받은 코칭이 없어요."));
      return;
    }
    list.forEach(function (item) {
      var li = el("li", "ai-history-item");
      li.appendChild(el("p", "ai-history-meta", mdhm(item.at) + (item.data && item.data.offline ? " · 기본 가이드" : "")));
      li.appendChild(el("p", "ai-history-body", (item.data && item.data.summary) || ""));
      var open = el("button", "btn btn-text btn-sm", "다시 보기");
      open.type = "button";
      open.addEventListener("click", function () {
        renderCoachResult(item.data, []);
        $("bh-coach-result").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.appendChild(open);
      ul.appendChild(li);
    });
  }

  function submitCoach(e) {
    e.preventDefault();
    var input = $("bh-coach-input").value.trim();
    if (input.length < 10) {
      setCoachStatus("상황을 조금 더 적어 주세요. (10자 이상)", "warn");
      return;
    }

    writeJson(NAMES_KEY, $("bh-coach-names").value.trim().slice(0, 100));
    var names = maskNames();
    var records = loadRecords();
    var payload = {
      situation: applyMask(input, names).slice(0, 2000),
      ageBand: (typeof state !== "undefined" && state && state.profile.ageBand) || "",
      pattern: $("bh-coach-pattern").checked ? patternSummary(records) : ""
    };

    var btn = $("bh-coach-submit");
    btn.disabled = true;
    btn.textContent = "정리하는 중... (최대 1분)";
    $("bh-coach-result").classList.add("is-hidden");

    if (!navigator.onLine) {
      finish(offlineGuide("지금 인터넷이 연결되어 있지 않아요."), "인터넷이 없어서 기본 가이드를 보여드려요.");
      return;
    }

    setCoachStatus("상황을 ABC로 정리하고 있어요...", "loading");
    requestCoach(payload).then(function (data) {
      finish(data, "");
    }, function (err) {
      var why = err && err.name === "AbortError" ? "응답이 너무 오래 걸렸어요."
        : err && err.code === "NO_API_KEY" ? "AI 연결이 아직 준비되지 않았어요."
        : (err && err.message) || "AI 연결에 실패했어요.";
      finish(offlineGuide(why), why + " 기본 가이드를 보여드려요.");
    });

    function finish(data, statusMsg) {
      renderCoachResult(data, names);
      saveCoachHistory(input, data, names);
      renderCoachHistory();
      setCoachStatus(statusMsg, statusMsg ? "warn" : "");
      btn.disabled = false;
      btn.textContent = "정리하고 코칭 받기";
      if (!data.offline) gainXp("coach");
      $("bh-coach-result").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ---------- 시작 ---------- */

  function render() {
    renderChips();
    renderToday();
    renderPractice();
    var tab = "log";
    try { tab = sessionStorage.getItem("ddasoop.bh.tab") || "log"; } catch (e) {}
    setTab(tab);
  }

  function init() {
    if (!$("view-behavior")) return;

    document.querySelectorAll(".bh-tab").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.dataset.tab); });
    });
    $("bh-save").addEventListener("click", saveRecord);
    $("bh-coach-form").addEventListener("submit", submitCoach);
    $("bh-coach-input").addEventListener("input", function () {
      $("bh-coach-count").textContent = String($("bh-coach-input").value.length);
    });
    $("bh-coach-names").value = readJson(NAMES_KEY, "") || "";
    $("bh-coach-paste").addEventListener("click", pasteFromClipboard);

    document.querySelectorAll('[data-go="behavior"]').forEach(function (b) {
      b.addEventListener("click", render);
    });

    renderPractice();
  }

  // 다른 스크립트(백업 복원, 테스트)에서 쓸 수 있게 최소한만 공개
  /* 카톡 등에서 '공유 → 따숲'으로 들어온 글을 상황 코칭에 채워 넣는다 */
  function openCoachWith(text) {
    render();
    setTab("coach");
    var input = $("bh-coach-input");
    input.value = String(text || "").slice(0, 2000);
    $("bh-coach-count").textContent = String(input.value.length);
    setCoachStatus("공유받은 내용을 넣었어요. 이름을 가릴지 확인하고 '정리하고 코칭 받기'를 누르세요.", "ok");
    input.scrollIntoView({ block: "center" });
  }

  function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      notify("이 브라우저는 붙여넣기 버튼을 지원하지 않아요. 입력칸을 길게 눌러 붙여넣어 주세요.");
      return;
    }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { notify("복사된 글이 없어요."); return; }
      var input = $("bh-coach-input");
      input.value = (input.value ? input.value + "\n" : "") + t;
      input.value = input.value.slice(0, 2000);
      $("bh-coach-count").textContent = String(input.value.length);
    }, function () {
      notify("붙여넣기 권한이 없어요. 입력칸을 길게 눌러 붙여넣어 주세요.");
    });
  }

  window.ddasoopBehavior = {
    openCoachWith: openCoachWith,
    analyze: analyze,
    patternSummary: patternSummary,
    applyMask: applyMask,
    unmask: unmask,
    render: render,
    renderPractice: renderPractice
  };

  document.addEventListener("DOMContentLoaded", init);
})();
