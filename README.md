# DOOM for OpenTUI

🎮 Play DOOM in your terminal using [OpenTUI](https://github.com/sst/opentui)'s framebuffer rendering!

## ✨ Features

- **Full DOOM gameplay** in your terminal
- **High-resolution rendering** using half-block characters (▀) for 2x vertical resolution
- **Keyboard input support** with WASD and arrow keys
- **Save/Load game** support - saves persist to `~/.opentui-doom/`
- **Sound effects and music** via mpv
- **WebAssembly powered** - DOOM compiled to WASM via Emscripten

## 📋 Requirements

- **Bun** - JavaScript runtime
- **Emscripten SDK** - For compiling DOOM to WebAssembly
- **DOOM WAD file** - Game data (shareware `doom1.wad` is freely available)

## ⚡ Quick Play (via npm)

If you have [Bun](https://bun.sh/) installed, just download a [doom1.wad](https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad) and run:

```bash
bunx @muhammedaksam/opentui-doom --wad ./doom1.wad
```

## 🚀 Quick Start (Development)

### 1. Clone the Repository

```bash
git clone https://github.com/muhammedaksam/opentui-doom.git
cd opentui-doom
bun install
```

### 2. Install Emscripten (if not already installed)

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### 3. Build DOOM WASM Module

```bash
bun run build:doom
```

This clones [doomgeneric](https://github.com/ozkl/doomgeneric) and compiles it to WebAssembly.

### 4. Get a WAD File

Download the shareware DOOM WAD:

- [doom1.wad from ibiblio](https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad)
- Or use your own `DOOM.WAD` / `DOOM2.WAD`

Place the WAD file in the project root.

### 5. Run DOOM

```bash
bun run dev -- --wad ./doom1.wad
```

## 🎮 Controls

| Action            | Keys           |
| ----------------- | -------------- |
| Move Forward/Back | W / S or ↑ / ↓ |
| Turn Left/Right   | ← / →          |
| Strafe            | A / D          |
| Fire              | Ctrl           |
| Use/Open          | Space          |
| Run               | Shift          |
| Weapons           | 1-7            |
| Menu              | Escape         |
| Map               | Tab            |
| Quit              | Ctrl+C         |

## 💾 Save Games

Save games are stored in `~/.opentui-doom/` with DOOM's standard naming:

- Slot 1: `doomsav0.dsg`
- Slot 2: `doomsav1.dsg`
- ... up to Slot 6: `doomsav5.dsg`

Saves are automatically synced every 5 seconds and on exit.

## 🔊 Sound

Sound effects and music require **mpv** to be installed:

```bash
# Ubuntu/Debian
sudo apt install mpv

# macOS
brew install mpv

# Arch
sudo pacman -S mpv
```

Sound files should be placed in the `sound/` directory.

## 🖥️ Recommended Terminal Configuration

For the best experience, we recommend:

- **Alacritty** terminal emulator
- **Font size: 5** (for maximum resolution)
- Maximize your terminal window

## ⚠️ Known Limitations

- **Multi-key input**: Terminals only send key repeat events for one key at a time. Holding W to move forward will stop when you press arrow keys to turn. This is a terminal limitation, not a bug.
- **No Kitty keyboard protocol**: While OpenTUI supports the Kitty keyboard protocol for proper key release events, it didn't work as expected in my testing. Currently using timeout-based key release as a workaround.

## 🔧 How It Works

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│  doomgeneric    │───▶│  OpenTUI         │───▶│   Terminal     │
│  (WASM)         │    │  FrameBuffer     │    │   Display      │
└─────────────────┘    └──────────────────┘    └────────────────┘
         ▲                      │
         │                      │
         └──────────────────────┘
              Key Events
```

1. **DOOM** runs as a WebAssembly module (compiled from C via Emscripten)
2. Each frame, DOOM renders to a 1280x800 framebuffer
3. **OpenTUI** reads the framebuffer and converts it to terminal cells using half-block characters
4. Terminal keyboard input is mapped back to DOOM key codes

## 📁 Project Structure

```
opentui-doom/
├── src/
│   ├── index.ts          # Main entry point
│   ├── doom-engine.ts    # WASM module wrapper
│   └── doom-input.ts     # Keyboard input mapping
├── doom/
│   ├── doomgeneric_opentui.c  # Platform implementation
│   ├── doomgeneric/           # doomgeneric source (cloned during build)
│   └── build/                 # Compiled WASM output
├── scripts/
│   └── build-doom.sh     # Build script
├── package.json
└── README.md
```

## 📝 License

- This project code: MIT
- DOOM source code: GPL-2.0 (from id Software)
- doomgeneric: GPL-2.0 (by ozkl)

## 🙏 Credits

- [id Software](https://github.com/id-Software/DOOM) for the original DOOM source release
- [doomgeneric](https://github.com/ozkl/doomgeneric) for the portable DOOM implementation
- [OpenTUI](https://github.com/sst/opentui) for the terminal rendering framework

## 🤝 Contributing

Contributions are welcome! Please submit pull requests to the `develop` branch.
