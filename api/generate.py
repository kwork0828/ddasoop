"""
따숲(ddasoop) - AI 쉼 처방 API
POST /api/generate

입력(JSON): { "mood": "지침", "note": "요즘 잠이 안 와요", "mission": "물 마시기" }
출력(JSON): { "ok": true, "data": { "title", "message", "action", "keyword" } }
"""

from http.server import BaseHTTPRequestHandler
import json
import os

import requests

MODEL_NAME = "gemini-2.0-flash"
API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    + MODEL_NAME
    + ":generateContent"
)
TIMEOUT_SECONDS = 20
MAX_NOTE_LENGTH = 500

PROMPT_RULE = """너는 '따숲'이라는 마음 돌봄 서비스의 따뜻한 안내자다.
사용자가 남긴 짧은 기록을 읽고, 판단하거나 훈계하지 말고 먼저 공감하라.
그다음 오늘 당장 5분 안에 할 수 있는 아주 작은 실천 하나를 제안하라.

규칙:
- 존댓말을 쓰되 딱딱하지 않게, 친구처럼 다정하게 말한다.
- 의학적 진단이나 치료 조언은 하지 않는다.
- message는 두 문장 이내, action은 한 문장으로 쓴다.
- keyword는 오늘의 기분을 담은 한글 단어 하나로 쓴다.

반드시 아래 JSON 형식으로만 답하라.
{"title": "...", "message": "...", "action": "...", "keyword": "..."}
"""


def build_prompt(mood, note, mission):
    """사용자 입력을 하나의 질문 문장으로 합친다."""
    lines = [PROMPT_RULE, "", "[사용자 기록]"]
    if mood:
        lines.append("오늘의 기분: " + mood)
    if mission:
        lines.append("진행 중인 미션: " + mission)
    lines.append("남긴 말: " + note)
    return "\n".join(lines)


def call_gemini(api_key, prompt):
    """Gemini API를 호출하고 파싱된 결과를 돌려준다."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
        },
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    return requests.post(
        API_URL,
        headers=headers,
        json=payload,
        timeout=TIMEOUT_SECONDS,
    )


def extract_text(gemini_json):
    """Gemini 응답 껍데기를 벗겨 실제 텍스트만 꺼낸다."""
    candidates = gemini_json.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts") or []
    if not parts:
        return ""
    return parts[0].get("text", "")


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
        # 1) 서버에 키가 있는지 확인
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            self._fail(
                500,
                "NO_API_KEY",
                "서버 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
            )
            return

        # 2) 요청 본문 읽기
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._fail(400, "BAD_JSON", "요청 형식이 올바르지 않아요.")
            return

        # 3) 빈 입력 검사
        mood = str(body.get("mood", "")).strip()
        note = str(body.get("note", "")).strip()
        mission = str(body.get("mission", "")).strip()

        if not note:
            self._fail(400, "EMPTY_INPUT", "오늘의 기록을 한 줄이라도 남겨 주세요.")
            return

        if len(note) > MAX_NOTE_LENGTH:
            note = note[:MAX_NOTE_LENGTH]

        # 4) Gemini 호출
        prompt = build_prompt(mood, note, mission)
        try:
            res = call_gemini(api_key, prompt)
        except requests.exceptions.Timeout:
            self._fail(
                504,
                "TIMEOUT",
                "숲이 잠시 조용하네요. 응답이 늦어지고 있어요. 다시 시도해 주세요.",
            )
            return
        except requests.exceptions.RequestException:
            self._fail(
                502,
                "NETWORK_ERROR",
                "네트워크 연결이 불안정해요. 잠시 후 다시 시도해 주세요.",
            )
            return

        # 5) Gemini가 오류를 돌려준 경우
        if res.status_code == 429:
            self._fail(
                429,
                "RATE_LIMIT",
                "요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요.",
            )
            return

        if res.status_code in (401, 403):
            self._fail(
                502,
                "AUTH_ERROR",
                "AI 연결에 문제가 생겼어요. 관리자에게 문의해 주세요.",
            )
            return

        if res.status_code >= 400:
            self._fail(
                502,
                "UPSTREAM_ERROR",
                "AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
            )
            return

        # 6) 응답 파싱
        try:
            text = extract_text(res.json())
        except ValueError:
            text = ""

        if not text:
            self._fail(
                502,
                "EMPTY_RESULT",
                "이번엔 답을 만들지 못했어요. 다시 한 번 시도해 주세요.",
            )
            return

        try:
            data = json.loads(text)
        except ValueError:
            # AI가 JSON을 어겼을 때의 대비책
            data = {
                "title": "오늘의 쉼",
                "message": text.strip()[:200],
                "action": "숨을 세 번 천천히 쉬어 보세요.",
                "keyword": "쉼",
            }

        result = {
            "title": str(data.get("title", "오늘의 쉼")),
            "message": str(data.get("message", "")),
            "action": str(data.get("action", "")),
            "keyword": str(data.get("keyword", "쉼")),
        }

        self._send(200, {"ok": True, "data": result})

    def log_message(self, fmt, *args):
        # 서버 로그에 요청 내용이 남지 않도록 비활성화 (키 노출 방지)
        return

