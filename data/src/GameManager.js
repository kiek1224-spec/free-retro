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

        // =========================================================
        // 🎯 [F1 / ESC 이벤트 캡처링 - 최우선 선점 핸들러]
        // =========================================================
        const that = this;

        // F1 키 핸들러 (State만 저장)
        window.addEventListener("keydown", (e) => {
            if (e.key === "F1" || e.code === "F1") {
                console.log(`⌨️ [GameManager] F1 감지 -> screenshotAndSave() 실행`);
                e.preventDefault();
                e.stopPropagation();
                that.screenshotAndSave();
                return false;
            }
        }, true);

        // ESC 키 핸들러 (State + SRM 저장 후 종료)
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" || e.code === "Escape") {
                console.log(`⌨️ [GameManager] ESC 감지 -> escapeAndSave() 실행`);
                e.preventDefault();
                e.stopPropagation();
                
                // ESC 오버레이 표시
                const rootWin = window.top || window;
                if (rootWin.EJS_saveSaveFiles_Bridge) {
                    rootWin.EJS_saveSaveFiles_Bridge();
                }
                
                that.escapeAndSave();
                return false;
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

    // ✅ 파일 다운로드 헬퍼
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

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 20000);

            console.log(`📥 [GameManager] 파일 다운로드: ${filename}`);
        } catch (err) {
            console.error("❌ [GameManager] 다운로드 실패:", err);
        }
    }

    // ✅ 날짜-시간 형식 생성
    getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}-${hours}${minutes}${seconds}`;
    }

    // ✅ Dropbox 업로드
    async uploadToDropbox(filename, data) {
        const targetWindow = window.parent || window.top || window.opener || window;
        const activeDbx = targetWindow.dbx || window.dbx;

        if (!activeDbx) {
            console.warn("⚠️ [GameManager] Dropbox 미연결 - 업로드 스킵");
            return;
        }

        try {
            await activeDbx.filesUpload({
                path: `/${filename}`,
                contents: data,
                mode: 'overwrite'
            });
            console.log(`✅ [Dropbox] 업로드 성공: ${filename}`);
        } catch (err) {
            console.error(`❌ [Dropbox] 업로드 실패 (${filename}):`, err);
        }
    }

    // ✅ F1: State만 저장
    screenshotAndSave() {
        try {
            console.log("[F1] screenshotAndSave() 시작");
            const rawState = this.getState();
            
            if (!rawState) {
                console.warn("⚠️ [F1] State 데이터 없음");
                return;
            }

            const romName = window.EJS_gameID || "retro_game";
            const timestamp = this.getTimestamp();
            const filename = `${romName}-${timestamp}.state`;

            console.log(`[F1] State 추출 완료 (크기: ${rawState.length} bytes)`);

            // 1. 브라우저 다운로드 (우선순위 1)
            this.downloadFile(rawState, filename);

            // 2. Dropbox 업로드 (비동기)
            this.uploadToDropbox(filename, rawState);
            this.uploadToDropbox(`${romName}.state`, rawState);

            console.log("[F1] 완료!");
        } catch (e) {
            console.error("❌ [F1] 오류:", e);
        }
    }

    // ✅ ESC: State + SRM 저장 후 종료
    escapeAndSave() {
        try {
            console.log("[ESC] escapeAndSave() 시작");
            const rawState = this.getState();
            
            if (!rawState) {
                console.warn("⚠️ [ESC] State 데이터 없음");
                return;
            }

            const romName = window.EJS_gameID || "retro_game";
            const timestamp = this.getTimestamp();
            const stateFilename = `${romName}-${timestamp}.state`;
            const fixedFilename = `${romName}.state`;

            console.log(`[ESC] State 추출 완료 (크기: ${rawState.length} bytes)`);

            // 1. State 파일 다운로드
            this.downloadFile(rawState, stateFilename);

            // 2. SRM 파일 추출 및 다운로드
            const srmData = this.getSaveFile(true);
            if (srmData) {
                console.log(`[ESC] SRM 추출 완료 (크기: ${srmData.length} bytes)`);
                setTimeout(() => {
                    console.log("⏱️ [ESC] 800ms 후 SRM 다운로드");
                    this.downloadFile(srmData, `${romName}.srm`);
                }, 800);
            } else {
                console.warn("⚠️ [ESC] SRM 데이터 없음");
            }

            // 3. Dropbox 업로드
            this.uploadToDropbox(fixedFilename, rawState);
            this.uploadToDropbox(stateFilename, rawState);
            
            if (srmData) {
                this.uploadToDropbox(`${romName}.srm`, srmData);
            }

            console.log("[ESC] 저장 완료!");

            // 4. 게임 종료
            setTimeout(() => {
                console.log("[ESC] 게임 종료 (새로고침)");
                location.reload();
            }, 2000);

        } catch (e) {
            console.error("❌ [ESC] 오류:", e);
            location.reload();
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
