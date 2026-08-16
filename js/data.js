/* ============================================
   따숲 (ddasoop) - data.js
   문항, 영역, 레벨, 배지 데이터
   ============================================ */

/* --------------------------------------------
   1. 월령 구간
   -------------------------------------------- */
const AGE_BANDS = {
  "24_35": "24~35개월",
  "36_47": "36~47개월",
  "48_59": "48~59개월",
  "60_72plus": "60개월 이상"
};

/* --------------------------------------------
   2. 8개 영역
   verseCategory : 이 영역인 날 어떤 성경 구절을 보여줄지
   -------------------------------------------- */
const AREAS = {
  request: {
    name: "말로 요구하기",
    short: "요구하기",
    verseCategory: "words"
  },
  sitting: {
    name: "앉아있기",
    short: "앉아있기",
    verseCategory: "waiting"
  },
  instruction: {
    name: "지시 따르기",
    short: "지시 따르기",
    verseCategory: "waiting"
  },
  eyecontact: {
    name: "눈맞춤 · 호명",
    short: "눈맞춤",
    verseCategory: "together"
  },
  imitation: {
    name: "모방",
    short: "모방",
    verseCategory: "words"
  },
  play: {
    name: "놀이 · 상호작용",
    short: "놀이",
    verseCategory: "together"
  },
  selfcare: {
    name: "자조 (식사 · 배변 · 옷)",
    short: "자조",
    verseCategory: "restart"
  },
  behavior: {
    name: "문제행동",
    short: "문제행동",
    verseCategory: "tired"
  }
};

const AREA_ORDER = [
  "request", "sitting", "instruction", "eyecontact",
  "imitation", "play", "selfcare", "behavior"
];

/* --------------------------------------------
   3. 답변 선택지
   숫자가 클수록 좋은 상태로 방향을 통일했습니다.
   -------------------------------------------- */
const ANSWER_LABELS = {
  normal: ["아직 못해요", "도와주면 해요", "혼자 해요"],
  behavior: ["자주 있어요", "가끔 있어요", "거의 없어요"]
};

/* --------------------------------------------
   4. 32문항 (8영역 x 4문항)

   출처 고지:
   VB-MAPP, PEP-R 등 표준화 검사의 원문항을 사용하지
   않았습니다. 일반적으로 알려진 발달 이정표를 참고하여
   부모가 집에서 관찰할 수 있는 행동으로 직접 재작성한
   자체 체크리스트이며, 진단 도구가 아닙니다.
   -------------------------------------------- */
const QUESTIONS = {
  request: [
    { id: "request_01", text: "원하는 물건을 손으로 가리켜서 알려주나요?" },
    { id: "request_02", text: "원하는 게 있을 때 소리를 내거나 말을 하나요?" },
    { id: "request_03", text: "도움이 필요할 때 어른을 쳐다보며 알리나요?" },
    { id: "request_04", text: "'물', '더' 같은 단어를 상황에 맞게 쓰나요?" }
  ],
  sitting: [
    { id: "sitting_01", text: "밥 먹을 때 자리에 3분 이상 앉아 있나요?" },
    { id: "sitting_02", text: "'앉자'라고 하면 의자에 앉나요?" },
    { id: "sitting_03", text: "좋아하는 활동을 할 때 5분 이상 앉아 있나요?" },
    { id: "sitting_04", text: "낯선 곳에서도 잠깐 앉아 있나요?" }
  ],
  instruction: [
    { id: "instruction_01", text: "'이리 와'라고 하면 오나요?" },
    { id: "instruction_02", text: "'주세요'라고 하면 물건을 건네주나요?" },
    { id: "instruction_03", text: "손짓 없이 말로만 해도 알아듣나요?" },
    { id: "instruction_04", text: "하던 걸 멈추라고 하면 멈추나요?" }
  ],
  eyecontact: [
    { id: "eyecontact_01", text: "이름을 부르면 쳐다보나요?" },
    { id: "eyecontact_02", text: "놀고 있을 때 이름을 불러도 반응하나요?" },
    { id: "eyecontact_03", text: "재미있는 걸 보면 어른을 쳐다보며 나누려 하나요?" },
    { id: "eyecontact_04", text: "어른이 가리키는 쪽을 따라 보나요?" }
  ],
  imitation: [
    { id: "imitation_01", text: "박수 치는 걸 따라 하나요?" },
    { id: "imitation_02", text: "장난감 가지고 노는 방식을 보고 따라 하나요?" },
    { id: "imitation_03", text: "어른이 낸 소리를 따라 내나요?" },
    { id: "imitation_04", text: "단어를 들려주면 비슷하게 따라 말하나요?" }
  ],
  play: [
    { id: "play_01", text: "어른과 마주 보고 하는 놀이를 즐기나요?" },
    { id: "play_02", text: "차례를 주고받는 놀이를 하나요?" },
    { id: "play_03", text: "먼저 놀자고 다가오나요?" },
    { id: "play_04", text: "인형에게 밥 주는 것 같은 흉내 놀이를 하나요?" }
  ],
  selfcare: [
    { id: "selfcare_01", text: "숟가락으로 혼자 떠먹나요?" },
    { id: "selfcare_02", text: "컵으로 흘리지 않고 마시나요?" },
    { id: "selfcare_03", text: "화장실에 가고 싶다고 알리나요?" },
    { id: "selfcare_04", text: "신발이나 옷을 혼자 벗나요?" }
  ],
  behavior: [
    { id: "behavior_01", text: "원하는 걸 못 얻을 때 크게 울거나 드러눕는 일이 있나요?" },
    { id: "behavior_02", text: "갑자기 일정이 바뀌면 많이 힘들어하나요?" },
    { id: "behavior_03", text: "진정되기까지 20분 넘게 걸리는 일이 있나요?" },
    { id: "behavior_04", text: "자기 몸이나 다른 사람을 아프게 하는 일이 있나요?" }
  ]
};

