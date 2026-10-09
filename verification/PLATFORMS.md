# 플랫폼 확장 · 2026-10-09

기존 10개에서 18개 플랫폼으로 확장했습니다. 설치된 코어를 재사용하며 새 코어나 바이너리를 다운로드하지 않았습니다. 사이드바 표시뿐 아니라 파일 선택/디렉터리 계획/게임 실행 코어 연결을 추가했습니다.

| 추가 플랫폼 | 파일 확장자 | 로컬 기본 코어 |
| --- | --- | --- |
| Atari 2600 | .a26 | stella2014 |
| Atari 7800 | .a78 | prosystem |
| Atari Jaguar | .j64, .jag | virtualjaguar |
| Sega 32X | .32x | picodrive |
| Virtual Boy | .vb, .vboy | beetle_vb |
| PC Engine | .pce | mednafen_pce |
| Neo Geo Pocket / Color | .ngp, .ngc | mednafen_ngp |
| WonderSwan / Color | .ws, .wsc, .pc2 | mednafen_wswan |

판단 근거는 실제 로드하는 `data/emulator.min.js`의 기본 코어 매핑, `data/cores/cores.json`의 확장자, 로컬 `*-wasm.data` archive와 reports입니다. [EmulatorJS 공식 코어 문서](https://emulatorjs.org/docs4devs/cores/)도 확인했습니다. `.bin/.rom/.zip` 같은 공용 형식은 기종을 추측하지 않습니다. `.iso/.chd/.pbp/.img`의 기존 PS1 매핑은 유지합니다. PSP의 일반 코어 archive는 없고 제공된 thread 코어는 현재 앱의 threads=false 구성과 맞지 않아 이번 확장에 포함하지 않았습니다.

Blob ROM URL에 확장자가 없으므로 실제 가상 ROM 파일명으로 원본 filename을 전달하도록 수정했습니다. 게임함의 사용자 제목은 그대로 표시하고 저장 식별자는 기존 SHA-256을 유지합니다.

## 검증

Node 42/42 통과(`platforms-unit.txt`): 기존 36개 및 추가 6개. 새 확장자 대소문자 처리, 혼합 폴더 가져오기, 모호한 형식 거절, 중복 ROM의 개인 정보 보존, 실제 archive의 존재/7z 시그니처/manifest와 minified loader 매핑을 검사합니다. 코어가 존재한다는 결과와 실제 게임 실행 결과는 구분합니다.

18개 사이드바 항목과 신규 플랫폼 필터를 브라우저에서 확인했습니다. 다른 신규 플랫폼의 상용 게임 호환성, 실제 휴대폰은 미검증입니다. Google 연결 및 표지 선택의 이전 검증 한계는 LIBRARY.md에 기록돼 있습니다.

자체 6502 프로그램(4KB, 262라인 컬러 줄무늬)을 `tests/generate-atari-fixture.mjs`로 생성하고 `/tests/atari-e2e.html`에서 실제 stella2014를 실행했습니다. 8/8 검사 통과(`atari-runtime.txt`): 코어 종류, .a26 가상 파일명, 상태 저장 지원, 프레임 진행, PNG 화면 캡처, 검은 화면이 아닌 6색 이상의 프레임. 라이브러리에 ROM을 가져오거나 저장소를 수정하지 않는 직접 player 검사입니다. 생성 .a26과 스크린샷은 Git 제외입니다. 다른 7개 새 플랫폼은 실제 게임 실행을 확인하지 않았습니다.
