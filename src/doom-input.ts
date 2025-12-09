/**
 * DOOM Input Handler
 * 
 * Maps OpenTUI keyboard events to DOOM key codes
 */

import type { KeyEvent } from "@opentui/core";
import type { DoomEngine } from "./doom-engine";

// DOOM key codes (from doomkeys.h)
export const DoomKeys = {
    KEY_RIGHTARROW: 0xae,
    KEY_LEFTARROW: 0xac,
    KEY_UPARROW: 0xad,
    KEY_DOWNARROW: 0xaf,
    KEY_STRAFE_L: 0xa0,
    KEY_STRAFE_R: 0xa1,
    KEY_USE: 0xa2,
    KEY_FIRE: 0xa3,
    KEY_ESCAPE: 27,
    KEY_ENTER: 13,
    KEY_TAB: 9,
    KEY_F1: 0x80 + 0x3b,
    KEY_F2: 0x80 + 0x3c,
    KEY_F3: 0x80 + 0x3d,
    KEY_F4: 0x80 + 0x3e,
    KEY_F5: 0x80 + 0x3f,
    KEY_F6: 0x80 + 0x40,
    KEY_F7: 0x80 + 0x41,
    KEY_F8: 0x80 + 0x42,
    KEY_F9: 0x80 + 0x43,
    KEY_F10: 0x80 + 0x44,
    KEY_F11: 0x80 + 0x57,
    KEY_F12: 0x80 + 0x58,
    KEY_BACKSPACE: 127,
    KEY_PAUSE: 0xff,
    KEY_EQUALS: 0x3d,
    KEY_MINUS: 0x2d,
    KEY_RSHIFT: 0x80 + 0x36,
    KEY_RCTRL: 0x80 + 0x1d,
    KEY_RALT: 0x80 + 0x38,
    KEY_LALT: 0x80 + 0x38,
    KEY_CAPSLOCK: 0x80 + 0x3a,
    KEY_NUMLOCK: 0x80 + 0x45,
    KEY_SCRLCK: 0x80 + 0x46,
    KEY_PRTSCR: 0x80 + 0x59,
    KEY_HOME: 0x80 + 0x47,
    KEY_END: 0x80 + 0x4f,
    KEY_PGUP: 0x80 + 0x49,
    KEY_PGDN: 0x80 + 0x51,
    KEY_INS: 0x80 + 0x52,
    KEY_DEL: 0x80 + 0x53,
} as const;

// Key state tracking for press/release
const keyStates = new Map<string, boolean>();

/**
 * Map an OpenTUI key event to DOOM key code(s)
 * Returns an array of key codes - for most keys this is a single code,
 * but for WASD we return both the movement key AND the character
 * so both gameplay movement and text input work.
 */
