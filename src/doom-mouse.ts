/**
 * DOOM Mouse Input Handler
 *
 * Provides mouse-based turning and firing for DOOM.
 * Mouse horizontal movement translates to left/right turning.
 * Left click fires the weapon.
 */

import type { DoomEngine } from "./doom-engine";
import { DoomKeys } from "./doom-input";
import { debugLog } from "./debug";

export interface DoomMouseOptions {
  engine: DoomEngine;
  sensitivity?: number; // Cells of movement before triggering turn (default: 2)
}

export interface DoomMouseHandler {
  onMouseMove: (x: number, y: number) => void;
  onMouseDown: (button: number) => void;
  onMouseUp: (button: number) => void;
  reset: () => void;
}

/**
 * Create a mouse handler that forwards mouse events to DOOM
 */
export function createDoomMouseHandler(options: DoomMouseOptions): DoomMouseHandler {
  const { engine } = options;

  let lastMouseX: number | null = null;
  let isLeftMouseDown = false;
  let currentTurnKey: number | null = null;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  const RELEASE_DELAY = 100; // Release key 100ms after last movement

  return {
    /**
     * Handle mouse movement - hold turn key while moving
     */
    onMouseMove(x: number, _y: number): void {
      if (lastMouseX === null) {
        lastMouseX = x;
        return;
      }

      const delta = x - lastMouseX;
      lastMouseX = x;

      if (delta === 0) return;

      const newTurnKey = delta > 0 ? DoomKeys.KEY_RIGHTARROW : DoomKeys.KEY_LEFTARROW;

      // Clear any pending release
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }

      // If direction changed, release old and press new
      if (currentTurnKey !== newTurnKey) {
        if (currentTurnKey !== null) {
          engine.pushKey(false, currentTurnKey);
        }
        engine.pushKey(true, newTurnKey);
        currentTurnKey = newTurnKey;
      }

      // Schedule release after delay (will be cancelled if more movement comes)
      releaseTimer = setTimeout(() => {
        if (currentTurnKey !== null) {
          engine.pushKey(false, currentTurnKey);
          currentTurnKey = null;
        }
        releaseTimer = null;
      }, RELEASE_DELAY);
    },

    /**
     * Handle mouse button press
     */
    onMouseDown(button: number): void {
      // Left click (button 0) = fire
      if (button === 0 && !isLeftMouseDown) {
        isLeftMouseDown = true;
        engine.pushKey(true, DoomKeys.KEY_FIRE);
        debugLog("Mouse", "Fire pressed");
      }
    },

    /**
     * Handle mouse button release
     */
    onMouseUp(button: number): void {
      // Left click release = stop firing
      if (button === 0 && isLeftMouseDown) {
        isLeftMouseDown = false;
        engine.pushKey(false, DoomKeys.KEY_FIRE);
        debugLog("Mouse", "Fire released");
      }
    },

    /**
     * Reset mouse state (useful when window loses focus)
     */
    reset(): void {
      lastMouseX = null;

      // Clear pending release timer
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }

      // Release any held turn key
      if (currentTurnKey !== null) {
        engine.pushKey(false, currentTurnKey);
        currentTurnKey = null;
      }

      // Release fire if held
      if (isLeftMouseDown) {
        isLeftMouseDown = false;
        engine.pushKey(false, DoomKeys.KEY_FIRE);
      }
    },
  };
}
