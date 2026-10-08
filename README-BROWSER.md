# Free Retro 브라우저 앱

휴대폰과 PC에서 개인 ROM을 실행하는 한국어 게임함입니다. 기존 EmulatorJS 코어를 사용하며 Afterplay 서버나 프로그램 코드를 사용하지 않습니다. 기존 Dropbox 화면은 `legacy.html`에 보존했습니다.

## 실행

Windows에서 `Start-Local.ps1`을 실행하고 http://localhost:8197 을 여세요. Python 3가 필요합니다. 파일을 직접 더블클릭하는 `file://` 방식은 지원하지 않습니다. 게임 화면의 **START GAME**을 눌러 시작하세요. 브라우저의 소리 재생 정책 때문에 직접 누르는 단계가 필요합니다.

정적 HTTPS 호스팅에서도 작동합니다. 휴대폰에서 사용하려면 HTTPS 주소에 올려야 합니다. 이 변경은 별도 브랜치에서 준비하며 기존 GitHub Pages에 자동으로 게시하지 않습니다.

## 기능

- 로컬 파일 여러 개 추가, SHA-256으로 같은 ROM 식별
- 이름/폴더/즐겨찾기 편집, 검색, 최근 플레이/미플레이 스마트 폴더
- 개수 제한 없는 수동 상태 저장, 30초 자동 저장 1개, 종료 전 저장
- 게임별 프로필, 복원 전 백업, 전체 프로필 JSON 백업/가져오기, 게임 내 SRM 저장 내보내기/가져오기
- 0.5/1/2/4/8배속, 누르는 동안 되감기
- CRT 셰이더, 치트/코어 옵션/컨트롤러/터치패드 설정은 EmulatorJS 메뉴 사용
- PNG 캡처, 지원 브라우저의 영상 녹화, F1–F12 저장/일시정지 단축키
- 최대 60초 입력 매크로 기록/재생/중지
- Google Drive에서 선택한 ROM 가져오기와 인증 설정 화면

AI 번역·음성·오토파일럿은 포함하지 않습니다. 전용 RTC 시간 변경 UI, 클라우드 세이브 자동 동기화, 멀티플레이, 업적은 이번 버전에 포함하지 않았습니다.

ROM과 상태 저장은 현재 브라우저의 IndexedDB에 있습니다. 다른 휴대폰이나 PC에 자동으로 나타나지 않습니다. 상태 백업 파일을 내보내고 다른 기기에 같은 ROM을 추가한 뒤 가져오세요. 브라우저 데이터 삭제/저장 공간 정리 전에 반드시 백업하세요. 슬롯은 앱에서 개수를 제한하지 않지만 기기 저장 용량의 제한은 받습니다. 게임 내 저장과 상태 저장은 서로 다른 파일입니다.

NES/SNES/GB/GBC/GBA/N64/PS1/Mega Drive/Master System/Game Gear/NDS 경로를 연결했습니다. 실제 코어 검증은 자체 제작 NES ROM으로 수행했습니다. 다른 시스템과 실제 iOS/Android 기기의 성능·호환성은 추가 확인이 필요합니다. PS1 등은 사용자 BIOS가 필요할 수 있습니다. 분리된 CUE+BIN은 단일 CHD로 준비하세요.

## Google Drive 준비

현재 인증 정보가 없으므로 실제 Google 로그인과 파일 다운로드는 검증하지 않았습니다. 설정 → Drive에 다음 값을 입력합니다.

1. Google Cloud 프로젝트에서 Google Drive API와 Google Picker API 활성화
2. OAuth 동의 화면 설정. 테스트 상태면 본인 Google 계정을 테스트 사용자로 등록
3. **웹 애플리케이션** OAuth 클라이언트 ID 생성. 승인된 JavaScript 원본에 실제 앱 원본 입력: 로컬은 `http://localhost:8197`, GitHub Pages는 `https://kiek1224-spec.github.io` (경로 `/free-retro/` 제외)
4. Picker API 키 생성. HTTP 리퍼러를 실제 앱 주소로 제한하고 API 제한은 Google Picker API로 지정
5. OAuth 클라이언트 ID, Picker API 키, 프로젝트 **번호**를 앱 설정에 입력. 클라이언트 비밀키는 사용하지 않음

요청 범위는 `drive.file`입니다. Google 권한 화면에서는 선택한 파일의 수정 권한도 표시될 수 있지만 이 앱은 선택 파일에 GET 다운로드만 수행합니다. ROM 업로드, Drive 파일 수정/삭제, 전체 Drive 검색은 구현하지 않았습니다. 액세스 토큰은 메모리에만 두며 새로고침하면 사라집니다. 설정 값은 이 브라우저에 보관됩니다.

공식 설정 문서: [Picker 시작](https://developers.google.com/workspace/drive/picker/guides/overview), [브라우저 OAuth 토큰 모델](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive 범위](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 검증 재현

```powershell
node --test tests/model.test.js
node tests/generate-fixture.mjs
```

로컬 서버에서 `/tests/e2e.html`을 열고 화면의 START GAME을 직접 누릅니다. 자체 제작 ROM의 실제 FCEUmm 코어와 IndexedDB를 검사합니다. 검사는 `QA` 게임과 저장 상태를 현재 브라우저에 추가하므로 개인 게임함과 분리된 브라우저에서 실행하는 편이 좋습니다. 생성 ROM과 저장 파일은 Git에 포함하지 않습니다.

상위 `LICENSE`와 기존 코어 라이선스를 유지합니다. 기존 코어 파일을 변경하지 않았습니다.
