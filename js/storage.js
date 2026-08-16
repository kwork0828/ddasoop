/* ============================================
   따숲 (ddasoop) - storage.js
   브라우저 localStorage 저장 관리

   서버에 아무것도 보내지 않습니다.
   모든 기록은 사용자의 브라우저 안에만 있습니다.
   ============================================ */

const STORAGE_KEY = "ddasoop_v1";
const LOG_LIMIT = 60;

/* --------------------------------------------
   1. 날짜 도우미
   -------------------------------------------- */

// 오늘 날짜를 2026-08-17 모양으로 돌려줍니다.
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// 며칠 전 날짜를 구합니다.
function dateStrBefore(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// 두 날짜 사이가 며칠인지 셉니다.
function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// 이번 주 월요일 날짜를 구합니다.
function mondayOfThisWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

/* --------------------------------------------
   2. 처음 시작할 때의 빈 데이터
   -------------------------------------------- */
function emptyState() {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    profile: {
      nickname: "",
      ageBand: "",
      focusArea: ""
    },

    assessment: {
      lastCheckedAt: null,
      todayArea: "",
      dailyAnswers: {}
    },

    gamification: {
      totalXp: 0,
      streakDays: 0,
      lastActiveDate: null,
      shieldWeekOf: null,
      badges: []
    },

    today: {
      date: "",
      missions: [],
      restUsed: false,
      verse: null
    },

    weeklyChallenge: null,

    counters: {
      request: 0, sitting: 0, instruction: 0, eyecontact: 0,
      imitation: 0, play: 0, selfcare: 0, behavior: 0
    },

    logs: [],

    flags: {
      onboardingDone: false,
      recheckDismissedAt: null
    }
  };
}

/* --------------------------------------------
   3. 저장 / 불러오기
   -------------------------------------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw);

    // 옛 버전 데이터면 새로 시작합니다.
    if (parsed.schemaVersion !== 1) {
      return emptyState();
    }
    return parsed;
  } catch (e) {
    // 저장된 내용이 깨졌을 때도 앱이 멈추지 않게 합니다.
    console.warn("저장된 데이터를 읽지 못해 새로 시작합니다.", e);
    return emptyState();
  }
}

function saveState(state) {
  try {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("저장하지 못했습니다.", e);
    return false;
  }
}

/* --------------------------------------------
   4. 레벨 계산
   -------------------------------------------- */

function getLevel(totalXp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].min) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

// 현재 레벨 안에서 얼마나 왔는지 구합니다.
function getLevelProgress(totalXp) {
  const lv = getLevel(totalXp);
  const span = lv.max - lv.min;
  const gained = totalXp - lv.min;
  const percent = Math.min(100, Math.round((gained / span) * 100));
  return {
    level: lv,
    current: gained,
    needed: span,
    percent: percent
  };
}

/* --------------------------------------------
   5. XP 더하기
   감점은 어디에도 없습니다.
   -------------------------------------------- */

function addXp(state, amount) {
  const before = getLevel(state.gamification.totalXp);
  state.gamification.totalXp += amount;
  const after = getLevel(state.gamification.totalXp);

  return {
    leveledUp: after.lv > before.lv,
    newLevel: after
  };
}

/* --------------------------------------------
   6. 스트릭 (연속 실행일)

   끊겨도 비난하지 않습니다.
   주 1회 자동 보호가 적용됩니다.
   -------------------------------------------- */

function touchStreak(state) {
  const today = todayStr();
  const last = state.gamification.lastActiveDate;

  // 오늘 이미 처리했으면 그대로 둡니다.
  if (last === today) {
    return { changed: false, protectedByShield: false, wasBroken: false };
  }

  // 처음 활동하는 경우
  if (!last) {
    state.gamification.streakDays = 1;
    state.gamification.lastActiveDate = today;
    return { changed: true, protectedByShield: false, wasBroken: false };
  }

  const gap = daysBetween(last, today);

  // 어제 했으면 이어집니다.
  if (gap === 1) {
    state.gamification.streakDays += 1;
    state.gamification.lastActiveDate = today;
    return { changed: true, protectedByShield: false, wasBroken: false };
  }

  // 하루 빠졌을 때 : 이번 주 보호가 남아 있으면 지켜줍니다.
  if (gap === 2) {
    const thisWeek = mondayOfThisWeek();
    if (state.gamification.shieldWeekOf !== thisWeek) {
      state.gamification.shieldWeekOf = thisWeek;
      state.gamification.streakDays += 1;
      state.gamification.lastActiveDate = today;
      return { changed: true, protectedByShield: true, wasBroken: false };
    }
  }

  // 그 외에는 1일부터 다시 시작합니다.
  const wasLong = state.gamification.streakDays >= 1 && gap > 7;
  state.gamification.streakDays = 1;
  state.gamification.lastActiveDate = today;
  return { changed: true, protectedByShield: false, wasBroken: true, longGap: wasLong };
}

/* --------------------------------------------
   7. 배지
   -------------------------------------------- */

function hasBadge(state, id) {
  return state.gamification.badges.some(function (b) {
    return b.id === id;
  });
}

