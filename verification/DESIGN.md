# Arcade Library 디자인 · 2026-10-09

차콜·따뜻한 흰색·라임을 기본으로, 휴대용 게임기와 카트리지 벡터를 직접 제작했습니다. 앱의 기존 저장·RTC·Drive 코드는 보존했습니다.

참고한 공식/테마 작성자 자료:
- [Pegasus gameOS](https://github.com/PlayingKarrde/gameOS): 큰 게임 카드, 이어하기, 플랫폼 탐색.
- [ES-DE 테마](https://www.es-de.org/#Themes), [Art Book Next](https://github.com/anthonycaccese/art-book-next-es-de): 시스템별 색상과 게임함 표시.
- [OpenEmu](https://openemu.org/): 개인 컬렉션 탐색 구조.

원격 게임 표지나 폰트를 가져오지 않고 app/assets의 자체 SVG를 사용합니다. 참고 화면의 게임 자산은 앱에 포함하지 않습니다.

구현: PC 왼쪽 컬렉션 메뉴, 모바일 컬렉션 버튼과 2열 카드, 최근 플레이 이어하기, 기종 필터, 실제 게임 수/시스템 수, 기종별 카드 색상, 어두운 녹색 플레이·설정 패널. 키보드 기종 필터 전환 시 포커스를 보존하고 reduced-motion 설정을 따릅니다.

검증: Node 기존 16개 통과, NES 실제 코어 15개 통과 (design-runtime.txt). 기종/즐겨찾기/검색 무결과, 이어하기 실행을 확인했습니다. PC 1280px 콘텐츠 폭·scrollWidth 모두 1265px, 모바일 390px 콘텐츠 폭·scrollWidth 모두 375px, 모바일 카드 167px 2열, 설정 대화상자 337px. 실제 휴대폰 검증은 아닙니다.

화면 증거: design-desktop.png, design-mobile.png, design-player.png. PNG는 로컬 산출물이며 Git에서 제외합니다.
