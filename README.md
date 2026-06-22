# Free Retro 🎮

> [🇰🇷 한국어 버전](./README_KR.md) | [⚙️ Technical Details](./TECHNICAL_DETAILS.md)

> **A Web-Based Retro Game Emulator for Limitless Gaming**
> 
> *Notice: This project is the result of relentless determination and sweat, completed via "Vibe Coding" while dragging Gemini AI through the mud. 🥊*

---

## 1. Project Introduction (Introduction)
* **What is Free Retro?** A combination of "Free" and "Retro", embodying the goal to enjoy retro games anytime, anywhere, completely free from OS or platform constraints.
* **Base Engine:** A web-based emulator built on top of the `EmulatorJS` engine, operating via C++ based WebAssembly inside the browser.
* **Inspiration:** After experiencing a web-based emulator service called `Afterplay.io`, I realized, *"The web is truly an open and free stage!"* Inspired by this breakthrough, I set out to build my own custom cloud-syncing emulator.

---

## 2. Key Features (Key Features)

### 🌐 Seamless Cross-Platform Support
As long as an environment can run a modern web browser, Free Retro works flawlessly without operating system restrictions.
* Supported OS: Windows, Linux, macOS
* Mobile Support: Android, iOS (Fully optimized for mobile browsing)

### 📂 Flexible ROM Loading Mechanisms
Loading and playing game ROM files is highly intuitive and adaptive:
* **Local Files:** Simply Drag & Drop a ROM file onto the browser screen or use the manual file selection button.
* **Cloud Storage Integration:** Directly pull and run ROM files stored in external cloud providers such as Naver MYBOX, Google Drive, or Dropbox. Dropbox is also heavily integrated to handle automated save game backups.

---

## 3. Core Technology: Hybrid Save System (Save System)
The absolute technical crown jewel of `Free Retro`. By reverse-engineering and modifying the emulator core's internal `GameManager.js` and the main web source (HTML file), I successfully implemented a **hybrid synchronization architecture that executes local data storage and cloud (Dropbox) upload simultaneously in real-time.**

### 💾 Supported Save Formats
1. **State Save (Save States):** Captures real-time snapshots of the emulator's exact visual and memory state instantly. (`[Filename]-[YYYYMMDD-HHMMSS].state`)
2. **SRM Save (In-Game Native Saves):** Pure battery-backed save files generated through native in-game menus (e.g., selecting 'Save/Report' within a Pokémon game menu). (`[Filename].srm` or `[Filename]-[YYYYMMDD-HHMMSS].srm`)

### ⌨️ Hotkey Control Mechanisms
* **`[F1]` Key (On-the-Fly Quick Save):** Pressing this instantly captures the emulator's current state and fires an automated background backup to Dropbox under the `[Filename]-[YYYYMMDD-HHMMSS].state` naming convention. This acts as an infinite time machine to easily revert mistakes.
* **`[ESC]` Key (Game Termination & Safe Export):** A mission-critical fail-safe mechanism designed to eliminate data loss upon browser closure. Pressing this instantly freezes the game, synchronizes the exit snapshot (`.state`) and the native in-game cartridge save (`.srm`) simultaneously, pushes them safely via asynchronous streams to the cloud, and safely shuts down the emulator core.

---

## 4. Dropbox Access Authorization & Security (Security)
Free Retro is a serverless, pure front-end application (Static Web). It strictly adheres to the Principle of Least Privilege to safeguard your personal data.

* **Access Boundaries:** The application *never* touches your entire Dropbox directory. It is completely isolated and restricted to its own dedicated application directory: **`Apps/FreeRetro`**.
* **Required Authorization Scopes:**
  * `account_info.read`: Verifies basic profile data (Username, email, country) to manage your session.
  * `files.metadata.read`: Scans files and folder structures inside the dedicated app directory.
  * `files.metadata.write`: Authorizes folder and file layout modifications inside the dedicated app directory.
  * `files.content.read`: Downloads game save data content to sync backward to the browser.
  * `files.content.write`: Uploads newly generated save data content securely up to the cloud.
* *⚠️ Disclaimer: For data integrity and security, do not place or mix any personal files or media other than pure game save files (`.state` / `.srm`) inside the `FreeRetro` app folder.*

---

## 5. Supported Consoles (Supported Consoles)
* Family Computer / Nintendo Entertainment System (FC / NES)
* Super Famicom / Super Nintendo Entertainment System (SNES)
* Game Boy (GB)
* Game Boy Color (GBC)
* Game Boy Advance (GBA)

---

## 6. Behind the Scenes (Behind the Scenes)
This project was a relentless cycle of trial, error, and breakthrough. It is a true **"Gemini-dragging Vibe Coding project"** completed by wrestling with countless timing race-conditions and asynchronous computation bottlenecks as if sparring inside an MMA octagon with Gemini AI. Moving beyond simple syntax coding, it served as an invaluable deep-dive that allowed me to understand the browser's virtual filesystem (IDBFS), the lifecycle of WebAssembly emulator cores, and the micro-timing required for stable cloud data synchronization.

---

## 7. Copyright & Disclaimer (Copyright & Disclaimer)
* This project only provides the front-end interface, emulator configuration, and execution logic wrappers.
* **Game ROM files and BIOS binaries are absolutely NOT provided.** Users must legally acquire and supply their own game files.
* All game titles, assets, and ROM copyrights belong strictly to their respective original rightsholders.
