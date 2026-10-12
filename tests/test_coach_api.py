"""api/coach.py 단위 테스트 (네트워크 없이 Gemini 응답을 흉내 낸다)

실행: python3 -m unittest discover -s tests -p "test_*.py"
"""
import io
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import coach  # noqa: E402


GOOD = {
    "summary": "회피 가능성이 큽니다. 이번 주는 쉬어요 카드만 연습하세요.",
    "abc": [{"a": "선생님 지시", "b": "종이 찢기", "c": "확인 필요", "source": "선생님 전달"}],
    "hypotheses": [
        {"function": "회피", "confidence": "중간", "reason": "지시 직후 시작"},
        {"function": "엉뚱함", "confidence": "높음", "reason": "버려져야 함"},
    ],
    "teacherMessage": "선생님, [아이] 일 감사합니다.",
    "practice": {"title": "쉬어요 카드", "when": "하루 3번", "script": "쉬어요 주면 돼", "success": "1번"},
    "inTheMoment": ["잠깐만, 숫자 셀게"],
    "avoid": ["집에서 다시 혼내기"],
    "referral": "",
}


def gemini_response(obj_or_text, status=200):
    text = obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text, ensure_ascii=False)
    res = mock.Mock()
    res.status_code = status
    res.json.return_value = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return res


class FakeHandler(coach.handler):
    """소켓 없이 핸들러를 돌린다."""

    def __init__(self, body):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.rfile = io.BytesIO(raw)
        self.wfile = io.BytesIO()
        self.headers = {"Content-Length": str(len(raw))}
        self.status = None

    def send_response(self, code, message=None):
        self.status = code

    def send_header(self, *a):
        pass

    def end_headers(self):
        pass

    def result(self):
        return self.status, json.loads(self.wfile.getvalue().decode("utf-8"))


def run(body, gemini=None, key="test-key"):
    h = FakeHandler(body)
    env = {"GEMINI_API_KEY": key} if key else {}
    with mock.patch.dict(os.environ, env, clear=True):
        if gemini is not None:
            with mock.patch.object(coach, "call_gemini", side_effect=gemini) as m:
                h.do_POST()
                return h.result() + (m,)
        h.do_POST()
        return h.result() + (None,)


SITUATION = "유치원에서 선생님이 시킨 걸 하기 싫어서 종이를 찢고 친구 식판에 침을 뱉었대요."


class CoachApiTest(unittest.TestCase):
    def test_success_normalizes_and_filters_bad_function(self):
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response(GOOD))
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        fns = [h["function"] for h in body["data"]["hypotheses"]]
        self.assertEqual(fns, ["회피"])
        self.assertEqual(body["data"]["practice"]["title"], "쉬어요 카드")

    def test_json_wrapped_in_fence_and_prose(self):
        text = "설명입니다\n```json\n" + json.dumps(GOOD, ensure_ascii=False) + "\n```"
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response(text))
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

    def test_broken_ai_output_returns_502_not_crash(self):
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response("그냥 글입니다"))
        self.assertEqual(status, 502)
        self.assertEqual(body["code"], "BAD_RESULT")

    def test_missing_practice_is_rejected(self):
        bad = dict(GOOD, practice={})
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response(bad))
        self.assertEqual(status, 502)

    def test_no_api_key(self):
        status, body, _ = run({"situation": SITUATION}, key=None)
        self.assertEqual(status, 503)
        self.assertEqual(body["code"], "NO_API_KEY")

    def test_short_input(self):
        status, body, m = run({"situation": "짧음"}, gemini=lambda k, p: gemini_response(GOOD))
        self.assertEqual(status, 400)
        m.assert_not_called()

    def test_bad_json_body(self):
        status, body, _ = run(b"{not json", gemini=lambda k, p: gemini_response(GOOD))
        self.assertEqual(status, 400)

    def test_non_object_body(self):
        status, body, _ = run(b"[1,2,3]", gemini=lambda k, p: gemini_response(GOOD))
        self.assertEqual(status, 400)

    def test_too_large_body(self):
        status, body, _ = run({"situation": "가" * 20000}, gemini=lambda k, p: gemini_response(GOOD))
        self.assertEqual(status, 413)

    def test_upstream_rate_limit(self):
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response(GOOD, 429))
        self.assertEqual(status, 429)

    def test_timeout(self):
        def boom(k, p):
            raise coach.requests.exceptions.Timeout()
        status, body, _ = run({"situation": SITUATION}, gemini=boom)
        self.assertEqual(status, 504)

    def test_phone_and_rrn_scrubbed_before_sending(self):
        seen = {}

        def capture(k, prompt):
            seen["prompt"] = prompt
            return gemini_response(GOOD)

        text = SITUATION + " 선생님 번호 010-1234-5678, 주민 210218-3123456"
        run({"situation": text}, gemini=capture)
        self.assertNotIn("010-1234-5678", seen["prompt"])
        self.assertNotIn("210218-3123456", seen["prompt"])
        self.assertIn("[번호 삭제]", seen["prompt"])

    def test_confidence_coerced(self):
        weird = dict(GOOD, hypotheses=[{"function": "관심", "confidence": "확실", "reason": "x"}])
        status, body, _ = run({"situation": SITUATION}, gemini=lambda k, p: gemini_response(weird))
        self.assertEqual(body["data"]["hypotheses"][0]["confidence"], "낮음")


if __name__ == "__main__":
    unittest.main()
