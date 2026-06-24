**"This project was built using what I call 'Vibe Coding'."**

**Free Retro**

**About**

Free Retro is a web-based retro gaming project built on EmulatorJS. The name comes from:

* **Free** = Freedom

* **Retro** = Retro Games

The goal of this project is simple:

Play retro games freely, anytime, anywhere, directly from a web browser. No installation, no complicated setup, just load a ROM and start playing.
**Why This Project Exists**

After using the web-based emulator service Afterplay, I realized how powerful browser-based gaming could be.

That experience inspired me to create Free Retro.

I wanted a retro gaming environment that works regardless of operating system, device, or location.

**Features**

**Web-Based Emulator**

* Runs directly in a web browser

* No installation required

* Works across operating systems

* PC and mobile support

**ROM Loading**

* Drag & Drop support

* Manual file selection support

* Automatic system detection

Supported systems:

* NES / Famicom

* SNES / Super Famicom

* Game Boy

* Game Boy Color

* Game Boy Advance!

**Cloud Integration**

ROM files can be loaded from local storage or cloud storage services such as:

* Dropbox

* Google Drive

* Naver MYBOX

Dropbox is also used for save file synchronization.

**Save System**

The save system is the most unique part of Free Retro.

It was implemented by modifying EmulatorJS components and custom HTML integration.

**Local Save + Cloud Upload**

Free Retro performs both:

* Local save backup

* Dropbox cloud upload

**Save Types**

**State Save**

* Forced emulator save state

* Filename-Date-Time.state

**SRM Save**

* Native in-game save data

* Filename.srm

**Hotkeys**

**F1**

* Create save state

* Download save file

**ESC**

* Exit game

* Save state backup

* SRM backup

* Upload save data to Dropbox![ref1](Aspose.Words.a895ccb6-698b-4373-a34a-be21cf075d77.003.png)

**Dropbox Permissions**

Required permissions:

* account\_info.read

* files.metadata.read

* files.metadata.write

* files.content.read

* files.content.write

The application only accesses the FreeRetro App Folder. Please do not store unrelated files inside the folder.![](Aspose.Words.a895ccb6-698b-4373-a34a-be21cf075d77.005.png)

**Known Issues**

This project prioritizes functionality over perfection. Current known issues:

* Duplicate SRM download may occur when pressing ESC.

* State save generated through ESC may miss timestamp information.

These issues do not affect core gameplay functionality.![](Aspose.Words.a895ccb6-698b-4373-a34a-be21cf075d77.006.png)

**Development Philosophy**

This project was built using what I call: **"Grab-it-by-the-collar Vibe Coding."** The goal was never perfect architecture. The goal was simple:

If it runs, it wins.![](Aspose.Words.a895ccb6-698b-4373-a34a-be21cf075d77.007.png)

**Live Demo**

<https://kiek1224-spec.github.io/free-retro/#>
