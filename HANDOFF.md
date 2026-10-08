# Free Retro 인계

사용자 결정: AI 번역/음성/오토파일럿 제외. 휴대폰·PC 브라우저 앱. 기존 free-retro 수정 허용. ROM은 로컬 또는 Google Drive. Google Cloud 인증 정보는 아직 없음: 설정 화면과 연결 코드 준비.

작업 브랜치 `feature/browser-library`, 기준 main `29d5c12`. 사용자의 기존 `C:\Users\kiek1\free-retro` (untracked ds 작업 포함)는 보존했습니다. 이 폴더의 복제본에서만 수정했습니다. 기존 코어는 번들 minified EmulatorJS 경로를 그대로 사용합니다. `data/GameManager.js` 소스와 번들 구현이 다르므로, 기능 확장 시 실제 로드되는 `data/emulator.min.js` API를 확인해야 합니다.

새 앱: index.html과 app/. 기존 Dropbox 페이지: legacy.html. 실행/Drive 준비: README-BROWSER.md. 확인한 결과와 한계: verification/README.md 및 runtime.txt.

남은 검증: Google OAuth/Picker 실제 선택 다운로드, 실제 Android/iOS 터치와 저장 유지, 다른 시스템 코어/BIOS, 실제 상용 게임의 SRM 호환성, 실제 게임 치트·셰이더. RTC와 Drive 세이브 자동 동기화를 구현했습니다. 아직 구현하지 않은 기능: 멀티플레이/업적. 상태 JSON 수동 백업으로 기기 간 이전할 수 있습니다.

GitHub Pages는 main 병합 전까지 기존 페이지입니다. 추가 사용자 요청 없이 main을 병합하거나 배포하지 않습니다. 사용자 ROM은 배포/커밋하지 않습니다.

2026-10-08 추가: app/clock.js iframe Date 오프셋, sync.js 불변 스냅샷, drive-store.js appDataFolder POST/GET, storage.js IDB v2 outbox와 조건부 ACK. Google 인증 토큰은 메모리에만 저장. 계정 permissionId를 확인하여 계정 변경 전송 차단. 실제 Google 인증 정보 없음으로 실서버 동기화는 미검증. 자세한 한계와 재현은 README-BROWSER.md 참고.

최종 검증: Node 16/16, 자체 GBA 실제 mGBA RTC/Flash + IndexedDB 15/15, 기존 NES 15/15 + 실제 영상 녹화. 모바일은 뷰포트 검증이며 실기기 아님. 테스트 결과는 verification/.

2026-10-09 디자인: Arcade Library 차콜/라임 테마, 자체 SVG 게임기·카트리지, 실제 컬렉션/기종 필터와 최근 게임 이어하기. 검증·참고 출처는 verification/DESIGN.md. 코어·RTC·Drive 전송 로직은 변경하지 않았습니다.
