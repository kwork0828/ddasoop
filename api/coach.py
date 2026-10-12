"""
따숲(ddasoop) - 상황 코칭 API
POST /api/coach

입력(JSON):
  {
    "situation": "유치원에서 선생님이 시킨 걸 하기 싫어서 종이를 찢고...",
    "ageBand": "60_72plus",          (선택)
    "pattern": "최근 14일 기록 12건. 가장 많은 직전 상황: 지시 받음(7)..."  (선택)
  }

출력(JSON):
  { "ok": true, "data": { summary, abc[], hypotheses[], teacherMessage,
                          practice{title, when, script, success},
                          inTheMoment[], avoid[], referral } }
  { "ok": false, "code": "...", "message": "..." }

개인정보 원칙
- 요청 본문과 AI 응답을 어디에도 저장하거나 로그로 남기지 않는다.
- 아이 이름 치환은 브라우저에서 이미 끝난 상태로 들어온다.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re

import requests

MODEL_NAME = "gemini-flash-latest"
API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    + MODEL_NAME
    + ":generateContent"
)
TIMEOUT_SECONDS = 50
MAX_SITUATION_LENGTH = 2000
MAX_PATTERN_LENGTH = 600
MAX_BODY_BYTES = 16 * 1024

AGE_LABELS = {
    "24_35": "24~35개월",
    "36_47": "36~47개월",
    "48_59": "48~59개월",
    "60_72plus": "60개월 이상",
}

FUNCTIONS = ["회피", "관심", "물건획득", "감각", "신체·컨디션"]
CONFIDENCES = ["낮음", "중간", "높음"]

PROMPT_RULE = """너는 자폐·발달지연 아동 부모를 돕는 행동 코칭 안내자다.
부모가 남긴 상황(유치원 전달사항, 음성메모 녹취, 직접 본 일)을 읽고
ABC(직전 상황-행동-직후 결과)로 정리한 뒤, 집과 기관에서 내일부터 할 수 있는
실천 하나로 바꿔준다. 진단이나 치료가 아니라 기록 정리와 실천 제안이다.

원칙:
1. 부모를 숙제 검사하지 않는다. 실천은 딱 1개. 부모를 탓하는 말은 쓰지 않는다.
2. 행동 모양이 아니라 기능을 본다. 판단 근거는 주로 직전 상황과 직후 결과다.
3. 사건 1~2건으로는 가설일 뿐이다. 확신도는 '낮음' 또는 '중간'까지만 쓴다.
   전해 들은 정보(선생님→배우자→나)면 확신도를 한 단계 낮춘다.
4. 다치지 않고 남에게 피해 없는 자기자극(빙글빙글 돌기, 손 흔들기)은 없앨 대상이 아니다.
   우선순위: 안전 > 타인 피해 > 학습 방해 > 사회적 시선.
5. 혼내기보다 기술을 가르친다. '싫어요/쉬어요/도와주세요'처럼 대신 쓸 표현을 가르친다.
6. 기관에서 생긴 일로 집에서 다시 혼내지 않는다. 지연된 처벌은 아이에게 연결되지 않는다.
7. 안 된다고 할 때는 공감 → 이유 → 언제 되는지/대신 할 것 순서로, 짧고 조곤조곤 말한다.
8. 과각성(웃으며 뛰어다님, 흥분)일 때는 붙잡지 말고 몸으로 살짝 가로막고
   "잠깐만, 숫자 셀게. 하나~ 둘~ 셋~ 넷~ 다섯" 후 전환거리(좋아하는 간식 등)를 준다.
9. 상황에 등장하지 않은 사실을 지어내지 않는다. 모르는 칸은 "확인 필요"라고 쓴다.
10. 다치는 수준의 공격·자해 반복, 갑작스러운 퇴행, 통증·수면·배변 문제 의심이 있으면
    referral에 전문가 상담 권유를 한 문장으로 쓴다. 없으면 빈 문자열.

기능 분류(hypotheses.function)는 다음 중 하나만 쓴다:
회피, 관심, 물건획득, 감각, 신체·컨디션
확신도(confidence)는 다음 중 하나만 쓴다: 낮음, 중간, 높음

teacherMessage는 선생님께 카톡으로 그대로 보낼 수 있는 8줄 이내 문장이다.
감사 → 확인 질문 최대 3개(무엇을 시켰는지, 행동 직후 무슨 일이 있었는지, 시간대·컨디션)
→ 집에서 연습할 것 → 기관에서도 같은 반응 부탁 1가지. 지적이나 요구하는 톤은 쓰지 않는다.
아이를 부를 때는 입력에 쓰인 호칭을 그대로 쓴다.