function giveBadge(state, id) {
  if (hasBadge(state, id)) {
    return null;
  }
  const info = BADGES.find(function (b) {
    return b.id === id;
  });
  if (!info) {
    return null;
  }
  state.gamification.badges.push({
    id: id,
    earnedAt: new Date().toISOString()
  });
  return info;
}

// 조건을 훑어서 새로 받을 배지를 모두 지급합니다.
function checkBadges(state) {
  const earned = [];
  const c = state.counters;
  const streak = state.gamification.streakDays;

  function tryGive(id, condition) {
    if (condition) {
      const got = giveBadge(state, id);
      if (got) {
        earned.push(got);
      }
    }
  }

  tryGive("first_try", state.logs.length >= 1);
  tryGive("first_request", c.request >= 1);
  tryGive("streak_3", streak >= 3);
  tryGive("streak_7", streak >= 7);
  tryGive("eye_10", c.eyecontact >= 10);
  tryGive("sit_5", c.sitting >= 5);
  tryGive("imitate_10", c.imitation >= 10);
  tryGive("play_first", c.play >= 1);
  tryGive("selfcare_first", c.selfcare >= 1);

  return earned;
}

/* --------------------------------------------
   8. 기록 남기기
   -------------------------------------------- */

function addLog(state, entry) {
  state.logs.push({
    date: todayStr(),
    area: entry.area || "",
    action: entry.action,
    xp: entry.xp || 0,
    at: new Date().toISOString()
  });

  // 60일치만 보관합니다.
  const cutoff = dateStrBefore(LOG_LIMIT);
  state.logs = state.logs.filter(function (log) {
    return log.date >= cutoff;
  });
}

/* --------------------------------------------
   9. 최근 7일 기록 (히트맵용)
   -------------------------------------------- */

function getRecentDays(state) {
  const result = [];
  const labels = ["일", "월", "화", "수", "목", "금", "토"];

  for (let i = 6; i >= 0; i--) {
    const dateStr = dateStrBefore(i);
    const d = new Date(dateStr + "T00:00:00");
    const active = state.logs.some(function (log) {
      return log.date === dateStr;
    });
    result.push({
      date: dateStr,
      label: labels[d.getDay()],
      active: active
    });
  }
  return result;
}

/* --------------------------------------------
   10. 주간 챌린지
   -------------------------------------------- */

function ensureWeeklyChallenge(state, area) {
  const thisWeek = mondayOfThisWeek();

  if (state.weeklyChallenge && state.weeklyChallenge.weekOf === thisWeek) {
    return state.weeklyChallenge;
  }

  const base = WEEKLY_CHALLENGES[area] || WEEKLY_CHALLENGES.request;
  state.weeklyChallenge = {
    weekOf: thisWeek,
    area: area,
    title: base.title,
    target: base.target,
    progress: 0,
    completed: false
  };
  return state.weeklyChallenge;
}

function bumpChallenge(state, area) {
  const wc = state.weeklyChallenge;
  if (!wc || wc.completed || wc.area !== area) {
    return false;
  }
  wc.progress += 1;
  if (wc.progress >= wc.target) {
    wc.completed = true;
    state.gamification.totalXp += XP_RULES.weeklyChallenge;
    giveBadge(state, "challenge_1");
    return true;
  }
  return false;
}

/* --------------------------------------------
   11. 하루가 바뀌었는지 확인
   -------------------------------------------- */

function isNewDay(state) {
  return state.today.date !== todayStr();
}

function resetToday(state) {
  state.today = {
    date: todayStr(),
    missions: [],
    restUsed: false,
    verse: null
  };
}

/* --------------------------------------------
   12. 오늘 볼 영역 정하기

   기본은 온보딩에서 고른 영역입니다.
   같은 영역이 3일 이상 이어지면 화면에서
   다른 영역을 부드럽게 제안합니다.
   -------------------------------------------- */

function decideTodayArea(state) {
  const saved = state.assessment.todayArea;
  if (saved && state.assessment.lastCheckedAt) {
    const lastDate = state.assessment.lastCheckedAt.slice(0, 10);
    if (lastDate === todayStr()) {
      return saved;
    }
  }
  return state.profile.focusArea || "request";
}

/* --------------------------------------------
   13. 어제 답변 가져오기
   "어제랑 똑같아요" 버튼에서 씁니다.
   -------------------------------------------- */

function getYesterdayAnswers(state) {
  const answers = state.assessment.dailyAnswers;
  const dates = Object.keys(answers).sort().reverse();

  for (let i = 0; i < dates.length; i++) {
    if (dates[i] !== todayStr()) {
      return answers[dates[i]];
    }
  }
  return null;
}

/* --------------------------------------------
   14. 최근에 다룬 영역
   미션이 겹치지 않게 서버에 알려줍니다.
   -------------------------------------------- */

function getRecentAreas(state) {
  const areas = [];
  const recent = state.logs.slice(-9);

  for (let i = recent.length - 1; i >= 0; i--) {
    const a = recent[i].area;
    if (a && areas.indexOf(a) === -1) {
      areas.push(a);
    }
    if (areas.length >= 3) {
      break;
    }
  }
  return areas;
}

/* --------------------------------------------
   15. 내보내기 / 전체 삭제
   -------------------------------------------- */

function exportState() {
  const state = loadState();
  const text = JSON.stringify(state, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ddasoop-" + todayStr() + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}
