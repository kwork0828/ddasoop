"""따숲 앱 E2E 확인 (Playwright, 폰 화면 크기)

준비: python3 tests/dev_server.py 8787   (다른 터미널)
실행: python3 tests/e2e_app.py [스크린샷 폴더]
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8787")
SHOTS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ddasoop-shots"
os.makedirs(SHOTS, exist_ok=True)

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(detail) if detail and not cond else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=False)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844}, device_scale_factor=2,
        is_mobile=True, has_touch=True, locale="ko-KR",
        user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
        accept_downloads=True,
    )
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

    # 1) 첫 방문 → 온보딩
    page.goto(BASE + "/")
    page.wait_for_load_state("networkidle")
    shot(page, "01-landing")
    page.click("text=시작하기")
    page.fill("#input-nickname", "시온")
    page.click("#btn-nickname-next")
    page.click("[data-age='60_72plus']")
    page.click("[data-area='behavior']")
    expect(page.locator("#view-check")).to_be_visible()
    page.click("#btn-same-as-yesterday")
    expect(page.locator("#view-dashboard")).to_be_visible()
    check("온보딩 후 대시보드", True)

    check("첫날에는 백업 알림 안 뜸", not page.locator("#backup-remind").is_visible())

    # 2) 하단 탭바 위치
    nav = page.locator(".header-nav").bounding_box()
    check("하단 탭바가 화면 아래에 붙음", nav and nav["y"] + nav["height"] >= 844 - 2, nav)
    shot(page, "02-dashboard")

    # 3) 서비스워커 등록 · 매니페스트
    sw_ok = page.evaluate("""async () => {
      if (!('serviceWorker' in navigator)) return false;
      const r = await navigator.serviceWorker.ready; return !!r.active; }""")
    check("서비스워커 활성화", sw_ok)
    mf = json.loads(urllib.request.urlopen(BASE + "/manifest.webmanifest").read())
    check("매니페스트 display=standalone", mf.get("display") == "standalone")
    sizes = {i["sizes"] for i in mf["icons"]}
    check("아이콘 192·512", {"192x192", "512x512"} <= sizes)
    for icon in mf["icons"]:
        code = urllib.request.urlopen(BASE + icon["src"]).status
        check("아이콘 응답 " + icon["src"], code == 200)

    # 4) 행동 기록 저장 → 새로고침 후 유지
    page.click(".header-nav [data-go='behavior']")
    expect(page.locator("#view-behavior")).to_be_visible()
    page.click("#bh-chips-a >> text=지시 받음")
    page.click("#bh-chips-b >> text=물건 던지기·찢기")
    check("세 칸 중 둘만 고르면 저장 버튼 꺼짐", page.is_disabled("#bh-save"))
    page.click("#bh-chips-c >> text=크게 혼남")
    page.fill("#bh-note", "색칠하자고 하셨을 때")
    page.click("#bh-save")
    expect(page.locator("#bh-insight")).to_contain_text("이번 주 1번째 기록")
    shot(page, "03-behavior-log")
    page.reload()
    page.click(".header-nav [data-go='behavior']")
    expect(page.locator("#bh-log li")).to_have_count(1)
    check("기록이 새로고침 후에도 남음", True)

    # 5) 패턴: 10건 미만이면 가설 숨김, 10건 이상이면 표시
    page.click(".bh-tab[data-tab='pattern']")
    expect(page.locator("#bh-hypo")).to_contain_text("건 남았어요")
    check("10건 미만 가설 보류", True)
    page.evaluate("""() => {
      const box = JSON.parse(localStorage.getItem('ddasoop.abc.v1'));
      const now = Date.now();
      for (let i = 0; i < 11; i++) {
        box.records.push({id:'t'+i, ts: now - i*3600*1000*5, a: i<8 ? '지시 받음':'혼자 있음',
          b:'울음', c: i<8 ? '활동 중단':'무시함', note:''});
      }
      localStorage.setItem('ddasoop.abc.v1', JSON.stringify(box));
    }""")
    page.click(".bh-tab[data-tab='log']")
    page.click(".bh-tab[data-tab='pattern']")
    expect(page.locator("#bh-hypo")).to_contain_text("회피 가능성")
    shot(page, "04-pattern")
    check("10건 이상 회피 가설 표시", True)
    page.click("#bh-hypo >> text=이걸로 이번 주 실천 정하기")
    expect(page.locator("#bh-practice")).to_contain_text("쉬어요")

    # 6) 상황 코칭: 이름 가리기 → 응답에서 이름 복원
    page.click(".top-tab[data-top='concern']")
    page.fill("#bh-coach-input", "오늘 유치원에서 시온이가 선생님이 시킨 걸 하기 싫었는지 종이를 찢고 지온이 식판에 침을 뱉었대요. 엄마 번호 010-1234-5678")
    page.fill("#bh-coach-names", "지온")
    sent = {}
    page.on("request", lambda r: sent.update(body=r.post_data) if "/api/coach" in r.url else None)
    page.once("dialog", lambda d: d.accept())  # 실천 교체 확인창
    page.click("#bh-coach-submit")
    expect(page.locator("#bh-coach-result")).to_contain_text("한 줄 결론", timeout=15000)
    body = sent.get("body") or ""
    check("AI로 보낸 글에 아이 별명 없음", "시온" not in body, body[:120])
    check("AI로 보낸 글에 가린 이름 없음", "지온" not in body)
    check("AI로 보낸 글에 전화번호 없음", "010-1234-5678" not in body)
    check("AI로 보낸 글에 패턴 요약 포함", "최근 14일" in json.loads(body).get("pattern", ""))
    result_text = page.inner_text("#bh-coach-result")
    check("결과에 원래 이름 복원", "시온" in result_text and "[아이]" not in result_text)
    check("결과에 [이름1] 복원", "지온" in result_text and "[이름1]" not in result_text)
    shot(page, "05-coach-result")
    page.click("#bh-coach-result >> text=이걸로 이번 주 실천 정하기")
    expect(page.locator("#bh-practice")).to_contain_text("쉬어요 카드")

    # 7) 실천 체크 → 대시보드 반영
    page.click(".top-tab[data-top='routine']")
    page.click("#bh-practice >> text=했어요")
    expect(page.locator("#bh-practice .bh-practice-days")).to_contain_text("1일")
    page.click(".header-nav [data-go='dashboard']")
    expect(page.locator("#dash-practice")).to_contain_text("쉬어요 카드")
    check("대시보드에 이번 주 실천 표시", True)

    # 8) AI 실패 시 기본 가이드
    page.route("**/api/coach", lambda r: r.fulfill(status=502, content_type="application/json",
                                                     body=json.dumps({"ok": False, "code": "UPSTREAM_ERROR", "message": "실패"})))
    page.click(".header-nav [data-go='behavior']")
    page.click(".top-tab[data-top='concern']")
    page.fill("#bh-coach-input", "마트에서 장난감 안 사준다고 30분 동안 드러누워 울었어요.")
    page.click("#bh-coach-submit")
    expect(page.locator("#bh-coach-result")).to_contain_text("기본 가이드", timeout=10000)
    check("AI 실패 시 기본 가이드로 대체", True)
    page.unroute("**/api/coach")

    # 9) 백업 → 전체 삭제 → 복원
    page.click(".header-nav [data-go='settings']")
    with page.expect_download() as dl:
        page.click("#btn-backup-export")
    path = os.path.join(SHOTS, "backup.json")
    dl.value.save_as(path)
    backup = json.load(open(path, encoding="utf-8"))
    check("백업 파일 형식", backup.get("app") == "ddasoop" and "ddasoop.abc.v1" in backup["data"])
    before = page.evaluate("JSON.parse(localStorage.getItem('ddasoop.abc.v1')).records.length")
    page.evaluate("clearAll()")
    check("전체 삭제 후 기록 0", page.evaluate("localStorage.getItem('ddasoop.abc.v1')") is None)
    page.reload()
    page.click("text=이미 해보셨나요? 내 대시보드로")
    page.click(".header-nav [data-go='settings']")
    page.once("dialog", lambda d: d.accept())
    page.set_input_files("#input-backup-file", path)
    page.wait_for_load_state("load")
    time.sleep(1.2)
    after = page.evaluate("(JSON.parse(localStorage.getItem('ddasoop.abc.v1'))||{records:[]}).records.length")
    check("백업으로 복원", after == before, (before, after))

    # 잘못된 파일은 거부
    bad = os.path.join(SHOTS, "bad.json")
    json.dump({"app": "other", "data": {"x": "1"}}, open(bad, "w"))
    page.set_input_files("#input-backup-file", bad)
    time.sleep(0.5)
    check("다른 파일 복원 거부", page.evaluate("(JSON.parse(localStorage.getItem('ddasoop.abc.v1'))||{records:[]}).records.length") == before)

    # 10) 오프라인에서 열고 기록
    page.goto(BASE + "/")
    page.wait_for_load_state("networkidle")
    page.evaluate("navigator.serviceWorker.ready")
    time.sleep(1)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_load_state("load")
    check("오프라인에서 앱 열림", page.locator("#view-dashboard").is_visible(), page.url)
    check("오프라인 표시", page.locator("#offline-badge").is_visible())
    page.click(".header-nav [data-go='behavior']")
    page.click(".bh-tab[data-tab='log']")
    page.click("#bh-chips-a >> text=활동 전환")
    page.click("#bh-chips-b >> text=울음")
    page.click("#bh-chips-c >> text=달램")
    page.click("#bh-save")
    expect(page.locator("#bh-insight")).to_be_visible()
    check("오프라인에서 기록 저장", True)
    page.click(".top-tab[data-top='concern']")
    page.fill("#bh-coach-input", "오프라인 상태에서 코칭을 눌러 봅니다. 열 글자 넘게.")
    page.click("#bh-coach-submit")
    expect(page.locator("#bh-coach-result")).to_contain_text("기본 가이드")
    check("오프라인 코칭은 기본 가이드", True)
    shot(page, "06-offline")
    ctx.set_offline(False)

    # 11) 바로가기 ?go=behavior
    page.goto(BASE + "/?go=behavior")
    expect(page.locator("#view-behavior")).to_be_visible()
    check("홈 화면 바로가기로 행동 기록 열기", "go=" not in page.url)

    # 11-2) 카톡 공유로 들어오기: 글이 상황 코칭에 채워지고, 서버로는 안 감
    msg = "선생님: 오늘 시온이가 블록 정리하자고 하니 친구를 밀었어요."
    page.goto(BASE + "/?share_text=" + urllib.parse.quote(msg))
    expect(page.locator("#bh-panel-coach")).to_be_visible()
    check("공유받은 글이 입력칸에 채워짐", page.input_value("#bh-coach-input") == msg)
    check("공유 후 주소창에서 글 삭제", "share_text" not in page.url)
    hits = json.loads(urllib.request.urlopen(BASE + "/__last_prompt").read()).get("share_hits", 0)
    check("공유받은 글이 서버 접속 기록에 안 남음", hits == 0, hits)

    # 12) 콘솔 오류 · CSP 위반 없음
    bad_msgs = [e for e in errors if "ERR_INTERNET_DISCONNECTED" not in e and "Failed to load resource" not in e]
    check("콘솔 오류 없음", not bad_msgs, bad_msgs[:5])

    # 13) 작은 폰(360px) 가로 넘침 없음
    page.set_viewport_size({"width": 360, "height": 740})
    for view in ["dashboard", "behavior", "settings"]:
        page.click(".header-nav [data-go='%s']" % view)
        over = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        check("360px 가로 넘침 없음: " + view, not over)
    page.click(".header-nav [data-go='behavior']")
    page.click(".bh-tab[data-tab='log']")
    shot(page, "07-small-phone")

    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d개 중 %d개 통과" % (len(results), len(results) - len(failed)))
sys.exit(1 if failed else 0)
