# Free Retro 브라우저 앱

휴대폰과 PC에서 개인 ROM을 실행하는 한국어 게임함입니다. 기존 EmulatorJS 코어를 사용하며 Afterplay 서버나 프로그램 코드를 사용하지 않습니다. 기존 Dropbox 화면은 `legacy.html`에 보존했습니다.

## 실행

Windows에서 `Start-Local.ps1`을 실행하고 http://localhost:8197 을 여세요. Python 3가 필요합니다. 파일을 직접 더블클릭하는 `file://` 방식은 지원하지 않습니다. 게임 화면의 **START GAME**을 눌러 시작하세요. 브라우저의 소리 재생 정책 때문에 직접 누르는 단계가 필요합니다.

정적 HTTPS 호스팅에서도 작동합니다. 휴대폰에서 사용하려면 HTTPS 주소에 올려야 합니다. 이 변경은 별도 브랜치에서 준비하며 기존 GitHub Pages에 자동으로 게시하지 않습니다.

## 기능

- 로컬 파일 또는 ROM 폴더 일괄 추가, 저장할 컬렉션 폴더 선택/생성, SHA-256으로 같은 ROM 식별
- 제조사별 플랫폼 사이드바와 게임 수, 플랫폼 필터 (모바일에서는 접어서 표시)
- 게임별 아트워크 선택/변경/기본 표지 복원, PNG/JPEG/WebP 10 MB 이하
- 이름/폴더/즐겨찾기 편집, 검색, 최근 플레이/미플레이 스마트 폴더
- 개수 제한 없는 수동 상태 저장, 30초 자동 저장 1개, 종료 전 저장
- 게임별 프로필, 복원 전 백업, 전체 프로필 JSON 백업/가져오기, 게임 내 SRM 저장 내보내기/가져오기
- 0.5/1/2/4/8배속, 누르는 동안 되감기
- CRT 셰이더, 치트/코어 옵션/컨트롤러/터치패드 설정은 EmulatorJS 메뉴 사용
- PNG 캡처, 지원 브라우저의 영상 녹화, F1–F12 저장/일시정지 단축키
- 최대 60초 입력 매크로 기록/재생/중지
- Google Drive에서 선택한 ROM 가져오기와 인증 설정 화면

AI 번역·음성·오토파일럿은 포함하지 않습니다. 멀티플레이와 업적은 포함하지 않습니다. RTC 시간 변경과 Drive 자동 동기화를 지원합니다.

ROM과 상태 저장은 현재 브라우저의 IndexedDB에 있습니다. Drive 동기화를 연결하면 다른 기기에 같은 ROM을 추가했을 때 저장을 내려받습니다. 상태 백업 파일을 내보내고 다른 기기에 같은 ROM을 추가한 뒤 가져오세요. 브라우저 데이터 삭제/저장 공간 정리 전에 반드시 백업하세요. 슬롯은 앱에서 개수를 제한하지 않지만 기기 저장 용량의 제한은 받습니다. 게임 내 저장과 상태 저장은 서로 다른 파일입니다.

총 18개 플랫폼 경로를 연결했습니다. 기존 NES/SNES/GB·GBC/GBA/N64/PS1/Mega Drive/Master System/Game Gear/NDS에 Atari 2600·7800·Jaguar, Sega 32X, Virtual Boy, PC Engine, Neo Geo Pocket·Color, WonderSwan·Color를 추가했습니다. 추가 기종의 형식과 검증 범위는 `verification/PLATFORMS.md`를 참고하세요. 모든 상용 게임의 호환성을 검증한 것은 아니며 실제 iOS/Android 기기의 성능·호환성은 추가 확인이 필요합니다. PS1 등은 사용자 BIOS가 필요할 수 있습니다. 분리된 CUE+BIN은 단일 CHD로 준비하세요.

## Google Drive 준비

현재 인증 정보가 없으므로 실제 Google 로그인과 파일 다운로드는 검증하지 않았습니다. 설정 → Drive에 다음 값을 입력합니다.

1. Google Cloud 프로젝트에서 Google Drive API와 Google Picker API 활성화
2. OAuth 동의 화면 설정. 테스트 상태면 본인 Google 계정을 테스트 사용자로 등록
3. **웹 애플리케이션** OAuth 클라이언트 ID 생성. 승인된 JavaScript 원본에 실제 앱 원본 입력: 로컬은 `http://localhost:8197`, GitHub Pages는 `https://kiek1224-spec.github.io` (경로 `/free-retro/` 제외)
4. Picker API 키 생성. HTTP 리퍼러를 실제 앱 주소로 제한하고 API 제한은 Google Picker API로 지정
5. OAuth 클라이언트 ID, Picker API 키, 프로젝트 **번호**를 앱 설정에 입력. 클라이언트 비밀키는 사용하지 않음

ROM 선택에는 `drive.file`, 세이브 동기화에는 `drive.appdata` 범위를 요청합니다. Google 권한 화면에서는 선택한 파일의 수정 권한도 표시될 수 있지만 선택 ROM에는 GET 다운로드만 수행합니다. 세이브는 Drive의 숨겨진 `appDataFolder`에 새 JSON 스냅샷으로 업로드합니다. ROM 업로드나 기존 Drive 파일 수정/삭제는 수행하지 않습니다. 액세스 토큰은 메모리에만 두며 새로고침하면 사라집니다. 설정 값은 이 브라우저에 보관됩니다.

