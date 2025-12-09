/**
 * DOOM Engine - WebAssembly wrapper for doomgeneric
 * 
 * Handles loading and running the DOOM WASM module,
 * providing a TypeScript interface for the game.
 */

import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { debugLog } from "./debug";
import { loadExistingSaves, writeSave } from "./doom-saves";

// DOOM screen dimensions
export const DOOM_WIDTH = 1280;
export const DOOM_HEIGHT = 800;

export interface DoomModule {
    _doomgeneric_Create: (argc: number, argv: number) => void;
    _doomgeneric_Tick: () => void;
    _DG_GetFrameBuffer: () => number;
    _DG_PushKeyEvent: (pressed: number, key: number) => void;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    HEAPU8: Uint8Array;
    HEAPU32: Uint32Array;
    FS_createDataFile: (
        parent: string,
        name: string,
        data: number[],
        canRead: boolean,
        canWrite: boolean,
        canOwn?: boolean
    ) => void;
    FS_createPath: (
        parent: string,
        path: string,
        canRead: boolean,
        canWrite: boolean
    ) => string;
    FS?: {
        readFile: (path: string, opts?: { encoding?: string }) => Uint8Array;
        readdir: (path: string) => string[];
        stat: (path: string) => { mode: number };
        isDir: (mode: number) => boolean;
    };
    ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
    cwrap: (name: string, returnType: string | null, argTypes: string[]) => (...args: any[]) => any;
    setValue: (ptr: number, value: number, type: string) => void;
    getValue: (ptr: number, type: string) => number;
}

export interface DoomEngineOptions {
    wadPath: string;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
    onQuit?: () => void;
}

export class DoomEngine {
    private module: DoomModule | null = null;
    private frameBufferPtr: number = 0;
    private initialized: boolean = false;
    private wadPath: string;
    private print: (text: string) => void;
    private printErr: (text: string) => void;
    private onQuit: (() => void) | null = null;
    private emscriptenFS: any = null;  // FS reference captured from Emscripten

    constructor(optionsOrPath: string | DoomEngineOptions) {
        if (typeof optionsOrPath === "string") {
            this.wadPath = resolve(optionsOrPath);
            this.print = (text: string) => console.log('[DOOM]', text);
            this.printErr = (text: string) => console.error('[DOOM]', text);
        } else {
            this.wadPath = resolve(optionsOrPath.wadPath);
            this.print = optionsOrPath.print || ((text: string) => console.log('[DOOM]', text));
            this.printErr = optionsOrPath.printErr || ((text: string) => console.error('[DOOM]', text));
            this.onQuit = optionsOrPath.onQuit || null;
        }
    }

    async init(): Promise<void> {
        // Load the WASM module
        const buildDir = join(import.meta.dir, "..", "doom", "build");
        const doomJsPath = join(buildDir, "doom.js");

        // Read WAD file first
        const wadData = await readFile(this.wadPath);
        const wadArray = Array.from(new Uint8Array(wadData));

        // Dynamic import of the compiled DOOM module
        const createDoomModule = require(doomJsPath);

        // Import audio system
        const audio = await import("./doom-audio");

        // Create module with proper callbacks
        const moduleConfig: any = {
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) {
                    return join(buildDir, path);
                }
                return path;
            },
            print: (text: string) => this.print(text),
            printErr: (text: string) => this.printErr(text),

            // Audio callbacks - called from C via EM_ASM
            initAudio: () => audio.initAudio(),
            shutdownAudio: () => audio.shutdownAudio(),
            playSound: (name: string, volume: number) => audio.playSound(name, volume),
            playMusic: (name: string, looping: boolean) => audio.playMusic(name, looping),
            stopMusic: () => audio.stopMusic(),
            setMusicVolume: (volume: number) => audio.setMusicVolume(volume),

            // Game lifecycle callbacks - called from C via EM_ASM
            quitGame: () => {
                debugLog('Engine', 'quitGame callback called from WASM');
                debugLog('Engine', `this.onQuit is: ${this.onQuit ? 'defined' : 'undefined'}`);
                if (this.onQuit) {
                    debugLog('Engine', 'calling this.onQuit()');
                    this.onQuit();
                    debugLog('Engine', 'this.onQuit() returned');
                }
            },

