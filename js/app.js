/* ============================================
   따숲 (ddasoop) - app.js
   화면 전환과 사용자 동작 처리

   지금은 기본 미션(fallback.js)으로 동작합니다.
   14단계에서 AI 연결로 교체됩니다.
   ============================================ */

let state = null;
let currentAnswers = {};
let currentArea = "";
let openedMissionIndex = -1;

/* 1. 짧은 도우미 */

function $(id) {
  return document.getElementById(id);
}

function show(el) {
  if (el) { el.classList.remove("is-hidden"); }
}

function hide(el) {
  if (el) { el.classList.add("is-hidden"); }
}

function toast(message) {
  const box = $("toast");
  box.textContent = message;
  show(box);
  setTimeout(function () {
    hide(box);
  }, 2400);
}

/* 2. 화면 전환 */

function goto(viewName) {
  const views = document.querySelectorAll(".view");
  views.forEach(function (v) {
    v.classList.remove("is-active");
  });

  const target = $("view-" + viewName);
  if (target) {
    target.classList.add("is-active");
  }

  const header = $("app-header");
  if (viewName === "landing" || viewName === "onboarding") {
    hide(header);
  } else {
    show(header);
  }

  const navButtons = document.querySelectorAll(".header-nav button");
  navButtons.forEach(function (b) {
    b.classList.toggle("is-current", b.dataset.go === viewName);
  });

  window.scrollTo(0, 0);
}

/* 3. 온보딩 */

function gotoOnboardStep(n) {
  const steps = document.querySelectorAll(".onboard-step");
  steps.forEach(function (s) {
    s.classList.remove("is-active");
  });
  const target = $("onboard-step-" + n);
  if (target) {
    target.classList.add("is-active");
  }
  window.scrollTo(0, 0);
}

function setupOnboarding() {
  $("btn-nickname-next").addEventListener("click", function () {
    const value = $("input-nickname").value.trim();
    if (!value) {
      toast("별명을 하나 적어주세요");
      return;
    }
    state.profile.nickname = value;
    saveState(state);
    gotoOnboardStep(2);
  });

  const ageButtons = $("choice-ageband").querySelectorAll("button");
  ageButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.profile.ageBand = btn.dataset.age;
      saveState(state);
      gotoOnboardStep(3);
    });
  });

  const areaButtons = $("choice-area").querySelectorAll("button");
  areaButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.profile.focusArea = btn.dataset.area;
      state.flags.onboardingDone = true;
      saveState(state);
      startCheck(btn.dataset.area);
    });
  });
}

/* 4. 오늘의 체크 */

function startCheck(area) {
  currentArea = area;
  currentAnswers = {};

  $("check-area-name").textContent = AREAS[area].name;
  renderQuestions(area);
  updateCheckProgress();
  hide($("area-picker"));
  goto("check");
}

function renderQuestions(area) {
  const list = QUESTIONS[area];
  const labels = area === "behavior" ? ANSWER_LABELS.behavior : ANSWER_LABELS.normal;
  const box = $("check-questions");
  box.innerHTML = "";

  list.forEach(function (q, index) {
    const wrap = document.createElement("div");
    wrap.className = "question";

    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = (index + 1) + ". " + q.text;
    wrap.appendChild(text);

    const grid = document.createElement("div");
    grid.className = "answer-grid";

    labels.forEach(function (label, value) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-answer";
      btn.textContent = label;
      btn.addEventListener("click", function () {
        currentAnswers[q.id] = value;
        grid.querySelectorAll("button").forEach(function (b) {
          b.classList.remove("is-selected");
        });
        btn.classList.add("is-selected");
        updateCheckProgress();
      });
      grid.appendChild(btn);
    });

    wrap.appendChild(grid);
    box.appendChild(wrap);
  });
}

function updateCheckProgress() {
  const count = Object.keys(currentAnswers).length;
  $("check-progress-text").textContent = count + " / 4 답변함";
  $("check-progress-fill").style.width = (count / 4 * 100) + "%";
  $("btn-get-missions").disabled = count < 2;
}