/* --------------------------------------------
   5. 안전 트리거
   이 문항에 이 값이 나오면 미션 대신 상담 안내를
   먼저 보여줍니다.
   -------------------------------------------- */
const SAFETY_TRIGGER = {
  questionId: "behavior_04",
  value: 0
};

const SAFETY_MESSAGE =
  "지금은 미션보다 전문가의 도움이 먼저일 수 있어요. " +
  "혼자 감당하지 않으셔도 됩니다.";

const SAFETY_RESOURCES = [
  "정신건강상담전화 1577-0199",
  "중앙장애아동 · 발달장애인지원센터 1670-5529",
  "가까운 발달장애인지원센터 또는 소아정신과"
];

/* --------------------------------------------
   6. XP 규칙
   감점은 어디에도 없습니다.
   -------------------------------------------- */
const XP_RULES = {
  tried: 10,
  done: 20,
  record: 5,
  weeklyChallenge: 50,
  rest: 5,
  recheck: 30,
  sameAsYesterday: 5
};

/* --------------------------------------------
   7. 코치 레벨 6단계
   -------------------------------------------- */
const LEVELS = [
  { lv: 1, name: "새싹코치",        min: 0,    max: 100,   message: "시작하신 것만으로 이미 하고 계세요." },
  { lv: 2, name: "관찰하는 코치",    min: 100,  max: 300,   message: "아이를 보는 눈이 생기고 있어요." },
  { lv: 3, name: "기다려주는 코치",  min: 300,  max: 700,   message: "기다려주는 게 제일 어려운데, 해내셨네요." },
  { lv: 4, name: "촉구를 줄이는 코치", min: 700, max: 1400, message: "도움을 조금씩 빼는 단계예요." },
  { lv: 5, name: "일반화 코치",      min: 1400, max: 2500,  message: "집 밖에서도 되기 시작합니다." },
  { lv: 6, name: "든든한 코치",      min: 2500, max: 99999, message: "여기까지 오신 것, 정말 대단해요." }
];

/* --------------------------------------------
   8. 배지 12종
   쉬어가기와 돌아오기도 보상 대상입니다.
   -------------------------------------------- */
const BADGES = [
  { id: "first_try",      name: "첫걸음",       desc: "미션을 처음 시도했어요" },
  { id: "first_request",  name: "첫 요구",      desc: "요구하기 미션을 해냈어요" },
  { id: "streak_3",       name: "3일 연속",     desc: "사흘을 함께했어요" },
  { id: "streak_7",       name: "일주일 함께",  desc: "일주일을 함께했어요" },
  { id: "eye_10",         name: "눈맞춤 10번",  desc: "눈맞춤 미션 10회" },
  { id: "sit_5",          name: "혼자 앉기",    desc: "앉아있기 미션 5회" },
  { id: "imitate_10",     name: "따라쟁이",     desc: "모방 미션 10회" },
  { id: "play_first",     name: "같이 놀았어요", desc: "놀이 미션을 해냈어요" },
  { id: "selfcare_first", name: "혼자 해냈어요", desc: "자조 미션을 해냈어요" },
  { id: "challenge_1",    name: "첫 챌린지",    desc: "주간 챌린지를 달성했어요" },
  { id: "rest_ok",        name: "쉬어가기",     desc: "쉬어가기를 눌러보셨어요" },
  { id: "comeback",       name: "다시 만나요",  desc: "오랜만에 돌아오셨어요" }
];

/* --------------------------------------------
   9. 주간 챌린지 후보
   영역별로 하나씩. 매주 월요일에 배정됩니다.
   -------------------------------------------- */
const WEEKLY_CHALLENGES = {
  request:     { title: "요구하기 5번 시도하기", target: 5 },
  sitting:     { title: "함께 앉아있기 5번 해보기", target: 5 },
  instruction: { title: "지시 따르기 5번 연습하기", target: 5 },
  eyecontact:  { title: "이름 부르고 기다리기 5번", target: 5 },
  imitation:   { title: "따라하기 놀이 5번", target: 5 },
  play:        { title: "마주 보고 놀기 5번", target: 5 },
  selfcare:    { title: "혼자 해보기 5번 기다려주기", target: 5 },
  behavior:    { title: "미리 알려주고 넘어가기 5번", target: 5 }
};

/* --------------------------------------------
   10. 부담을 주지 않는 문구 모음
   -------------------------------------------- */
const TONE = {
  streakBroken: "괜찮아요. 다시 오셨네요.",
  restDone: "오늘은 쉬어가는 것도 잘한 일이에요.",
  firstVisit: "여기까지 오신 것만으로 충분해요.",
  loading: "오늘의 미션을 준비하고 있어요...",
  emptyBadge: "첫 미션을 하시면 배지가 생겨요."
};