function mapKeyToDoom(key: KeyEvent): number[] {
    const name = key.name?.toLowerCase() ?? "";

    // Arrow keys
    if (name === "up" || key.sequence === "\x1b[A") return [DoomKeys.KEY_UPARROW];
    if (name === "down" || key.sequence === "\x1b[B") return [DoomKeys.KEY_DOWNARROW];
    if (name === "left" || key.sequence === "\x1b[D") return [DoomKeys.KEY_LEFTARROW];
    if (name === "right" || key.sequence === "\x1b[C") return [DoomKeys.KEY_RIGHTARROW];

    // WASD movement - send BOTH movement key AND character
    // Movement key ensures gameplay works, character ensures text input works
    if (name === "w") return [DoomKeys.KEY_UPARROW, "w".charCodeAt(0)];
    if (name === "s") return [DoomKeys.KEY_DOWNARROW, "s".charCodeAt(0)];
    if (name === "a") return [DoomKeys.KEY_STRAFE_L, "a".charCodeAt(0)];
    if (name === "d") return [DoomKeys.KEY_STRAFE_R, "d".charCodeAt(0)];

    // Action keys
    if (name === "space") return [" ".charCodeAt(0)];  // Use
    if (name === "return" || name === "enter") return [DoomKeys.KEY_ENTER];
    if (name === "escape") return [DoomKeys.KEY_ESCAPE];
    if (name === "tab") return [DoomKeys.KEY_TAB];
    if (name === "backspace") return [DoomKeys.KEY_BACKSPACE];

    // Fire (Ctrl) - but not Ctrl+C which should exit
    if (key.ctrl && key.name !== "c") return [DoomKeys.KEY_FIRE];

    // Alt for strafe
    if (key.meta || key.name === "alt") return [DoomKeys.KEY_LALT];

    // Shift for run
    if (key.shift) return [DoomKeys.KEY_RSHIFT];

    // Function keys
    if (name === "f1") return [DoomKeys.KEY_F1];
    if (name === "f2") return [DoomKeys.KEY_F2];
    if (name === "f3") return [DoomKeys.KEY_F3];
    if (name === "f4") return [DoomKeys.KEY_F4];
    if (name === "f5") return [DoomKeys.KEY_F5];
    if (name === "f6") return [DoomKeys.KEY_F6];
    if (name === "f7") return [DoomKeys.KEY_F7];
    if (name === "f8") return [DoomKeys.KEY_F8];
    if (name === "f9") return [DoomKeys.KEY_F9];
    if (name === "f10") return [DoomKeys.KEY_F10];
    if (name === "f11") return [DoomKeys.KEY_F11];
    if (name === "f12") return [DoomKeys.KEY_F12];

    // Weapon selection (1-9, 0)
    if (name >= "0" && name <= "9") return [name.charCodeAt(0)];

    // Plus/minus for gamma/zoom
    if (name === "+" || name === "=") return [DoomKeys.KEY_EQUALS];
    if (name === "-") return [DoomKeys.KEY_MINUS];

    // Y/N for prompts
    if (name === "y") return ["y".charCodeAt(0)];
    if (name === "n") return ["n".charCodeAt(0)];

    // Other letter keys (for cheats, etc)
    if (name.length === 1 && name >= "a" && name <= "z") {
        return [name.charCodeAt(0)];
    }

    return [];
}

/**
 * Create an input handler that forwards OpenTUI key events to DOOM
 */
// Track release timers for each key
const keyTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface DoomInputOptions {
    engine: DoomEngine;
    onExit?: () => void;
}

export function createDoomInputHandler(options: DoomInputOptions) {
    const { engine, onExit } = options;

    return (key: KeyEvent) => {
        // Handle Ctrl+C for exit
        if (key.ctrl && (key.name === "c" || key.sequence === "\x03")) {
            if (onExit) {
                onExit();
            }
            return;
        }

        const doomKeys = mapKeyToDoom(key);

        if (doomKeys.length === 0) return;

        const keyId = key.name || key.sequence || "";
        const wasPressed = keyStates.get(keyId) ?? false;
        const keyName = key.name?.toLowerCase() ?? "";

        // Menu confirmation keys (y/n) should always send keydown on every press
        // These are used for quit dialogs and other prompts
        const isMenuConfirmKey = keyName === "y" || keyName === "n";

        // Clear any existing release timer for this key
        const existingTimer = keyTimers.get(keyId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            keyTimers.delete(keyId);
        }

        // Key press - send if not already pressed, OR if it's a menu confirmation key
        if (!wasPressed || isMenuConfirmKey) {
            keyStates.set(keyId, true);
            // Send all mapped keys (for WASD this includes both movement and character)
            for (const doomKey of doomKeys) {
                engine.pushKey(true, doomKey);
            }
            
            // For menu confirmation keys, immediately send release too
            // since DOOM only cares about the keydown event
            if (isMenuConfirmKey) {
                setTimeout(() => {
                    for (const doomKey of doomKeys) {
                        engine.pushKey(false, doomKey);
                    }
                    keyStates.set(keyId, false);
                }, 50);
                return;
            }
        }

        // Schedule key release after 300ms of no input (for non-menu keys)
        const timer = setTimeout(() => {
            if (keyStates.get(keyId)) {
                keyStates.set(keyId, false);
                for (const doomKey of doomKeys) {
                    engine.pushKey(false, doomKey);
                }
                keyTimers.delete(keyId);
            }
        }, 300);
        keyTimers.set(keyId, timer);
    };
}

/**
 * Get help text for controls
 */
export function getControlsHelp(): string {
    return [
        "Controls:",
        "  Movement: Arrow Keys or WASD",
        "  Fire: Ctrl",
        "  Use/Open: Space",
        "  Run: Shift",
        "  Strafe: A/D or Alt+Arrows",
        "  Weapons: 1-7",
        "  Menu: Escape",
        "  Map: Tab",
    ].join("\n");
}