function setupCheck() {
  $("btn-change-area").addEventListener("click", function () {
    const picker = $("area-picker");

    if (!picker.classList.contains("is-hidden")) {
      hide(picker);
      return;
    }

    picker.innerHTML = "";
    AREA_ORDER.forEach(function (key) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-choice";
      btn.textContent = AREAS[key].name;
      btn.addEventListener("click", function () {
        startCheck(key);
      });
      picker.appendChild(btn);
    });
    show(picker);
  });

  $("btn-get-missions").addEventListener("click", function () {
    submitCheck(false);
  });

  $("btn-same-as-yesterday").addEventListener("click", function () {
    const yesterday = getYesterdayAnswers(state);
    if (yesterday) {
      currentAnswers = Object.assign({}, yesterday);
      delete currentAnswers.area;
    }
    if (!currentArea) {
      currentArea = decideTodayArea(state);
    }
    submitCheck(true);
  });
}

/* 5. 체크 제출 */

function submitCheck(isSameAsYesterday) {
  const danger = currentAnswers[SAFETY_TRIGGER.questionId] === SAFETY_TRIGGER.value;

  const record = Object.assign({ area: currentArea }, currentAnswers);
  state.assessment.dailyAnswers[todayStr()] = record;
  state.assessment.todayArea = currentArea;
  state.assessment.lastCheckedAt = new Date().toISOString();

  if (isNewDay(state)) {
    resetToday(state);
  }

  if (isSameAsYesterday) {
    addXp(state, XP_RULES.sameAsYesterday);
  } else {
    addXp(state, XP_RULES.record);
  }

  saveState(state);
  renderDashboard();
  goto("dashboard");

  hide($("safety-box"));

  if (danger) {
    showSafety();
    return;
  }

  loadMissions();
}

function showSafety() {
  const box = $("safety-box");
  $("safety-message").textContent = SAFETY_MESSAGE;

  const list = $("safety-resources");
  list.innerHTML = "";
  SAFETY_RESOURCES.forEach(function (item) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });

  show(box);
  hide($("loading-box"));
}

/* 6. 미션 준비 (14단계에서 AI 호출로 교체) */

function loadMissions() {
  hide($("error-box"));
  show($("loading-box"));

  const area = currentArea || decideTodayArea(state);

  setTimeout(function () {
    const base = FALLBACK_MISSIONS[area] || FALLBACK_MISSIONS.request;

    state.today.date = todayStr();
    state.today.missions = base.map(function (m) {
      return Object.assign({ status: "pending" }, m);
    });

    state.today.verse = pickVerse(area);

    ensureWeeklyChallenge(state, area);
    saveState(state);

    hide($("loading-box"));
    renderDashboard();
  }, 400);
}

function pickVerse(area) {
  const category = AREAS[area].verseCategory;
  const pool = VERSES.filter(function (v) {
    return v.category === category;
  });
  const picked = pool[Math.floor(Math.random() * pool.length)] || VERSES[0];

  return {
    reference: picked.reference,
    text: picked.text,
    forParent: "오늘 여기까지 오신 것만으로 충분합니다. 잘 해내지 않아도 괜찮아요.",
    todayStep: "미션 하나만 골라서 3분만 해보세요. 그거면 오늘 몫은 다 하신 거예요."
  };
}

/* 7. 대시보드 그리기 */

function renderDashboard() {
  renderLevel();
  renderTree();
  renderMissions();
  renderVerse();
  renderChallenge();
  renderHeatmap();
  renderBadges();
}

function renderLevel() {
  const p = getLevelProgress(state.gamification.totalXp);
  $("level-name").textContent = "Lv" + p.level.lv + " " + p.level.name;
  $("xp-fill").style.width = p.percent + "%";
  $("xp-text").textContent = p.current + " / " + p.needed + " XP";

  const streak = state.gamification.streakDays;
  $("streak-text").textContent = streak > 0
    ? "함께한 지 " + streak + "일"
    : "오늘부터 시작해요";
}

/* 7-B. 우리의 숲

   레벨이 오르면 나무가 자랍니다.
   열매를 하나 받을 때마다 나무에 열매가 하나 맺힙니다. */

const GROUND = '<ellipse cx="100" cy="146" rx="72" ry="9" fill="#e2d9c9"/>';