설명이나 사고 과정은 쓰지 말고 JSON 객체 하나만 출력하라. 형식:
{
  "summary": "한두 문장 결론: 가장 가능성 높은 가설 + 오늘/내일 할 것 1개",
  "abc": [{"a": "직전 상황", "b": "행동", "c": "직후 결과", "source": "누가 봤는지"}],
  "hypotheses": [{"function": "회피", "confidence": "중간", "reason": "근거 한 줄"}],
  "teacherMessage": "...",
  "practice": {"title": "실천 이름", "when": "언제", "script": "그대로 읽을 대사", "success": "성공 기준"},
  "inTheMoment": ["그 순간 대처 대사 1", "대사 2"],
  "avoid": ["하지 말 것 1", "하지 말 것 2"],
  "referral": ""
}
"""


def build_prompt(situation, age_band, pattern):
    lines = [PROMPT_RULE, "", "[아이 정보]"]
    lines.append("월령: " + AGE_LABELS.get(age_band, "모름"))
    if pattern:
        lines.append("")
        lines.append("[앱에 쌓인 최근 기록 요약]")
        lines.append(pattern)
    lines.append("")
    lines.append("[부모가 남긴 상황]")
    lines.append(situation)
    return "\n".join(lines)


def call_gemini(api_key, prompt):
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    return requests.post(API_URL, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)


def extract_text(gemini_json):
    chunks = []
    for cand in gemini_json.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            if part.get("thought"):
                continue
            if part.get("text"):
                chunks.append(part["text"])
    text = "".join(chunks).strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if "```" in text:
            text = text[: text.rfind("```")]
    return text.strip()


def parse_json(text):
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            return json.loads(text[start : end + 1])
        except ValueError:
            return None


def _s(value, limit):
    """문자열로 바꾸고 길이를 자른다."""
    if value is None:
        return ""
    return str(value).strip()[:limit]


def _list_of_str(value, max_items, limit):
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:max_items]:
        text = _s(item, limit)
        if text:
            out.append(text)
    return out


def normalize(data):
    """AI 응답을 화면이 믿고 그릴 수 있는 모양으로 강제한다."""
    if not isinstance(data, dict):
        return None

    abc = []
    for row in (data.get("abc") or [])[:6]:
        if not isinstance(row, dict):
            continue
        item = {
            "a": _s(row.get("a"), 120) or "확인 필요",
            "b": _s(row.get("b"), 120) or "확인 필요",
            "c": _s(row.get("c"), 120) or "확인 필요",
            "source": _s(row.get("source"), 40),
        }
        abc.append(item)

    hypotheses = []
    for row in (data.get("hypotheses") or [])[:3]:
        if not isinstance(row, dict):
            continue
        fn = _s(row.get("function"), 20)
        if fn not in FUNCTIONS:
            continue
        conf = _s(row.get("confidence"), 10)
        if conf not in CONFIDENCES:
            conf = "낮음"
        hypotheses.append({"function": fn, "confidence": conf, "reason": _s(row.get("reason"), 160)})

    practice_raw = data.get("practice") if isinstance(data.get("practice"), dict) else {}
    practice = {
        "title": _s(practice_raw.get("title"), 60),
        "when": _s(practice_raw.get("when"), 120),
        "script": _s(practice_raw.get("script"), 300),
        "success": _s(practice_raw.get("success"), 160),
    }

    result = {
        "summary": _s(data.get("summary"), 300),
        "abc": abc,
        "hypotheses": hypotheses,
        "teacherMessage": _s(data.get("teacherMessage"), 700),
        "practice": practice,
        "inTheMoment": _list_of_str(data.get("inTheMoment"), 4, 200),
        "avoid": _list_of_str(data.get("avoid"), 4, 160),
        "referral": _s(data.get("referral"), 200),
    }

    if not result["summary"] or not practice["title"]:
        return None
    return result


PHONE_RE = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}")
RRN_RE = re.compile(r"\d{6}[-\s]?[1-4]\d{6}")


def scrub(text):
    """브라우저에서 놓친 전화번호·주민번호를 한 번 더 지운다."""
    text = RRN_RE.sub("[번호 삭제]", text)
    return PHONE_RE.sub("[번호 삭제]", text)


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _fail(self, status, code, message):
        self._send(status, {"ok": False, "code": code, "message": message})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        self._fail(405, "METHOD_NOT_ALLOWED", "POST 방식으로 요청해 주세요.")

    def do_POST(self):
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            self._fail(503, "NO_API_KEY", "AI 연결이 아직 준비되지 않았어요.")
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length > MAX_BODY_BYTES:
            self._fail(413, "TOO_LARGE", "내용이 너무 길어요. 2,000자 이내로 줄여 주세요.")
            return

        try:
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError("not an object")
        except (ValueError, UnicodeDecodeError):
            self._fail(400, "BAD_JSON", "요청 형식이 올바르지 않아요.")
            return

        situation = scrub(_s(body.get("situation"), MAX_SITUATION_LENGTH))
        pattern = scrub(_s(body.get("pattern"), MAX_PATTERN_LENGTH))
        age_band = _s(body.get("ageBand"), 20)

        if len(situation) < 10:
            self._fail(400, "EMPTY_INPUT", "상황을 조금 더 적어 주세요. (10자 이상)")
            return

        try:
            res = call_gemini(api_key, build_prompt(situation, age_band, pattern))
        except requests.exceptions.Timeout:
            self._fail(504, "TIMEOUT", "응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.")
            return
        except requests.exceptions.RequestException:
            self._fail(502, "NETWORK_ERROR", "AI 서버에 연결하지 못했어요.")
            return

        if res.status_code == 429:
            self._fail(429, "RATE_LIMIT", "요청이 많아요. 1분 뒤에 다시 시도해 주세요.")
            return
        if res.status_code >= 400:
            # 상태 코드만 남긴다. 사용자 입력이나 응답 본문은 로그에 남기지 않는다.
            print("[COACH UPSTREAM]", res.status_code)
            self._fail(502, "UPSTREAM_ERROR", "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")
            return

        try:
            gemini_json = res.json()
        except ValueError:
            gemini_json = {}

        data = normalize(parse_json(extract_text(gemini_json)))
        if data is None:
            self._fail(502, "BAD_RESULT", "이번엔 정리를 마치지 못했어요. 다시 한 번 시도해 주세요.")
            return

        self._send(200, {"ok": True, "data": data})

    def log_message(self, fmt, *args):
        return
