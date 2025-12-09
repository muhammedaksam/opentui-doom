/**
 * Save Game Manager for OpenTUI-DOOM
 * 
 * Handles persistence of DOOM save games to ~/.opentui-doom/
 * DOOM uses 6 save slots (0-5) with files named doomsav{N}.dsg
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { debugLog } from "./debug";

// Save game directory path
const SAVE_DIR = join(homedir(), ".opentui-doom");

// DOOM save file format: doomsav{0-5}.dsg
const SAVE_FILE_PATTERN = /^doomsav([0-5])\.dsg$/;

/**
 * Ensure the save directory exists
 */
export function ensureSaveDir(): void {
    if (!existsSync(SAVE_DIR)) {
        mkdirSync(SAVE_DIR, { recursive: true });
        debugLog("Saves", `Created save directory: ${SAVE_DIR}`);
    }
}

/**
 * Get the save game directory path
 */
export function getSaveGameDir(): string {
    ensureSaveDir();
    return SAVE_DIR;
}

/**
 * Get the path to a save file for a given slot (0-5)
 */
export function getSaveFilePath(slot: number): string {
    if (slot < 0 || slot > 5) {
        throw new Error(`Invalid save slot: ${slot}. Must be 0-5.`);
    }
    return join(SAVE_DIR, `doomsav${slot}.dsg`);
}

/**
 * Load all existing save games from disk
 * Returns a Map of slot number to file contents (Uint8Array)
 */
export function loadExistingSaves(): Map<number, Uint8Array> {
    ensureSaveDir();
    const saves = new Map<number, Uint8Array>();
    
    try {
        const files = readdirSync(SAVE_DIR);
        for (const file of files) {
            const match = file.match(SAVE_FILE_PATTERN);
            if (match && match[1]) {
                const slot = parseInt(match[1], 10);
                const filePath = join(SAVE_DIR, file);
                try {
                    const data = readFileSync(filePath);
                    saves.set(slot, new Uint8Array(data));
                    debugLog("Saves", `Loaded save slot ${slot}: ${data.length} bytes`);
                } catch (e) {
                    debugLog("Saves", `Failed to read save file ${filePath}: ${e}`);
                }
            }
        }
    } catch (e) {
        debugLog("Saves", `Failed to list save directory: ${e}`);
    }
    
    debugLog("Saves", `Loaded ${saves.size} existing saves`);
    return saves;
}

/**
 * Write a save game to disk
 */
export function writeSave(slot: number, data: Uint8Array): boolean {
    ensureSaveDir();
    const filePath = getSaveFilePath(slot);
    
    try {
        writeFileSync(filePath, data);
        debugLog("Saves", `Wrote save slot ${slot}: ${data.length} bytes to ${filePath}`);
        return true;
    } catch (e) {
        debugLog("Saves", `Failed to write save slot ${slot}: ${e}`);
        return false;
    }
}

/**
 * Check if a save exists for a given slot
 */
export function saveExists(slot: number): boolean {
    const filePath = getSaveFilePath(slot);
    return existsSync(filePath);
}

/**
 * Read a save game from disk
 */
export function readSave(slot: number): Uint8Array | null {
    const filePath = getSaveFilePath(slot);
    
    if (!existsSync(filePath)) {
        return null;
    }
    
    try {
        const data = readFileSync(filePath);
        return new Uint8Array(data);
    } catch (e) {
        debugLog("Saves", `Failed to read save slot ${slot}: ${e}`);
        return null;
    }
}
