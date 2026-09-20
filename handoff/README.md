# PLOVE 프론트엔드 인수인계

버전 1.0.0 · 2026-09-20

## 이 폴더에 든 것

| 파일 | 용도 |
|---|---|
| `missions.json` | 6개 코스 × 11미션 = 66개 전체 데이터 |
| `design-tokens.json` | 색·타이포·라운드·간격·모션 토큰 |
| `economy.json` | LV·XP·보석·아이템·구독 가격과 규칙 |
| `copy.ko.json` | 화면 문구 전체 (한국어) |
| `screens.json` | 화면 목록과 상태 전이 |
| `assets/` | 이미지 67장 (별도 폴더) |

함께 볼 문서 (상위 폴더)

| 파일 | 용도 |
|---|---|
| `상세 기획서.html` | **가장 먼저 읽을 것.** 19개 섹션 — 화면·로직·API·DB·LLM·이메일 |
| `Plove 웹 01-02.dc.html` | 동작하는 프로토타입. 브라우저에서 바로 열린다 |
| `missions.js` | 프로토타입이 읽는 원본 (`window.PLOVE_MISSIONS`) |
| `PLOVE 이밸.dc.html` | LLM 품질 검사 도구 |
| `미션 검수표.html` | 미션 내용 검수용 |

## 프로토타입 읽는 법

`Plove 웹 01-02.dc.html` 한 파일에 전 화면이 들어 있다. 구조는 이렇다.

- **템플릿** — `<x-dc>` 안의 마크업. 화면마다 `<sc-if value="{{ onXxx }}">`로 분기한다
- **로직** — `class Component`. `renderVals()`가 템플릿에 넘길 값을 만든다
- **상태** — `this.state.screen`이 현재 화면. 값 목록은 기획서 4장에 있다

React로 옮길 때 `renderVals()`의 각 키가 그대로 props가 된다. 화면별 분기는 라우터로 바꾸면 된다.

## 미션 데이터 쓰는 법

```js
import data from './missions.json';

const course = data.courses.find(c => c.key === 'self');
const mission = course.missions[0];

mission.title       // "거울 속의 나 60초 보기"
mission.proofs      // [{ label: "거울 앞에서 찍은 셀카", kind: "photo" }]
mission.records     // [{ hint: "보이는 것" }, ...]
mission.isFinale    // 마지막 회고 미션 여부
```

**토큰 치환이 필요하다.** 문자열에 `{m}`(가족 구성원), `{p}`(반려동물 이름)이 들어 있다. 사용자가 고른 값으로 바꿔서 보여준다. 가족 코스는 `familyScope`가 `one`이면 특정 한 명, `all`이면 가족 전체를 대상으로 한다.

`proofs[].kind`는 다섯 가지다 — `photo` `video` `audio` `drawing` `handwriting`. 영상은 15초, 음성은 1분, 용량 120MB 제한이다.

## 이미지

`assets/` 67장. 모두 투명 배경이고 여백을 잘라낸 상태다 — 크기만 지정하면 된다.

| 묶음 | 수 | 규칙 |
|---|---|---|
| `stage-*.png` | 22 | 단계 아이콘. 미션의 `stage` 값으로 매핑 (기획서에 매핑표) |
| `ui-*.png` | 13 | 보상·아이템·상태 아이콘 |
| `nav-*.png` | 5 | 사이드바·하단 탭 |
| `npc-*.png`, `cupid-*.png` | 16 | 코스별 캐릭터. 기본 포즈 + cheer 포즈 |
| `subj-*.png` | 6 | 과목 선택 화면 이미지 |
| 로고·기타 | 5 | |

## 서버가 필요한 것

프로토타입은 전부 클라이언트에서 돈다. 코드에 `// 서버 연결 지점` 주석이 있는 곳이 연동 위치다.

1. **Google OAuth** — 로그인
2. **데이터 저장** — 진행도·기록·보상 (기획서 14장 DB 스키마)
3. **파일 스토리지** — 인증 사진·영상·음성 (지금은 `URL.createObjectURL`)
4. **결제 PG** — 구독·보석 충전 (`payThen()` 자리)
5. **Vision 분석** — 사진 적합성 판정 (`analyzePhotos()` 자리)
6. **이메일 발송** — 파트너 초대·구독권 선물 (기획서 15장)
7. **파트너 연결** — 초대·수락·권한 (기획서 11장)

## 주의할 점

**한글 입력** — 조합 중 Enter를 막아야 한다. 안 하면 "안녕"이 "안"으로 전송된다. `isComposing` + `keyCode 229` + `compositionstart/end`를 함께 본다.

**채팅 레이아웃** — 루트를 `position: fixed; inset: 0`으로 둔다. `min-height: 100vh`를 쓰면 대화가 길어질 때 입력창이 화면 밖으로 밀린다.

**결제 흐름** — 버튼을 누르는 즉시 완료하지 않는다. 확인 창 → 로딩 → 완료 토스트 3단계다.

**보조 텍스트 색** — `#7a6360`보다 연한 회색을 본문에 쓰지 않는다. 대비가 모자란다.

**미션 완료 대기** — 채점이 빨리 끝나도 최소 7초는 로딩 화면을 유지한다. 세 단계(기록·대화·마음)를 다 보여준 뒤 결과가 터지는 연출이다.
