// data/src/bridge.js
(function() {
    console.log("[브릿지 체크] 에뮬레이터 코어 방에 기생충 스크립트가 성공적으로 침투했습니다.");

    // window 전역(에뮬레이터 내부 환경 전체)에서 키보드 이벤트를 캡처링 모드로 가로챕니다.
    window.addEventListener('keydown', function(event) {
        const key = event.key;

        // 우리가 원하는 핵심 키(F1, Escape)가 눌렸는지 감시
        if (key === 'F1' || key === 'Escape') {
            console.log(`[브릿지 암살] 에뮬레이터가 먹기 전에 ${key} 키를 가로챘습니다!`);

            // 1. 에뮬레이터가 이 키를 가지고 딴짓을 하지 못하도록 이벤트 전파를 완전히 차단
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();

            // 2. 부모 창(index.html)에 있는 GameManager나 전역 함수를 직접 깨웁니다.
            // 만약 index.html에 정의된 커스텀 이벤트나 함수가 있다면 여기서 바로 실행할 수 있습니다.
            if (key === 'F1') {
                // index.html의 GameManager 세이브 기능을 트리거하는 신호 송신
                if (window.EJS_emulator && typeof window.EJS_emulator.saveSaveFiles === 'function') {
                    window.EJS_emulator.saveSaveFiles();
                }
            } else if (key === 'Escape') {
                // ESC가 눌렸을 때 index.html의 드롭박스 업로드 유예 팝업을 띄우도록 전역 이벤트 발송
                const escapeEvent = new CustomEvent('EJS_EscapePressed');
                window.dispatchEvent(escapeEvent);
            }
        }
    }, true); // 💡 true 옵션으로 에뮬레이터 내부 핵심 로직보다 무조건 먼저 실행되게 만듭니다.
})();