const TREE_ART = {
  1: {
    stage: "새싹이 돋았어요",
    desc: "작게 시작해도 괜찮아요. 이미 자라고 있어요.",
    body: GROUND +
      '<path d="M100 146 L100 126" stroke="#8a7861" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M100 132 C86 128 82 116 92 114 C101 112 101 126 100 132Z" fill="#6aa886"/>' +
      '<path d="M100 132 C114 128 118 116 108 114 C99 112 99 126 100 132Z" fill="#8cc0a3"/>',
    fruits: [[80, 138], [120, 138], [88, 128], [112, 128]]
  },
  2: {
    stage: "줄기가 자랐어요",
    desc: "매일 조금씩, 눈에 안 보여도 자라고 있어요.",
    body: GROUND +
      '<path d="M100 146 L100 100" stroke="#8a7861" stroke-width="4" stroke-linecap="round"/>' +
      '<ellipse cx="84" cy="118" rx="16" ry="8" fill="#6aa886" transform="rotate(-22 84 118)"/>' +
      '<ellipse cx="116" cy="118" rx="16" ry="8" fill="#8cc0a3" transform="rotate(22 116 118)"/>' +
      '<ellipse cx="87" cy="102" rx="14" ry="7" fill="#8cc0a3" transform="rotate(-25 87 102)"/>' +
      '<ellipse cx="113" cy="102" rx="14" ry="7" fill="#6aa886" transform="rotate(25 113 102)"/>',
    fruits: [[76, 130], [124, 130], [78, 112], [122, 112], [100, 94], [86, 90]]
  },
  3: {
    stage: "잎이 무성해졌어요",
    desc: "기다려주신 시간이 잎이 되었어요.",
    body: GROUND +
      '<path d="M100 146 L100 96" stroke="#8a7861" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="100" cy="82" r="30" fill="#6aa886"/>' +
      '<circle cx="82" cy="92" r="20" fill="#8cc0a3"/>' +
      '<circle cx="118" cy="92" r="20" fill="#8cc0a3"/>',
    fruits: [
      [88, 74], [112, 74], [100, 62], [78, 90],
      [122, 90], [100, 92], [90, 100], [110, 100]
    ]
  },
  4: {
    stage: "가지가 뻗었어요",
    desc: "쌓인 하루들이 가지가 되어 뻗어갑니다.",
    body: GROUND +
      '<path d="M100 146 L100 90" stroke="#8a7861" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M100 112 L76 98" stroke="#8a7861" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M100 106 L124 92" stroke="#8a7861" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="100" cy="72" r="34" fill="#6aa886"/>' +
      '<circle cx="70" cy="88" r="22" fill="#8cc0a3"/>' +
      '<circle cx="130" cy="84" r="22" fill="#8cc0a3"/>',
    fruits: [
      [88, 62], [112, 62], [100, 50], [78, 72],
      [122, 72], [100, 82], [66, 84], [132, 80],
      [90, 92], [112, 92]
    ]
  },
  5: {
    stage: "나무가 되었어요",
    desc: "이만큼 자란 건 매일 곁에 계셨기 때문이에요.",
    body: GROUND +
      '<path d="M100 146 L100 86" stroke="#7d6b55" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M100 110 L70 92" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M100 104 L130 86" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="100" cy="64" r="38" fill="#4f8f6d"/>' +
      '<circle cx="62" cy="82" r="26" fill="#6aa886"/>' +
      '<circle cx="138" cy="78" r="26" fill="#6aa886"/>' +
      '<circle cx="100" cy="44" r="24" fill="#8cc0a3"/>',
    fruits: [
      [86, 54], [114, 54], [100, 38], [76, 68],
      [124, 68], [100, 76], [56, 80], [144, 76],
      [88, 86], [112, 86], [66, 62], [134, 60]
    ]
  },
  6: {
    stage: "작은 숲이 되었어요",
    desc: "한 그루가 숲이 되었습니다. 여기까지 오셨어요.",
    body: GROUND +
      '<path d="M46 146 L46 108" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="46" cy="94" r="24" fill="#6aa886"/>' +
      '<path d="M154 146 L154 108" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="154" cy="94" r="24" fill="#6aa886"/>' +
      '<path d="M100 146 L100 82" stroke="#7d6b55" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M100 108 L74 90" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M100 102 L126 84" stroke="#7d6b55" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="100" cy="58" r="40" fill="#4f8f6d"/>' +
      '<circle cx="70" cy="76" r="26" fill="#6aa886"/>' +
      '<circle cx="130" cy="72" r="26" fill="#6aa886"/>' +
      '<circle cx="100" cy="36" r="24" fill="#8cc0a3"/>',
    fruits: [
      [86, 48], [114, 48], [100, 30], [76, 62],
      [124, 62], [100, 70], [64, 78], [136, 74],
      [88, 80], [112, 80], [40, 92], [160, 92]
    ]
  }
};

