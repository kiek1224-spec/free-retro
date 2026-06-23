class EJS_GameManager {
    constructor(Module, EJS) {
        this.EJS = EJS;
        this.Module = Module;
        this.FS = this.Module.FS;

        this.functions = {
            restart: this.Module.cwrap("system_restart", "", []),
            loadState: this.Module.cwrap("load_state", "number", ["string", "number"]),
            screenshot: this.Module.cwrap("cmd_take_screenshot", "", []),
            simulateInput: this.Module.cwrap("simulate_input", "null", ["number", "number", "number"]),
            toggleMainLoop: this.Module.cwrap("toggleMainLoop", "null", ["number"]),
            getCoreOptions: this.Module.cwrap("get_core_options", "string", []),
            setVariable: this.Module.cwrap("ejs_set_variable", "null", ["string", "string"]),
            setCheat: this.Module.cwrap("set_cheat", "null", ["number", "number", "string"]),
            resetCheat: this.Module.cwrap("reset_cheat", "null", []),
            toggleShader: this.Module.cwrap("shader_enable", "null", ["number"]),
            getDiskCount: this.Module.cwrap("get_disk_count", "number", []),
            getCurrentDisk: this.Module.cwrap("get_current_disk", "number", []),
            setCurrentDisk: this.Module.cwrap("set_current_disk", "null", ["number"]),
            getSaveFilePath: this.Module.cwrap("save_file_path", "string", []),
            saveSaveFiles: this.Module.cwrap("cmd_savefiles", "", []),
            supportsStates: this.Module.cwrap("supports_states", "number", []),
            loadSaveFiles: this.Module.cwrap("refresh_save_files", "null", []),
            toggleFastForward: this.Module.cwrap("toggle_fastforward", "null", ["number"]),
            setFastForwardRatio: this.Module.cwrap("set_ff_ratio", "null", ["number"]),
            toggleRewind: this.Module.cwrap("toggle_rewind", "null", ["number"]),
            setRewindGranularity: this.Module.cwrap("set_rewind_granularity", "null", ["number"]),
            toggleSlowMotion: this.Module.cwrap("toggle_slow_motion", "null", ["number"]),
            setSlowMotionRatio: this.Module.cwrap("set_sm_ratio", "null", ["number"]),
            getFrameNum: this.Module.cwrap("get_current_frame_count", "number", [""]),
            setVSync: this.Module.cwrap("set_vsync", "null", ["number"]),
            setVideoRoation: this.Module.cwrap("set_video_rotation", "null", ["number"]),
            getVideoDimensions: this.Module.cwrap("get_video_dimensions", "number", ["string"]),
            setKeyboardEnabled: this.Module.cwrap("ejs_set_keyboard_enabled", "null", ["number"]),
            setControllerPortDevice: this.Module.cwrap("ejs_set_controller_port_device", "null", ["number", "number"]),
            getControllerPortInfo: this.Module.cwrap("ejs_get_controller_port_info", "string", [])
        }

        this.writeFile("/home/web_user/.config/retroarch/retroarch.cfg", this.getRetroArchCfg());

        this.writeConfigFile();
        this.initShaders();
        this.setupPreLoadSettings();

        // 1. [F1 키 감시탑] - 기존 사용자님의 소중한 F1 로직 그대로 보존 (독립 등록)
        window.addEventListener("keydown", (e) => {
            if (e.key === "F1" || e.code === "F1") {
                console.log(`⌨️ [GameManager] F1 감지 -> 상태 저장 파일 커스텀 시퀀스 가동`);
                e.preventDefault();
                this.screenshotAndSave();
            }
        }, true);

        // 2. [ESC 키 독립 감시탑] - F1과 완벽 분리 및 TypeError 방지용 that 바인딩 구현
        const that = this;
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" || e.code === "Escape") {
                console.log("⌨️ [GameManager] ESC 단독 감지 -> 독립 종료 시퀀스 가동");
                e.preventDefault();

                window.isF1Saving = false;
                window.isEscSaving = true;
                if (window.parent) {
                    window.parent.isF1Saving = false;
                    window.parent.isEscSaving = true;
                }

                // escapeAndSave 메서드가 실재하는지 안전하게 확인 후 실행
                if (typeof that.escapeAndSave === 'function') {
                    that.escapeAndSave();
                } else {
                    console.error("❌ [Engine Error] escapeAndSave 함수가 클래스 멤버로 조율되지 않았습니다.");
                }

                // C++ 코어 내부의 배출 명령을 명시적으로 실행하여 .srm 파일 생성을 유도
                that.saveSaveFiles();
            }
        }, true);

        this.EJS.on("exit", () => {
            if (!this.EJS.failedToStart) {
                this.saveSaveFiles();
                this.functions.restart();
                this.saveSaveFiles();
            }
            this.toggleMainLoop(0);
            this.FS.unmount("/data/saves");
            setTimeout(() => {
                try {
                    this.Module.abort();
                } catch (e) {
                    console.warn(e);
                };
            }, 1000);
        });
    }

    // 헬퍼 메서드: 로컬 브라우저 디스크 다운로드 처리 전용 (지연 소멸자 확보)
    downloadFile(data, filename) {
        try {
            const blob = new Blob([data], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 💡 [핵심 버그 수정] 즉시 해제해 버리면 228.html의 800ms 지연 시간차 다운로드 순간에 주소가 파괴되어 실패하므로,
            // 브라우저가 온전히 파일을 확보한 뒤 메모리를 해제하도록 20초간 유예 시간을 줍니다.
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 20000);

            console.log(`📥 [GameManager] 로컬 디스크 파일 다운로드 기화식 대기 등록: ${filename}`);
        } catch (err) {
            console.error("❌ [GameManager] 로컬 파일 배출 중 오류 발생:", err);
        }
    }

    screenshotAndSave() {
        try {
            const rawState = this.getState();
            if (!rawState) {
                console.warn("⚠️ 세이브 데이터를 추출하지 못했습니다.");
                return;
            }

            const now = new Date();
            const timestamp = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + "-" +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');

            const romName = window.EJS_gameID || "retro_game";
            const filename = `${romName}-${timestamp}.state`;

            const blob = new Blob([rawState], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 안전한 다운로드 확보를 위한 지연 파괴법 일괄 적용
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 20000);

            console.log(`🎯 [GameManager] 로컬 저장 완료! 파일명: ${filename}`);

            const targetWindow = window.parent || window.top || window.opener || window;
            const activeDbx = targetWindow.dbx || (targetWindow.Dropbox && targetWindow.Dropbox.dbx) || window.dbx;

            if (activeDbx) {
                console.log("☁️ [GameManager] 드롭박스 인스턴스를 성공적으로 탈취했습니다! 클라우드 전송 가동");
                const paths = [`/${romName}.state`, `/${filename}`];

                paths.forEach(savePath => {
                    activeDbx.filesUpload({
                        path: savePath,
                        contents: rawState,
                        mode: 'overwrite'
                    })
                        .then(() => console.log(`✅ [드롭박스 간섭 성공] 클라우드 동기화 완료: ${savePath}`))
                        .catch(err => console.error("❌ [드롭박스 간섭 실패] 전송 에러:", err));
                });
            } else {
                console.error("⚠️ [GameManager 오류] 부모 페이지(html)에 드롭박스 로그인이 되어있지 않거나 변수명이 dbx가 아닙니다.");
            }
        } catch (e) {
            console.error("❌ 데이터 세이브 진행 중 치명적 예외 에러 발생:", e);
        }
    }

    escapeAndSave() {
        try {
            const rawState = this.getState();
            if (!rawState) {
                console.warn("⚠️ [ESC Engine] 세이브 데이터를 추출하지 못했습니다.");
                return;
            }

            const now = new Date();
            const timestamp = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + "-" +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');

            const romName = window.EJS_gameID || "retro_game";
            const timestampFilename = `${romName}-${timestamp}.state`;
            const fixedFilename = `${romName}.state`;

            // 1. [로컬 저장 수정] F1처럼 타임스탬프 이름(파일명-날짜-시간.state)으로 로컬 다운로드 유도
            this.downloadFile(rawState, timestampFilename);

            // 2. [로컬 저장] .srm 파일을 가상 폴더에서 안전하게 추출해 800ms 딜레이를 두고 다운로드
            const srmData = this.getSaveFile(true); // C++ 내부 세이브 강제 호출 및 srm 버퍼 획득
            if (srmData) {
                setTimeout(() => {
                    console.log("⏱️ [ESC Engine] 800ms 시차 공격 가동 -> .srm 세이브 파일 다운로드 실행");
                    this.downloadFile(srmData, `${romName}.srm`);
                }, 800);
            } else {
                console.warn("⚠️ [ESC Engine] 배터리 세이브(.srm) 데이터가 비어 있거나 존재하지 않습니다.");
            }

            // 3. 드롭박스 클라우드 전송
            const targetWindow = window.parent || window.top || window.opener || window;
            const activeDbx = targetWindow.dbx || (targetWindow.Dropbox && targetWindow.Dropbox.dbx) || window.dbx;

            if (activeDbx) {
                console.log("☁️ [ESC Engine] 클라우드 최종 동기화 세션 개통 완료");

                // [ESC 업로드 수정] F1처럼 자동 세션 로드용 고정 이름과 이력 보존용 타임스탬프 이름을 둘 다 백업합니다.
                const statePaths = [`/${fixedFilename}`, `/${timestampFilename}`];
                statePaths.forEach(savePath => {
                    activeDbx.filesUpload({
                        path: savePath,
                        contents: rawState,
                        mode: 'overwrite'
                    })
                        .then(() => console.log(`✅ [ESC 클라우드 백업 성공] 완료: ${savePath}`))
                        .catch(err => console.error("❌ [ESC 클라우드 백업 실패]:", err));
                });

                // [srm 클라우드 연동 추가] 배터리 세이브 데이터(.srm)가 존재할 경우 드롭박스 클라우드로 업로드 전송 가동
                if (srmData) {
                    activeDbx.filesUpload({
                        path: `/${romName}.srm`,
                        contents: srmData,
                        mode: 'overwrite'
                    })
                        .then(() => console.log(`✅ [ESC 클라우드 SRM 백업 성공] 완료: /${romName}.srm`))
                        .catch(err => console.error("❌ [ESC 클라우드 SRM 백업 실패]:", err));
                }
            } else {
                console.error("⚠️ [GameManager ESC] 부모 페이지에 드롭박스 인스턴스(dbx)가 발견되지 않았습니다.");
            }
        } catch (e) {
            console.error("❌ ESC 데이터 세이브 진행 중 예외 발생:", e);
        }
    }

    setupPreLoadSettings() {
        this.Module.callbacks.setupCoreSettingFile = (filePath) => {
            if (this.EJS.debug) console.log("Setting up core settings with path:", filePath);
            this.writeFile(filePath, this.EJS.getCoreSettings());
        }
    }

    mountFileSystems() {
        return new Promise(async resolve => {
            this.mkdir("/data");
            this.mkdir("/data/saves");
            this.FS.mount(this.FS.filesystems.IDBFS, { autoPersist: true }, "/data/saves");
            this.FS.syncfs(true, async () => {
                // 💡 [클라우드 SRM 동방향 로드 추가]
                // 가상 파일 시스템(IDBFS) 마운트 및 로드가 끝나면, 즉시 드롭박스로부터 .srm 배터리 세이브가 있는지 탐색합니다.
                const romName = window.EJS_gameID || "retro_game";
                const targetWindow = window.parent || window.top || window.opener || window;
                const activeDbx = targetWindow.dbx || (targetWindow.Dropbox && targetWindow.Dropbox.dbx) || window.dbx;

                if (activeDbx) {
                    try {
                        console.log("☁️ [SRM 연동] 클라우드로부터 배터리 세이브(.srm) 파일 조회를 시작합니다.");
                        const response = await activeDbx.filesDownload({ path: `/${romName}.srm` });
                        const arrayBuffer = await response.result.fileBlob.arrayBuffer();
                        const srmBytes = new Uint8Array(arrayBuffer);

                        let srmPath = "";
                        try {
                            srmPath = this.getSaveFilePath();
                        } catch (e) {
                            console.warn("getSaveFilePath() 호출 실패, 수동 경로를 빌드합니다.", e);
                        }
                        if (!srmPath) {
                            srmPath = `/data/saves/${romName}.srm`;
                        }

                        if (srmPath) {
                            this.writeFile(srmPath, srmBytes);
                            // 가상 파일 시스템에 주입된 SRM 데이터를 메모리 및 동기화 처리
                            this.FS.syncfs(false, () => {
                                console.log("✅ [SRM 연동] 클라우드 배터리 세이브(.srm) 데이터를 파일 시스템에 성공적으로 로드했습니다!");
                                resolve();
                            });
                            return;
                        }
                    } catch (err) {
                        console.log("ℹ️ [SRM 연동] 클라우드에 연동된 배터리 세이브(.srm)가 없습니다. 게임 내부 메모리로 시작합니다.");
                    }
                }
                resolve();
            });
        });
    }

    writeConfigFile() {
        if (!this.EJS.defaultCoreOpts.file || !this.EJS.defaultCoreOpts.settings) {
            return;
        }
        let output = "";
        for (const k in this.EJS.defaultCoreOpts.settings) {
            output += k + ' = "' + this.EJS.defaultCoreOpts.settings[k] + '"\n';
        }
        this.writeFile("/home/web_user/retroarch/userdata/config/" + this.EJS.defaultCoreOpts.file, output);
    }

    loadExternalFiles() {
        return new Promise(async (resolve, reject) => {
            if (this.EJS.config.externalFiles && this.EJS.config.externalFiles.constructor.name === "Object") {
                for (const key in this.EJS.config.externalFiles) {
                    await new Promise(async (done) => {
                        try {
                            const url = this.EJS.config.externalFiles[key];
                            const cacheItem = await this.EJS.downloadFile(
                                url,
                                this.EJS.downloadType.support.name,
                                null,
                                true,
                                { responseType: "arraybuffer" },
                                false,
                                this.EJS.downloadType.support.dontCache,
                                false
                            );
                            let path = key;
                            if (key.trim().endsWith("/")) {
                                for (let i = 0; i < cacheItem.data.files.length; i++) {
                                    const file = cacheItem.data.files[i];
                                    this.writeFile(path + file.filename, file.bytes);
                                }
                            } else {
                                if (cacheItem.data.files.length > 0) {
                                    this.writeFile(path, cacheItem.data.files[0].bytes);
                                }
                            }
                            done();
                        } catch (e) {
                            if (this.EJS.debug) console.warn("Failed to fetch file from '" + this.EJS.config.externalFiles[key] + "'. Make sure the file exists.", e);
                            done();
                        }
                    })
                }
            }
            resolve();
        });
    }

    writeFile(path, data) {
        const parts = path.split("/");
        let current = "/";
        for (let i = 0; i < parts.length - 1; i++) {
            if (!parts[i].trim()) continue;
            current += parts[i] + "/";
            this.mkdir(current);
        }
        this.FS.writeFile(path, data);
    }

    mkdir(path) {
        try {
            this.FS.mkdir(path);
        } catch (e) { }
    }

    getRetroArchCfg() {
        let cfg = "autosave_interval = 60\n" +
            "screenshot_directory = \"/\"\n" +
            "block_sram_overwrite = false\n" +
            "video_gpu_screenshot = false\n" +
            "audio_latency = 64\n" +
            "video_top_portrait_viewport = true\n" +
            "video_vsync = true\n" +
            "video_smooth = false\n" +
            "fastforward_ratio = 3.0\n" +
            "slowmotion_ratio = 3.0\n" +
            (this.EJS.rewindEnabled ? "rewind_enable = true\n" : "") +
            (this.EJS.rewindEnabled ? "rewind_granularity = 6\n" : "") +
            "savefile_directory = \"/data/saves\"\n";

        if (this.EJS.retroarchOpts && Array.isArray(this.EJS.retroarchOpts)) {
            this.EJS.retroarchOpts.forEach(option => {
                let selected = this.EJS.preGetSetting(option.name);
                console.log(selected);
                if (!selected) {
                    selected = option.default;
                }
                const value = option.isString === false ? selected : '"' + selected + '"';
                cfg += option.name + " = " + value + "\n"
            })
        }
        return cfg;
    }

    writeBootupBatchFile() {
        const data = `\nSET BLASTER=A220 I7 D1 H5 T6\n@ECHO OFF\nmount A / -t floppy\nSET PATH=Z:\\;A:\\\nmount c /emulator/c\nc:\nIF EXIST AUTORUN.BAT CALL AUTORUN.BAT\n`;
        const filename = "BOOTUP.BAT";
        this.FS.writeFile("/" + filename, data);
        return filename;
    }

    initShaders() {
        if (!this.EJS.shaders) return;
        this.mkdir("/shader");
        for (const shaderFileName in this.EJS.shaders) {
            const shader = this.EJS.shaders[shaderFileName];
            if (typeof shader === "string") {
                this.FS.writeFile(`/shader/${shaderFileName}`, shader);
            }
        }
    }

    clearEJSResetTimer() {
        if (this.EJS.resetTimeout) {
            clearTimeout(this.EJS.resetTimeout);
            delete this.EJS.resetTimeout;
        }
    }

    restart() {
        this.clearEJSResetTimer();
        this.functions.restart();
    }

    getState() {
        return this.Module.EmulatorJSGetState();
    }

    loadState(state) {
        try {
            this.FS.unlink("game.state");
        } catch (e) { }
        this.FS.writeFile("/game.state", state);
        this.clearEJSResetTimer();
        this.functions.loadState("game.state", 0);
        setTimeout(() => {
            try {
                this.FS.unlink("game.state");
            } catch (e) { }
        }, 5000)
    }

    screenshot() {
        try {
            this.FS.unlink("/screenshot.png");
        } catch (e) { }
        this.functions.screenshot();
        return new Promise(async resolve => {
            while (1) {
                try {
                    this.FS.stat("/screenshot.png");
                    return resolve(this.FS.readFile("/screenshot.png"));
                } catch (e) { }
                await new Promise(res => setTimeout(res, 50));
            }
        })
    }

    quickSave(slot) {
        if (!slot) slot = 1;
        let name = slot + "-quick.state";
        try {
            this.FS.unlink(name);
        } catch (e) { }
        try {
            let data = this.getState();
            this.FS.writeFile("/" + name, data);
        } catch (e) {
            return false;
        }
        return true;
    }

    quickLoad(slot) {
        if (!slot) slot = 1;
        (async () => {
            let name = slot + "-quick.state";
            this.clearEJSResetTimer();
            this.functions.loadState(name, 0);
        })();
    }

    simulateInput(player, index, value) {
        if (this.EJS.isNetplay) {
            this.EJS.netplay.simulateInput(player, index, value);
            return;
        }
        if ([24, 25, 26, 27, 28, 29].includes(index)) {
            if (index === 24 && value === 1) {
                const slot = this.EJS.settings["save-state-slot"] ? this.EJS.settings["save-state-slot"] : "1";
                if (this.quickSave(slot)) {
                    this.EJS.displayMessage(this.EJS.localization("SAVED STATE TO SLOT") + " " + slot);
                } else {
                    this.EJS.displayMessage(this.EJS.localization("FAILED TO SAVE STATE"));
                }
            }
            if (index === 25 && value === 1) {
                const slot = this.EJS.settings["save-state-slot"] ? this.EJS.settings["save-state-slot"] : "1";
                this.quickLoad(slot);
                this.EJS.displayMessage(this.EJS.localization("LOADED STATE FROM SLOT") + " " + slot);
            }
            if (index === 26 && value === 1) {
                let newSlot;
                try {
                    newSlot = parseFloat(this.EJS.settings["save-state-slot"] ? this.EJS.settings["save-state-slot"] : "1") + 1;
                } catch (e) {
                    newSlot = 1;
                }
                if (newSlot > 9) newSlot = 1;
                this.EJS.displayMessage(this.EJS.localization("SET SAVE STATE SLOT TO") + " " + newSlot);
                this.EJS.changeSettingOption("save-state-slot", newSlot.toString());
            }
            if (index === 27) {
                this.functions.toggleFastForward(this.EJS.isFastForward ? !value : value);
            }
            if (index === 29) {
                this.functions.toggleSlowMotion(this.EJS.isSlowMotion ? !value : value);
            }
            if (index === 28) {
                if (this.EJS.rewindEnabled) {
                    this.functions.toggleRewind(value);
                }
            }
            return;
        }
        this.functions.simulateInput(player, index, value);
    }

    getFileNames() {
        if (this.EJS.getCore() === "picodrive") {
            return ["bin", "gen", "smd", "md", "32x", "cue", "iso", "sms", "68k", "chd"];
        } else {
            return ["toc", "ccd", "exe", "pbp", "chd", "img", "bin", "iso"];
        }
    }

    createCueFile(fileNames) {
        try {
            if (fileNames.length > 1) {
                fileNames = fileNames.filter((item) => {
                    return this.getFileNames().includes(item.split(".").pop().toLowerCase());
                })
                fileNames = fileNames.sort((a, b) => {
                    if (isNaN(a.charAt()) || isNaN(b.charAt())) throw new Error("Incorrect file name format");
                    return (parseInt(a.charAt()) > parseInt(b.charAt())) ? 1 : -1;
                })
            }
        } catch (e) {
            if (fileNames.length > 1) {
                console.warn("Could not auto-create cue file(s).");
                return null;
            }
        }
        for (let i = 0; i < fileNames.length; i++) {
            if (fileNames[i].split(".").pop().toLowerCase() === "ccd") {
                console.warn("Did not auto-create cue file(s). Found a ccd.");
                return null;
            }
        }
        if (fileNames.length === 0) {
            console.warn("Could not auto-create cue file(s).");
            return null;
        }
        let baseFileName = fileNames[0].split("/").pop();
        if (baseFileName.includes(".")) {
            baseFileName = baseFileName.substring(0, baseFileName.length - baseFileName.split(".").pop().length - 1);
        }
        for (let i = 0; i < fileNames.length; i++) {
            const contents = " FILE \"" + fileNames[i] + "\" BINARY\n  TRACK 01 MODE1/2352\n   INDEX 01 00:00:00";
            this.FS.writeFile("/" + baseFileName + "-" + i + ".cue", contents);
        }
        if (fileNames.length > 1) {
            let contents = "";
            for (let i = 0; i < fileNames.length; i++) {
                contents += "/" + baseFileName + "-" + i + ".cue\n";
            }
            this.FS.writeFile("/" + baseFileName + ".m3u", contents);
        }
        return (fileNames.length === 1) ? baseFileName + "-0.cue" : baseFileName + ".m3u";
    }

    loadPpssppAssets() {
        return new Promise(async (resolve, reject) => {
            try {
                const cacheItem = await this.EJS.downloader.downloadFile("data/cores/ppsspp-assets.zip", this.EJS.downloadType.core.name, "GET", {}, null, null, null, 30000, "arraybuffer", false, this.EJS.downloadType.core.dontCache);
                console.log(cacheItem);
                this.mkdir("/PPSSPP");

                for (let i = 0; i < cacheItem.files.length; i++) {
                    const file = cacheItem.files[i];
                    const path = "/PPSSPP/" + file.filename;
                    const paths = path.split("/");
                    let cp = "";
                    for (let j = 0; j < paths.length - 1; j++) {
                        if (paths[j] === "") continue;
                        cp += "/" + paths[j];
                        if (!this.FS.analyzePath(cp).exists) {
                            this.FS.mkdir(cp);
                        }
                    }
                    if (!path.endsWith("/")) {
                        this.FS.writeFile(path, file.bytes);
                    }
                }
                resolve();
            } catch (error) {
                this.EJS.textElem.innerText = this.EJS.localization("Network Error");
                this.EJS.textElem.style.color = "red";
                reject(error);
            }
        })
    }

    setVSync(enabled) {
        this.functions.setVSync(enabled);
    }
    toggleMainLoop(playing) {
        this.functions.toggleMainLoop(playing);
    }
    getCoreOptions() {
        return this.functions.getCoreOptions();
    }
    setVariable(option, value) {
        this.functions.setVariable(option, value);
    }
    setCheat(index, enabled, code) {
        this.functions.setCheat(index, enabled, code);
    }
    resetCheat() {
        this.functions.resetCheat();
    }
    toggleShader(active) {
        this.functions.toggleShader(active);
    }
    getDiskCount() {
        return this.functions.getDiskCount();
    }
    getCurrentDisk() {
        return this.functions.getCurrentDisk();
    }
    setCurrentDisk(disk) {
        this.functions.setCurrentDisk(disk);
    }
    getSaveFilePath() {
        return this.functions.getSaveFilePath();
    }
    saveSaveFiles() {
        this.functions.saveSaveFiles();
        this.EJS.callEvent("saveSaveFiles", this.getSaveFile(false));
    }
    supportsStates() {
        return !!this.functions.supportsStates();
    }
    setControllerPortDevice(port, device) {
        this.functions.setControllerPortDevice(port, device);
    }
    getControllerPortInfo() {
        return this.functions.getControllerPortInfo();
    }
    getSaveFile(save) {
        if (save !== false) {
            this.saveSaveFiles();
        }
        const exists = this.FS.analyzePath(this.getSaveFilePath()).exists;
        return (exists ? this.FS.readFile(this.getSaveFilePath()) : null);
    }
    loadSaveFiles() {
        this.clearEJSResetTimer();
        this.functions.loadSaveFiles();
    }
    setFastForwardRatio(ratio) {
        this.functions.setFastForwardRatio(ratio);
    }
    toggleFastForward(active) {
        this.functions.toggleFastForward(active);
    }
    setSlowMotionRatio(ratio) {
        this.functions.setSlowMotionRatio(ratio);
    }
    toggleSlowMotion(active) {
        this.functions.toggleSlowMotion(active);
    }
    setRewindGranularity(value) {
        this.functions.setRewindGranularity(value);
    }
    getFrameNum() {
        return this.functions.getFrameNum();
    }
    setVideoRotation(rotation) {
        this.functions.setVideoRoation(rotation);
    }
    getVideoDimensions(type) {
        try {
            return this.functions.getVideoDimensions(type);
        } catch (e) {
            console.warn(e);
        }
    }
    setKeyboardEnabled(enabled) {
        this.functions.setKeyboardEnabled(enabled === true ? 1 : 0);
    }
    setAltKeyEnabled(enabled) {
        this.functions.setKeyboardEnabled(enabled === true ? 3 : 2);
    }

    listDir(path, indent = "") {
        const skipPaths = ["/dev", "/proc", "/sys"];
        if (skipPaths.includes(path)) {
            console.warn(`Skipping directory listing for ${path}`);
            return;
        }
        try {
            const entries = this.FS.readdir(path);
            for (const entry of entries) {
                if (entry === "." || entry === "..") continue;
                const fullPath = path === "/" ? `/${entry}` : `${path}/${entry}`;
                if (skipPaths.some(skip => fullPath.startsWith(skip))) continue;
                const stat = this.FS.stat(fullPath);
                if (this.FS.isDir(stat.mode)) {
                    console.log(`${indent}[DIR] ${fullPath}`);
                    this.listDir(fullPath, indent + "  ");
                } else {
                    console.log(`${indent}${fullPath}`);
                }
            }
        } catch (e) {
            console.warn("Error reading directory:", path, e);
        }
    }
}

export { EJS_GameManager };
