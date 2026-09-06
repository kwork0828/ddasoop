# 따숲 (ddasoop)

> 하루 3분, 마음이 따숲

지친 자폐/발달장애 아동 부모를 위한 홈코칭 서비스입니다.
체크 4개만 누르면 오늘의 3분 미션 3개와 오늘의 말씀이 준비됩니다.

## 이름의 유래

첫째 아이 시온(始溫) — 처음 시, 따뜻할 온.
그 이름의 뜻에서 시작했습니다.
따뜻함이 하루씩 쌓여 숲이 된다는 뜻으로 '따숲'이라 이름 붙였습니다.

## 배포 URL

https://ddasoop.vercel.app

## 기술 스택

- 프론트엔드: HTML / CSS / JavaScript (프레임워크 미사용)
- 백엔드: Vercel Serverless Functions (Python 3.14, `api/generate.py`)
- AI: Google Gemini API (`gemini-flash-latest`)
- 저장소: 브라우저 localStorage (서버 저장 없음)

## 개인정보

이 서비스는 아이의 정보를 서버에 저장하지 않습니다.
모든 기록은 사용자의 브라우저 안에만 남습니다.
실명, 생년월일, 진단명, 연락처, 사진을 입력받지 않습니다.

## 고지

따숲은 교육 참고용 서비스이며, 진단이나 치료를 대체하지 않습니다.

성경 본문: 『성경전서 개역한글판』(대한성서공회)
저작재산권 보호기간이 만료된 판본을 원문 그대로 인용합니다.

## 실행 방법

### 로컬 실행 (Vercel CLI)

```bash
npm install -g vercel
vercel dev
```

브라우저에서 `http://localhost:3000` 접속. 프런트(`index.html`, `css/`, `js/`)와
`api/generate.py`가 함께 실행되어 AI 기능까지 로컬에서 테스트할 수 있습니다.

### 배포

GitHub 저장소를 Vercel 프로젝트에 연결하면, `main` 브랜치에 푸시할 때마다
자동으로 재배포됩니다. `vercel.json`에서 프레임워크 자동 감지를 꺼 두었으므로
정적 파일과 `api/` 함수가 함께 인식됩니다.

## 환경 변수 설정

| 변수명 | 설명 | 발급처 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API 호출에 사용하는 키 | https://aistudio.google.com/apikey |

1. 저장소 루트의 `.env.example`을 복사해 `.env`로 이름을 바꾸고, 발급받은 키 값을 입력합니다.
2. `.env`는 `.gitignore`에 등록되어 있어 저장소에 올라가지 않습니다.
3. Vercel 배포 환경에는 로컬 `.env`가 자동으로 반영되지 않으므로,
   Vercel 프로젝트 설정 → Environment Variables에 `GEMINI_API_KEY`를 **Sensitive** 타입으로
   직접 등록한 뒤 재배포해야 합니다.
