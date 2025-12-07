#!/usr/bin/env bun
/**
 * DOOM for OpenTUI
 * 
 * Plays DOOM in your terminal using OpenTUI's framebuffer rendering.
 * 
 * Usage: bun run dev -- --wad /path/to/doom1.wad
 */

import {
  createCliRenderer,
  FrameBufferRenderable,
  TextRenderable,
  BoxRenderable,
  RGBA,
  TextAttributes,
} from "@opentui/core";
import { DoomEngine, DOOM_WIDTH, DOOM_HEIGHT } from "./doom-engine";
import { createDoomInputHandler, getControlsHelp } from "./doom-input";
import { parseArgs } from "util";

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    wad: {
      type: "string",
      short: "w",
      default: "doom1.wad",
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
  },
});

if (values.help) {
  console.log(`
DOOM for OpenTUI

Usage: bun run dev -- --wad <path-to-wad-file>

Options:
  -w, --wad    Path to DOOM WAD file (default: doom1.wad)
  -h, --help   Show this help message

${getControlsHelp()}
`);
  process.exit(0);
}

// Initialize renderer
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 35, // DOOM's native framerate
});

renderer.start();

// Create UI container
const container = new BoxRenderable(renderer, {
  id: "doom-container",
  flexGrow: 1,
  justifyContent: "center",
  alignItems: "center",
});
renderer.root.add(container);

// Loading text
const loadingText = new TextRenderable(renderer, {
  id: "loading",
  content: "Loading DOOM...",
  fg: RGBA.fromInts(255, 255, 100),
  attributes: TextAttributes.BOLD,
});
container.add(loadingText);

// Try to initialize DOOM engine
let doomEngine: DoomEngine | null = null;
let framebufferRenderable: FrameBufferRenderable | null = null;

async function initDoom() {
  try {
    loadingText.content = `Loading DOOM from: ${values.wad}`;

    doomEngine = new DoomEngine(values.wad!);
    await doomEngine.init();

    // Remove loading text
    container.remove("loading");

    // Create framebuffer for DOOM rendering
    framebufferRenderable = new FrameBufferRenderable(renderer, {
      id: "doom-screen",
      width: renderer.terminalWidth,
      height: renderer.terminalHeight,
      position: "absolute",
      left: 0,
      top: 0,
      zIndex: 0,
    });
    renderer.root.add(framebufferRenderable);

    // Add controls overlay
    const controlsText = new TextRenderable(renderer, {
      id: "controls",
      content: "DOOM | Ctrl+C to exit | Arrow/WASD=Move Space=Use Ctrl=Fire",
      position: "absolute",
      left: 1,
      top: 0,
      fg: RGBA.fromInts(200, 200, 200),
      attributes: TextAttributes.DIM,
      zIndex: 100,
    });
    renderer.root.add(controlsText);

    // Set up input handler
    const inputHandler = createDoomInputHandler(doomEngine);
    renderer.keyInput.on("keypress", inputHandler);

    // Start game loop
    renderer.setFrameCallback(gameLoop);

  } catch (error) {
    loadingText.content = `Error: ${error}`;
    loadingText.fg = RGBA.fromInts(255, 100, 100);
    console.error("Failed to initialize DOOM:", error);

    // Show troubleshooting info
    const helpText = new TextRenderable(renderer, {
      id: "help",
      content: [
        "",
        "Troubleshooting:",
        "1. Make sure you have built the DOOM WASM module:",
        "   ./scripts/build-doom.sh",
        "",
        "2. Make sure you have a valid WAD file:",
        "   bun run dev -- --wad /path/to/doom1.wad",
        "",
        "3. Download shareware WAD from:",
        "   https://distro.ibiblio.org/slitaz/sources/packages/d/doom-wad/",
      ].join("\n"),
      position: "absolute",
      left: 2,
      top: 3,
      fg: RGBA.fromInts(180, 180, 180),
    });
    container.add(helpText);
  }
}

async function gameLoop(deltaMs: number) {
  if (!doomEngine || !framebufferRenderable) return;

  // Run DOOM tick
  doomEngine.tick();

  // Get framebuffer from DOOM
  const pixels = doomEngine.getFrameBuffer();
  const fb = framebufferRenderable.frameBuffer;

  // With half-block rendering, each terminal cell represents 2 vertical pixels
  // So we need to scale DOOM to (fb.width * 1) x (fb.height * 2) source pixels
  const scaleX = DOOM_WIDTH / fb.width;
  const scaleY = DOOM_HEIGHT / (fb.height * 2); // *2 because each cell = 2 vertical pixels

  // Render to OpenTUI framebuffer using half-block characters
  // The upper half-block character (▀) uses foreground for top pixel, background for bottom
  for (let y = 0; y < fb.height; y++) {
    const srcY1 = Math.floor(y * 2 * scaleY);     // Top pixel row
    const srcY2 = Math.floor((y * 2 + 1) * scaleY); // Bottom pixel row

    for (let x = 0; x < fb.width; x++) {
      const srcX = Math.floor(x * scaleX);

      // Top pixel (foreground)
      const srcIdx1 = (srcY1 * DOOM_WIDTH + srcX) * 4;
      const r1 = pixels[srcIdx1] ?? 0;
      const g1 = pixels[srcIdx1 + 1] ?? 0;
      const b1 = pixels[srcIdx1 + 2] ?? 0;

      // Bottom pixel (background)
      const srcIdx2 = (srcY2 * DOOM_WIDTH + srcX) * 4;
      const r2 = pixels[srcIdx2] ?? 0;
      const g2 = pixels[srcIdx2 + 1] ?? 0;
      const b2 = pixels[srcIdx2 + 2] ?? 0;

      // Use upper half-block: ▀ (foreground = top, background = bottom)
      fb.setCell(x, y, "▀", RGBA.fromInts(r1, g1, b1), RGBA.fromInts(r2, g2, b2));
    }
  }
}

// Handle resize
renderer.on("resize", (width, height) => {
  if (framebufferRenderable) {
    framebufferRenderable.frameBuffer.resize(width, height);
  }
});

// Initialize
initDoom();
