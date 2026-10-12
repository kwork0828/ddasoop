"""로컬 확인용 서버: 정적 파일 + /api/coach (Gemini 응답은 가짜로 대체)

실행: python3 tests/dev_server.py 8787
MOCK_MODE=good|fail 로 AI 성공/실패를 흉내 낸다.
vercel.json 의 보안 헤더를 그대로 붙여 CSP 위반도 같이 확인한다.
"""
import json
import mimetypes
import os
import sys
from http.server import ThreadingHTTPServer
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "api"))
import coach  # noqa: E402

with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as f:
    VERCEL = json.load(f)
GLOBAL_HEADERS = [h for rule in VERCEL["headers"] if rule["source"] == "/(.*)" for h in rule["headers"]]

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")

GOOD = {
    "summary": "[아이]의 행동은 하기 싫은 지시에서 벗어나려는 '회피'일 가능성이 있어요. 이번 주는 '쉬어요' 카드 하나만 연습해요.",
    "abc": [
        {"a": "선생님 지시", "b": "종이 찢기", "c": "확인 필요", "source": "선생님 → 엄마"},
        {"a": "확인 필요", "b": "식판에 침 뱉기", "c": "많이 혼남", "source": "선생님 → 엄마"},
    ],
    "hypotheses": [{"function": "회피", "confidence": "중간", "reason": "지시 직후 시작됐어요. [이름1] 얘기도 확인해 보세요."}],
    "teacherMessage": "선생님, 오늘 [아이] 일 알려주셔서 감사합니다.\n1. 어떤 활동이었는지 여쭤봐도 될까요?",
    "practice": {"title": "쉬어요 카드", "when": "하루 3번", "script": "[아이]야, 하기 싫으면 '쉬어요' 주면 돼.", "success": "하루 1번 건네면 성공"},
    "inTheMoment": ["잠깐만, 숫자 셀게. 하나~ 다섯"],
    "avoid": ["집에서 다시 혼내기"],
    "referral": "",
}

LAST_PAYLOAD = {}


def fake_gemini(key, prompt):
    LAST_PAYLOAD["prompt"] = prompt
    res = mock.Mock()
    if os.environ.get("MOCK_MODE") == "fail":
        res.status_code = 500
        res.json.return_value = {}
        return res
    res.status_code = 200
    res.json.return_value = {"candidates": [{"content": {"parts": [{"text": json.dumps(GOOD, ensure_ascii=False)}]}}]}
    return res


class Dev(coach.handler):
    def end_headers(self):
        for h in GLOBAL_HEADERS:
            self.send_header(h["key"], h["value"])
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/__last_prompt":
            return self._send(200, {"prompt": LAST_PAYLOAD.get("prompt", "")})
        if path == "/":
            path = "/index.html"
        full = os.path.abspath(os.path.join(ROOT, path.lstrip("/")))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self.send_response(404)
            self.end_headers()
            return
        with open(full, "rb") as f:
            data = f.read()
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if path in ("/sw.js", "/index.html", "/manifest.webmanifest"):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.startswith("/api/coach"):
            os.environ.setdefault("GEMINI_API_KEY", "dev")
            with mock.patch.object(coach, "call_gemini", side_effect=fake_gemini):
                return super().do_POST()
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    ThreadingHTTPServer(("127.0.0.1", port), Dev).serve_forever()