function renderTree() {
  const level = getLevel(state.gamification.totalXp);
  const art = TREE_ART[level.lv] || TREE_ART[1];
  const fruitCount = state.gamification.badges.length;

  let inner = art.body;

  const shown = Math.min(fruitCount, art.fruits.length);
  for (let i = 0; i < shown; i++) {
    const pos = art.fruits[i];
    inner += '<circle cx="' + pos[0] + '" cy="' + pos[1] +
      '" r="5.5" fill="#e8a87c"/>';
    inner += '<circle cx="' + (pos[0] - 1.6) + '" cy="' + (pos[1] - 1.6) +
      '" r="1.6" fill="#f6d3b8"/>';
  }

  $("tree-art").innerHTML =
    '<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" ' +
    'role="img" aria-label="' + art.stage + ', 열매 ' + fruitCount + '개">' +
    inner + '</svg>';

  $("tree-stage").textContent = art.stage;

  if (fruitCount === 0) {
    $("tree-desc").textContent = art.desc;
  } else {
    let msg = art.desc + " 열매 " + fruitCount + "개가 맺혔어요.";
    if (fruitCount > art.fruits.length) {
      msg += " 나무가 더 자라면 다 보여드릴게요.";
    }
    $("tree-desc").textContent = msg;
  }
}

function renderMissions() {
  const box = $("mission-list");
  box.innerHTML = "";

  if (!state.today.missions.length) {
    const p = document.createElement("p");
    p.className = "empty-text";
    p.textContent = "오늘의 체크를 하시면 미션이 준비됩니다.";
    box.appendChild(p);
    return;
  }

  state.today.missions.forEach(function (m, index) {
    const card = document.createElement("div");
    card.className = "mission-card" + (m.status === "done" ? " is-done" : "");

    const body = document.createElement("button");
    body.type = "button";
    body.className = "mission-body";
    body.addEventListener("click", function () {
      openMission(index);
    });

    const title = document.createElement("p");
    title.className = "mission-title";
    title.textContent = (index + 1) + ". " + m.title;
    body.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "mission-meta";
    meta.textContent = "약 " + m.minutes + "분 · " + AREAS[m.area].short;
    body.appendChild(meta);

    card.appendChild(body);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn-done";
    doneBtn.textContent = "했어요";
    doneBtn.addEventListener("click", function () {
      completeMission(index, "done");
    });
    card.appendChild(doneBtn);

    box.appendChild(card);
  });
}

function renderVerse() {
  const v = state.today.verse;
  if (!v) {
    return;
  }
  $("verse-for-parent").textContent = v.forParent;
  $("verse-today-step").textContent = v.todayStep;
  $("verse-text").textContent = v.text;
  $("verse-reference").textContent = v.reference;
}

function renderChallenge() {
  const wc = state.weeklyChallenge;
  if (!wc) {
    return;
  }
  $("challenge-title").textContent = wc.title;
  $("challenge-count").textContent = wc.progress + " / " + wc.target;
  $("challenge-fill").style.width =
    Math.min(100, wc.progress / wc.target * 100) + "%";
}

function renderHeatmap() {
  const box = $("heatmap");
  box.innerHTML = "";

  getRecentDays(state).forEach(function (day) {
    const cell = document.createElement("div");
    cell.className = "heat-cell" + (day.active ? " is-active" : "");
    cell.textContent = day.label;
    box.appendChild(cell);
  });
}

function renderBadges() {
  const box = $("badge-list");
  box.innerHTML = "";

  if (!state.gamification.badges.length) {
    const p = document.createElement("p");
    p.className = "empty-text";
    p.textContent = TONE.emptyBadge;
    box.appendChild(p);
    return;
  }

  state.gamification.badges.forEach(function (b) {
    const info = BADGES.find(function (x) {
      return x.id === b.id;
    });
    if (!info) {
      return;
    }
    const chip = document.createElement("span");
    chip.className = "badge-item";
    chip.textContent = info.name;
    box.appendChild(chip);
  });
}

/* 8. 미션 상세 모달 */

function openMission(index) {
  const m = state.today.missions[index];
  if (!m) {
    return;
  }
  openedMissionIndex = index;

  $("modal-title").textContent = m.title;
  $("modal-meta").textContent = "약 " + m.minutes + "분 · " + AREAS[m.area].short;
  $("modal-why").textContent = m.why;

  const steps = $("modal-steps");
  steps.innerHTML = "";
  m.steps.forEach(function (s) {
    const li = document.createElement("li");
    li.textContent = s;
    steps.appendChild(li);
  });

  const hints = $("modal-hints");
  hints.innerHTML = "";
  m.successHints.forEach(function (h) {
    const li = document.createElement("li");
    li.textContent = h;
    hints.appendChild(li);
  });

  show($("modal-mission"));
}