공식 설정 문서: [Picker 시작](https://developers.google.com/workspace/drive/picker/guides/overview), [브라우저 OAuth 토큰 모델](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive 범위](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 검증 재현

```powershell
node --test tests/*.test.js
node tests/generate-fixture.mjs
```

로컬 서버에서 `/tests/e2e.html`을 열고 화면의 START GAME을 직접 누릅니다. 자체 제작 ROM의 실제 FCEUmm 코어와 IndexedDB를 검사합니다. 검사는 `QA` 게임과 저장 상태를 현재 브라우저에 추가하므로 개인 게임함과 분리된 브라우저에서 실행하는 편이 좋습니다. 생성 ROM과 저장 파일은 Git에 포함하지 않습니다.

상위 `LICENSE`와 기존 코어 라이선스를 유지합니다. 기존 코어 파일을 변경하지 않았습니다.

## 폴더와 아트워크

**로컬 게임 추가**에서 **ROM 파일 선택** 또는 **ROM 폴더 선택**을 누릅니다. 폴더를 가져오면 하위 폴더의 지원 ROM도 함께 선택하며, 이미지·문서·지원하지 않는 형식은 제외합니다. 압축 파일은 먼저 풀어 주세요. 폴더 선택을 지원하지 않는 브라우저에서는 ROM 파일을 여러 개 선택할 수 있습니다. 가져온 ROM은 브라우저에 복사되며 원본 폴더와 계속 연결되지는 않습니다.

추가 창의 **저장할 컬렉션 폴더**에서 기존 폴더를 고르거나 새 이름을 입력하세요. ROM 폴더의 이름은 새 컬렉션 폴더로 제안됩니다. 게임별 **아트워크 선택**으로 표지를 지정한 뒤 **게임함에 추가**를 누르세요. 기존 게임은 카드의 **정리**에서 표지를 바꿀 수 있습니다. 취소하면 기존 게임 정보와 표지는 유지됩니다.

표지는 긴 변 1280px 이하로 변환하여 IndexedDB에 보관하며 Google Drive 세이브 동기화와 상태 백업에는 포함하지 않습니다. 같은 ROM을 다시 추가하면 기존 제목·즐겨찾기·프로필·RTC·플레이 기록·세이브를 유지하고 지정한 폴더와 표지만 반영합니다. 재추가 시 미분류/표지 미선택은 기존 폴더/표지를 유지하며, 제거하려면 **정리**에서 변경하세요.

`/tests/library-e2e.html`에는 자체 ROM을 사용하는 추가 UI 통합 검사가 있습니다. 이 검사는 게임함에 QA 게임을 남깁니다. 이번 변경에서는 파일 선택 도구 권한 거부 이후 실행하지 않았으며, 완료된 수동 UI 확인과 Node 테스트 결과는 `verification/LIBRARY.md`에 구분했습니다.

## RTC와 자동 동기화

게임 화면의 RTC 시간에서 날짜와 시간을 적용하거나 실제 시간으로 되돌릴 수 있습니다. 게임/프로필마다 시간 차이를 보관하며 상태 저장에도 포함합니다. 에뮬레이터 iframe의 시간만 변경하므로 PC 시계와 Google 인증 시간은 영향을 받지 않습니다. 실제 mGBA RTC 카트리지로 확인했으며 코어에 따라 시작할 때 시간을 읽거나 RTC를 지원하지 않을 수 있습니다.

설정 → Drive에서 인증 정보를 저장한 뒤 **클라우드 연결**을 눌러 로그인합니다. 자동 동기화를 켜면 수동 저장, RTC 변경 저장, 30초 자동 저장을 전송합니다. 상태·게임 내 저장·RTC 시간 차이를 함께 보관하고 SHA-256으로 손상을 검사합니다. ROM은 전송하지 않습니다. 다른 기기도 같은 Google Cloud 프로젝트와 Google 계정으로 연결하고 내용이 동일한 ROM을 추가해야 합니다.

앱이 열려 있고 인터넷과 인증이 유효할 때 동기화합니다. 새로고침/토큰 만료 후에는 연결 버튼으로 다시 로그인하세요. 오프라인 저장은 로컬 대기열에 남고 재연결 시 재시도합니다. 다른 기기에서 받은 저장은 슬롯에 추가하며 플레이 중인 게임을 자동으로 덮어쓰지 않습니다. 동시 저장을 각각 보존하므로 필요할 때 직접 슬롯을 복원하세요. 클라우드 연결은 처음 사용한 Google 계정에 묶어 계정을 바꿔 실수로 전송하는 것을 막습니다.

클라우드 스냅샷은 자동 삭제하지 않으므로 Drive 용량을 사용합니다. 상태와 게임 내 저장의 합계는 스냅샷당 64 MB까지 지원합니다. 앱을 닫은 동안의 백그라운드 동기화는 지원하지 않습니다. 인증 정보가 아직 없어서 실제 Google 서버 로그인/업로드는 미검증이며 전송 API·계정 확인·오류 재시도는 모의 서버로 검증했습니다.

RTC 검증은 devkitPro의 devkitARM/libgba가 설치된 환경에서 `tests/build-rtc-fixture.ps1`로 직접 만든 테스트 ROM을 빌드하고 `/tests/rtc-e2e.html`에서 START GAME을 누릅니다. AXVE 카트리지 코드는 mGBA의 RTC/Flash 하드웨어 설정을 선택하기 위해 사용하며 게임 내용은 모두 자체 제작입니다. 상용 게임 내용은 포함하지 않습니다.
