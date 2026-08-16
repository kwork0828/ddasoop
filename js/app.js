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

/* --------------------------------------------
   1. 짧은 도우미
   -------------------------------------------- */

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

/* --------------------------------------------
   2. 화면 전환
   -------------------------------------------- */

function goto(viewName) {
  const views = document.querySelectorAll(".view");
  views.forEach(function (v) {
    v.classList.remove("is-active");
  });

  const target = $("view-" + viewName);
  if (target) {
    target.classList.add("is-active");
  }

  // 랜딩과 온보딩에서는 상단 바를 감춥니다.
  const header = $("app-header");
  if (viewName === "landing" || viewName === "onboarding") {
    hide(header);
  } else {
    show(header);
  }

  // 현재 위치 표시
  const navButtons = document.querySelectorAll(".header-nav button");
  navButtons.forEach(function (b) {
    b.classList.toggle("is-current", b.dataset.go === viewName);
  });

  window.scrollTo(0, 0);
}

/* --------------------------------------------
   3. 온보딩
   -------------------------------------------- */

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
  // 스텝 1 : 별명
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

  // 스텝 2 : 월령 구간
  const ageButtons = $("choice-ageband").querySelectorAll("button");
  ageButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.profile.ageBand = btn.dataset.age;
      saveState(state);
      gotoOnboardStep(3);
    });
  });

  // 스텝 3 : 힘든 영역 1개
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

/* --------------------------------------------
   4. 오늘의 체크 (4문항)
   -------------------------------------------- */

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
  // 다른 영역 고르기
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

  // 미션 받기
  $("btn-get-missions").addEventListener("click", function () {
    submitCheck(false);
  });

  // 어제랑 똑같아요
  $("btn-same-as-yesterday").addEventListener("click", function () {
    const yesterday = getYesterdayAnswers(state);
    if (yesterday) {
      currentAnswers = Object.assign({}, yesterday);
      delete currentAnswers.area;
    }
    submitCheck(true);
  });
}

/* --------------------------------------------
   5. 체크 제출 -> 미션 준비
   -------------------------------------------- */

function submitCheck(isSameAsYesterday) {
  // 안전 검사 : 위험 신호가 있으면 미션보다 상담이 먼저입니다.
  const danger = currentAnswers[SAFETY_TRIGGER.questionId] === SAFETY_TRIGGER.value;

  // 오늘 기록 저장
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
  goto("dashboard");

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

/* --------------------------------------------
   6. 미션 준비

   지금은 기본 미션을 씁니다.
   14단계에서 AI 호출로 교체합니다.
   -------------------------------------------- */

function loadMissions() {
  hide($("error-box"));
  show($("loading-box"));

  setTimeout(function () {
    const base = FALLBACK_MISSIONS[currentArea] || FALLBACK_MISSIONS.request;

    state.today.date = todayStr();
    state.today.missions = base.map(function (m) {
      return Object.assign({ status: "pending" }, m);
    });

    state.today.verse = pickVerse(currentArea);

    ensureWeeklyChallenge(state, currentArea);
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
  const picked = pool[Math.floor(Math.random() * pool.length)];

  return {
    reference: picked.reference,
    text: picked.text,
    forParent: "오늘 여기까지 오신 것만으로 충분합니다. 잘 해내지 않아도 괜찮아요.",
    todayStep: "미션 하나만 골라서 3분만 해보세요. 그거면 오늘 몫은 다 하신 거예요."
  };
}

/* --------------------------------------------
   7. 대시보드 그리기
   -------------------------------------------- */

function renderDashboard() {
  renderLevel();
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
    doneBtn.textContent = m.status === "done" ? "했어요" : "했어요";
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

/* --------------------------------------------
   8. 미션 상세 모달
   -------------------------------------------- */

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

/* --------------------------------------------
   9. 미션 완료 처리
   실패해도 감점은 없습니다.
   -------------------------------------------- */

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

  const streakInfo = touchStreak(state);
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
    toast("배지 획득: " + newBadges[0].name);
  } else {
    toast("+" + xp + " XP");
  }
}

/* --------------------------------------------
   10. 쉬어가기
   -------------------------------------------- */

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

/* --------------------------------------------
   11. 설정
   -------------------------------------------- */

function renderSettings() {
  $("setting-nickname").textContent = state.profile.nickname || "-";
  $("setting-ageband").textContent =
    AGE_BANDS[state.profile.ageBand] || "-";
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
    exportState();
    toast("내 데이터를 내려받았어요");
  });

  $("btn-reset").addEventListener("click", function () {
    const ok = confirm(
      "모든 기록이 지워집니다. 되돌릴 수 없어요.\n정말 삭제할까요?"
    );
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

/* --------------------------------------------
   12. 버튼 연결
   -------------------------------------------- */

function setupNavigation() {
  document.querySelectorAll("[data-go]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const target = btn.dataset.go;

      if (target === "onboarding") {
        gotoOnboardStep(1);
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

/* --------------------------------------------
   13. 시작
   -------------------------------------------- */

function init() {
  state = loadState();

  setupNavigation();
  setupOnboarding();
  setupCheck();
  setupDashboard();
  setupModal();
  setupSettings();

  // 하루가 지났으면 오늘 칸을 비웁니다.
  if (isNewDay(state)) {
    resetToday(state);
    saveState(state);
  }

  // 처음 온 분은 랜딩, 다시 온 분은 대시보드로.
  if (state.flags.onboardingDone) {
    renderDashboard();
    goto("dashboard");
  } else {
    goto("landing");
  }
}

document.addEventListener("DOMContentLoaded", init);