function closeMission() {
  hide($("modal-mission"));
  openedMissionIndex = -1;
}

/* 9. 미션 완료 처리 (감점 없음) */

function completeMission(index, action) {
  const m = state.today.missions[index];
  if (!m) {
    return;
  }

  const xp = action === "done" ? XP_RULES.done : XP_RULES.tried;
  m.status = action;

  const result = addXp(state, xp);
  state.counters[m.area] = (state.counters[m.area] || 0) + 1;
  addLog(state, { area: m.area, action: action, xp: xp });

  touchStreak(state);
  const challengeDone = bumpChallenge(state, m.area);
  const newBadges = checkBadges(state);

  saveState(state);
  closeMission();
  renderDashboard();

  if (result.leveledUp) {
    toast("레벨업! " + result.newLevel.name);
  } else if (challengeDone) {
    toast("이번 주 챌린지 달성! +50 XP");
  } else if (newBadges.length) {
    toast("열매 하나 맺혔어요: " + newBadges[0].name);
  } else {
    toast("+" + xp + " XP");
  }
}

/* 10. 쉬어가기 */

function restToday() {
  if (state.today.restUsed) {
    toast("오늘은 이미 눌러주셨어요");
    return;
  }

  state.today.restUsed = true;
  addXp(state, XP_RULES.rest);
  addLog(state, { area: "", action: "rest", xp: XP_RULES.rest });
  touchStreak(state);
  giveBadge(state, "rest_ok");

  saveState(state);
  renderDashboard();
  toast(TONE.restDone);
}

/* 11. 설정 */

function renderSettings() {
  $("setting-nickname").textContent = state.profile.nickname || "-";
  $("setting-ageband").textContent = AGE_BANDS[state.profile.ageBand] || "-";
  $("setting-area").textContent =
    AREAS[state.profile.focusArea] ? AREAS[state.profile.focusArea].name : "-";
}

function setupSettings() {
  $("btn-edit-profile").addEventListener("click", function () {
    gotoOnboardStep(1);
    $("input-nickname").value = state.profile.nickname;
    goto("onboarding");
  });

  $("btn-export").addEventListener("click", function () {
    exportSummary();
    toast("기록을 저장했어요");
  });

  $("btn-reset").addEventListener("click", function () {
    const ok = confirm("모든 기록이 지워집니다. 되돌릴 수 없어요.\n정말 삭제할까요?");
    if (!ok) {
      return;
    }
    const ok2 = confirm("마지막 확인입니다. 정말 지울까요?");
    if (!ok2) {
      return;
    }
    clearAll();
    location.reload();
  });
}

/* 12. 버튼 연결 */

function setupNavigation() {
  document.querySelectorAll("[data-go]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const target = btn.dataset.go;

      if (target === "onboarding") {
        gotoOnboardStep(1);
        $("input-nickname").value = state.profile.nickname || "";
        goto("onboarding");
        return;
      }

      if (target === "check") {
        startCheck(decideTodayArea(state));
        return;
      }

      if (target === "settings") {
        renderSettings();
        goto("settings");
        return;
      }

      if (target === "dashboard") {
        renderDashboard();
        goto("dashboard");
        return;
      }

      goto(target);
    });
  });
}

function setupModal() {
  $("btn-modal-close").addEventListener("click", closeMission);
  $("modal-backdrop").addEventListener("click", closeMission);

  $("btn-mission-tried").addEventListener("click", function () {
    if (openedMissionIndex >= 0) {
      completeMission(openedMissionIndex, "tried");
    }
  });

  $("btn-mission-done").addEventListener("click", function () {
    if (openedMissionIndex >= 0) {
      completeMission(openedMissionIndex, "done");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMission();
    }
  });
}

function setupDashboard() {
  $("btn-rest-today").addEventListener("click", restToday);

  $("btn-retry").addEventListener("click", function () {
    hide($("error-box"));
    loadMissions();
  });

  $("btn-safety-continue").addEventListener("click", function () {
    hide($("safety-box"));
    loadMissions();
  });
}

/* 13. 시작 */

function init() {
  state = loadState();

  setupNavigation();
  setupOnboarding();
  setupCheck();
  setupDashboard();
  setupModal();
  setupSettings();

  if (isNewDay(state)) {
    resetToday(state);
    saveState(state);
  }

  if (state.flags.onboardingDone) {
    renderDashboard();
    goto("dashboard");
  } else {
    goto("landing");
  }
}

document.addEventListener("DOMContentLoaded", init);