            // preRun receives Module as first argument  
            preRun: [
                (module: any) => {
                    // Create /doom directory for WAD
                    module.FS_createPath("/", "doom", true, true);
                    // Write WAD file to virtual filesystem
                    module.FS_createDataFile("/doom", "doom1.wad", wadArray, true, false);
                    
                    // Create .savegame directory for saves (DOOM looks here by default)
                    module.FS_createPath("/", ".savegame", true, true);
                    
                    // Load existing saves from ~/.opentui-doom/ into virtual filesystem
                    const existingSaves = loadExistingSaves();
                    for (const [slot, data] of existingSaves) {
                        const filename = `doomsav${slot}.dsg`;
                        try {
                            module.FS_createDataFile("/.savegame", filename, Array.from(data), true, true);
                            debugLog("Engine", `Pre-loaded save slot ${slot} to virtual FS`);
                        } catch (e) {
                            debugLog("Engine", `Failed to pre-load save slot ${slot}: ${e}`);
                        }
                    }
                }
            ],
        };

        this.module = await createDoomModule(moduleConfig);

        if (!this.module) {
            throw new Error("Failed to initialize DOOM module");
        }
        
        // Capture FS reference after module is fully loaded
        // Try different methods to access Emscripten's FS
        if ((this.module as any).FS) {
            this.emscriptenFS = (this.module as any).FS;
            debugLog("Engine", "Captured FS from module.FS");
        } else if (typeof (globalThis as any).FS !== 'undefined') {
            this.emscriptenFS = (globalThis as any).FS;
            debugLog("Engine", "Captured FS from globalThis.FS");
        } else {
            debugLog("Engine", "Warning: Could not find Emscripten FS object");
        }

        // Initialize DOOM
        this.initDoom();

        // Get framebuffer pointer
        this.frameBufferPtr = this.module._DG_GetFrameBuffer();
        this.initialized = true;
    }

    private initDoom(): void {
        if (!this.module) return;

        const module = this.module;

        const args = [
            "doom",
            "-iwad",
            "/doom/doom1.wad"
        ];

        // Allocate memory for argv using ccall for strings
        const argPtrs: number[] = [];
        for (const arg of args) {
            // Allocate space for string + null terminator
            const ptr = module._malloc(arg.length + 1);
            // Use setValue to write each character
            for (let i = 0; i < arg.length; i++) {
                module.setValue(ptr + i, arg.charCodeAt(i), 'i8');
            }
            // Null terminate
            module.setValue(ptr + arg.length, 0, 'i8');
            argPtrs.push(ptr);
        }

        // Create argv array
        const argvPtr = module._malloc(argPtrs.length * 4);
        for (let i = 0; i < argPtrs.length; i++) {
            const ptr = argPtrs[i];
            if (ptr !== undefined) {
                module.setValue(argvPtr + i * 4, ptr, 'i32');
            }
        }

        // Call doomgeneric_Create
        module._doomgeneric_Create(args.length, argvPtr);

        // Free argv (DOOM copies the strings)
        for (const ptr of argPtrs) {
            module._free(ptr);
        }
        module._free(argvPtr);
    }

    /**
     * Run one game tick - called each frame
     */
    tick(): void {
        if (!this.module || !this.initialized) return;
        this.module._doomgeneric_Tick();
    }

    /**
     * Get the current frame as RGBA pixel data
     * DOOM uses ARGB format, so we need to convert
     */
    getFrameBuffer(): Uint8Array {
        if (!this.module || !this.initialized) {
            return new Uint8Array(DOOM_WIDTH * DOOM_HEIGHT * 4);
        }

        const pixels = DOOM_WIDTH * DOOM_HEIGHT;
        const buffer = new Uint8Array(pixels * 4);
        const module = this.module;

        // Read ARGB data from DOOM's framebuffer using getValue
        for (let i = 0; i < pixels; i++) {
            const argb = module.getValue(this.frameBufferPtr + i * 4, 'i32');
            const offset = i * 4;
            buffer[offset + 0] = (argb >> 16) & 0xFF; // R
            buffer[offset + 1] = (argb >> 8) & 0xFF;  // G
            buffer[offset + 2] = argb & 0xFF;         // B
            buffer[offset + 3] = 255;                  // A (always opaque)
        }

        return buffer;
    }

    /**
     * Push a key event to DOOM
     */
    pushKey(pressed: boolean, key: number): void {
        if (!this.module || !this.initialized) return;
        this.module._DG_PushKeyEvent(pressed ? 1 : 0, key);
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Sync save games from the virtual filesystem to disk (~/.opentui-doom/)
     * Call this periodically or after save operations to persist saves
     */
    syncSaves(): void {
        if (!this.module || !this.emscriptenFS) {
            debugLog("Engine", "syncSaves: module or FS not available");
            return;
        }
        
        // DOOM can save to different paths depending on configuration
        // Try multiple possible locations
        const savePaths = [
            "/",              // Root
            "/.savegame",     // Default when configdir is "."
            ".savegame",      // Relative path (CWD)
            "/doom",          // Our custom path  
            "/tmp",           // Temp directory
        ];
        
        const FS = this.emscriptenFS;
        
        // List root directory to see what exists
        try {
            const rootEntries = FS.readdir("/");
            debugLog("Engine", `VFS root contents: ${rootEntries.join(", ")}`);
            
            // Check each directory at root
            for (const entry of rootEntries) {
                if (entry === "." || entry === "..") continue;
                try {
                    const stat = FS.stat(`/${entry}`);
                    if (FS.isDir(stat.mode)) {
                        const subEntries = FS.readdir(`/${entry}`);
                        const dsgFiles = subEntries.filter((e: string) => e.endsWith(".dsg"));
                        if (dsgFiles.length > 0) {
                            debugLog("Engine", `Found .dsg files in /${entry}: ${dsgFiles.join(", ")}`);
                        }
                    }
                } catch (e) {
                    // Not a directory or can't read
                }
            }
        } catch (e) {
            debugLog("Engine", `Failed to list VFS root: ${e}`);
        }
        
        for (let slot = 0; slot <= 5; slot++) {
            const filename = `doomsav${slot}.dsg`;
            
            for (const basePath of savePaths) {
                const vfsPath = basePath === "/" ? `/${filename}` : `${basePath}/${filename}`;
                
                try {
                    // Try to read the file from virtual FS
                    const data = FS.readFile(vfsPath);
                    if (data && data.length > 0) {
                        debugLog("Engine", `Found save at ${vfsPath}, syncing slot ${slot} (${data.length} bytes)`);
                        writeSave(slot, data);
                        break; // Found this slot, move to next
                    }
                } catch (e) {
                    // File doesn't exist at this path, try next
                }
            }
        }
    }
}
