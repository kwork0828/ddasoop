/* ============================================
   따숲 (ddasoop) - storage.js
   브라우저 localStorage 저장 관리

   서버에 아무것도 보내지 않습니다.
   모든 기록은 사용자의 브라우저 안에만 있습니다.
   ============================================ */

const STORAGE_KEY = "ddasoop_v1";
const LOG_LIMIT = 60;

/* 1. 날짜 도우미 */

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function dateStrBefore(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

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

/* 2. 처음 시작할 때의 빈 데이터 */

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

/* 3. 저장 / 불러오기 */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw);

    if (parsed.schemaVersion !== 1) {
      return emptyState();
    }
    return parsed;
  } catch (e) {
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

/* 4. 레벨 계산 */

function getLevel(totalXp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].min) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

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

/* 5. XP 더하기 (감점 없음) */

function addXp(state, amount) {
  const before = getLevel(state.gamification.totalXp);
  state.gamification.totalXp += amount;
  const after = getLevel(state.gamification.totalXp);

  return {
    leveledUp: after.lv > before.lv,
    newLevel: after
  };
}

/* 6. 스트릭 */

function touchStreak(state) {
  const today = todayStr();
  const last = state.gamification.lastActiveDate;

  if (last === today) {
    return { changed: false, protectedByShield: false, wasBroken: false };
  }

  if (!last) {
    state.gamification.streakDays = 1;
    state.gamification.lastActiveDate = today;
    return { changed: true, protectedByShield: false, wasBroken: false };
  }

  const gap = daysBetween(last, today);

  if (gap === 1) {
    state.gamification.streakDays += 1;
    state.gamification.lastActiveDate = today;
    return { changed: true, protectedByShield: false, wasBroken: false };
  }

  if (gap === 2) {
    const thisWeek = mondayOfThisWeek();
    if (state.gamification.shieldWeekOf !== thisWeek) {
      state.gamification.shieldWeekOf = thisWeek;
      state.gamification.streakDays += 1;
      state.gamification.lastActiveDate = today;
      return { changed: true, protectedByShield: true, wasBroken: false };
    }
  }

  const wasLong = gap > 7;
  state.gamification.streakDays = 1;
  state.gamification.lastActiveDate = today;
  return { changed: true, protectedByShield: false, wasBroken: true, longGap: wasLong };
}

/* 7. 배지 */

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

/* 8. 기록 남기기 */

function addLog(state, entry) {
  state.logs.push({
    date: todayStr(),
    area: entry.area || "",
    action: entry.action,
    xp: entry.xp || 0,
    at: new Date().toISOString()
  });

  const cutoff = dateStrBefore(LOG_LIMIT);
  state.logs = state.logs.filter(function (log) {
    return log.date >= cutoff;
  });
}

/* 9. 최근 7일 (히트맵용) */

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

/* 10. 주간 챌린지 */

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

/* 11. 하루가 바뀌었는지 */

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

/* 12. 오늘 볼 영역 */

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

/* 13. 어제 답변 가져오기 */

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

/* 14. 최근에 다룬 영역 */

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

/* 15. 기록 저장 (읽을 수 있는 글)

   별명과 활동 기록만 담기며, 실명이나 진단명은 애초에 없습니다.
   이 기기에만 저장되고 어디로도 전송되지 않습니다. */

function buildSummaryText() {
  const s = loadState();
  const p = getLevelProgress(s.gamification.totalXp);
  const g = s.gamification;
  const lines = [];

  lines.push("따숲 기록");
  lines.push("하루 3분, 마음이 따숲");
  lines.push("========================================");
  lines.push("");
  lines.push("저장한 날 : " + todayStr());
  lines.push("아이 별명 : " + (s.profile.nickname || "-"));
  lines.push("월령 구간 : " + (AGE_BANDS[s.profile.ageBand] || "-"));
  lines.push("");
  lines.push("[ 지금까지 ]");
  lines.push("코치 레벨   : Lv" + p.level.lv + " " + p.level.name);
  lines.push("모은 경험치 : " + g.totalXp + " XP");
  lines.push("연속한 날   : " + g.streakDays + "일");
  lines.push("맺힌 열매   : " + g.badges.length + "개");
  lines.push("");

  lines.push("[ 맺힌 열매 ]");
  if (g.badges.length === 0) {
    lines.push("아직 없어요. 미션을 하나만 해보셔도 첫 열매가 맺혀요.");
  } else {
    g.badges.forEach(function (b) {
      const info = BADGES.find(function (x) { return x.id === b.id; });
      if (info) {
        lines.push("- " + info.name + " : " + info.desc);
      }
    });
  }
  lines.push("");

  lines.push("[ 영역별로 함께한 횟수 ]");
  let hasCount = false;
  Object.keys(s.counters).forEach(function (key) {
    if (s.counters[key] > 0) {
      hasCount = true;
      lines.push("- " + AREAS[key].name + " : " + s.counters[key] + "회");
    }
  });
  if (!hasCount) {
    lines.push("아직 기록이 없어요.");
  }
  lines.push("");

  lines.push("[ 최근 기록 ]");
  const recent = s.logs.slice(-40);
  if (recent.length === 0) {
    lines.push("아직 기록이 없어요.");
  } else {
    const actionName = { tried: "시도했어요", done: "해냈어요", rest: "쉬어갔어요" };
    recent.forEach(function (log) {
      const areaName = log.area && AREAS[log.area] ? AREAS[log.area].short : "쉼";
      lines.push(log.date + "  " + areaName + "  " + (actionName[log.action] || log.action));
    });
  }
  lines.push("");

  lines.push("========================================");
  lines.push("따숲은 교육 참고용 서비스이며,");
  lines.push("진단이나 치료를 대체하지 않습니다.");
  lines.push("이 기록은 이 기기에만 저장되며 어디로도 전송되지 않습니다.");

  return lines.join("\r\n");
}

function exportSummary() {
  const text = "\uFEFF" + buildSummaryText();
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ddasoop-record-" + todayStr() + ".txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}
