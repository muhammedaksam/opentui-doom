/**
 * DOOM Audio Bridge for OpenTUI
 * 
 * Handles audio playback using mpv with proper process management.
 * All spawned processes are tracked and terminated on shutdown.
 */

import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { createConnection, Socket } from "net";
import { debugLog } from "./debug";

// Local helper to log with Audio category
function log(message: string): void {
    debugLog('Audio', message);
}

// Track all spawned mpv processes for cleanup
const activeProcesses = new Set<ChildProcess>();

// Current music process (only one music track at a time)
let musicProcess: ChildProcess | null = null;

// Current volume (0-127, DOOM standard)
let currentVolume = 100;

// Sound directory path
const soundDir = join(import.meta.dir, "..", "sound");

// IPC socket path for music volume control
const musicSocketPath = "/tmp/doom-music-mpv.sock";

// Whether audio is initialized
let initialized = false;

// Current music state for volume changes
let currentMusicName: string | null = null;
let currentMusicLooping: boolean = false;

/**
 * Initialize the audio system
 */
export function initAudio(): void {
    if (initialized) return;
    initialized = true;
    log(`Initialized, sound dir: ${soundDir}`);
}

/**
 * Shutdown the audio system and kill ALL spawned processes
 */
export function shutdownAudio(): void {
    if (!initialized) return;

    // Kill music process
    if (musicProcess) {
        try {
            musicProcess.kill("SIGKILL");
        } catch (e) {
            // Process may have already exited
        }
        musicProcess = null;
    }

    // Kill ALL tracked processes
    for (const proc of activeProcesses) {
        try {
            proc.kill("SIGKILL");
        } catch (e) {
            // Process may have already exited
        }
    }
    activeProcesses.clear();

    initialized = false;
    log("Shutdown complete");
}

/**
 * Helper to spawn mpv with common options
 */
function spawnMpv(filePath: string, options: string[] = []): ChildProcess | null {
    if (!existsSync(filePath)) {
        log(`File not found: ${filePath}`);
        return null;
    }

    const args = [
        "--no-video",           // No video output
        "--no-terminal",        // No terminal output
        "--really-quiet",       // Suppress all output
        ...options,
        filePath
    ];

    try {
        const proc = spawn("mpv", args, {
            stdio: "ignore",
            detached: false,    // Keep attached to parent process
        });

        // Track the process
        activeProcesses.add(proc);

        // Remove from tracking when process exits
        proc.on("exit", () => {
            activeProcesses.delete(proc);
        });

        proc.on("error", (err) => {
            log(`mpv error: ${err.message}`);
            activeProcesses.delete(proc);
        });

        return proc;
    } catch (e) {
        log(`Failed to spawn mpv: ${e}`);
        return null;
    }
}

/**
 * Play a sound effect
 * Sound files should be in sound/ds{name}.wav
 * Volume is 0-127 (DOOM standard)
 */
export function playSound(name: string, volume: number = 127): void {
    if (!initialized) {
        log("playSound called but not initialized");
        return;
    }

    const soundPath = join(soundDir, `ds${name.toLowerCase()}.wav`);

    // Convert DOOM volume (0-127) to mpv volume (0-100)
    const mpvVolume = Math.round((volume / 127) * 100);
    log(`Playing sound: ${soundPath} at volume ${mpvVolume}`);

    // Fire and forget - process will auto-cleanup when done
    const proc = spawnMpv(soundPath, [`--volume=${mpvVolume}`]);
    log(`Spawn result: ${proc ? "success" : "failed"}`);
}

/**
 * Play music track
 * Music files should be in sound/{name}.mp3
 */
export function playMusic(name: string, looping: boolean): void {
    if (!initialized) {
        log("playMusic called but not initialized");
        return;
    }

    // Stop any currently playing music
    stopMusic();

    // Clean up any stale socket file
    try {
        if (existsSync(musicSocketPath)) {
            unlinkSync(musicSocketPath);
        }
    } catch (e) {
        // Ignore
    }

    // Store music state for volume changes
    currentMusicName = name;
    currentMusicLooping = looping;

    const musicPath = join(soundDir, `${name.toLowerCase()}.mp3`);
    log(`Playing music: ${musicPath}, looping: ${looping}`);
    const options: string[] = [
        `--input-ipc-server=${musicSocketPath}`,  // Enable IPC for volume control
    ];
    if (looping) {
        options.push("--loop=inf");
    }

    // Set volume (mpv uses 0-100 scale, DOOM uses 0-127)
    const mpvVolume = Math.round((currentVolume / 127) * 100);
    options.push(`--volume=${mpvVolume}`);

    musicProcess = spawnMpv(musicPath, options);
}

/**
 * Stop the currently playing music
 */
export function stopMusic(): void {
    if (musicProcess) {
        try {
            musicProcess.kill("SIGTERM");
        } catch (e) {
            // Process may have already exited
        }
        activeProcesses.delete(musicProcess);
        musicProcess = null;
    }
    currentMusicName = null;
}

/**
 * Set music volume (0-127)
 * Uses IPC socket to change volume without restarting music
 */
export function setMusicVolume(volume: number): void {
    const newVolume = Math.max(0, Math.min(127, volume));
    currentVolume = newVolume;

    // If no music is playing, just save the volume for next play
    if (!musicProcess || !currentMusicName) {
        return;
    }

    // Convert to mpv volume (0-100)
    const mpvVolume = Math.round((newVolume / 127) * 100);
    log(`Setting music volume to ${mpvVolume} via IPC`);

    // Send volume command via IPC socket
    try {
        const socket = createConnection(musicSocketPath);

        socket.on("connect", () => {
            const cmd = JSON.stringify({ command: ["set_property", "volume", mpvVolume] }) + "\n";
            socket.write(cmd);
            socket.end();
        });

        socket.on("error", (err) => {
            log(`IPC socket error: ${err.message}`);
        });
    } catch (e) {
        log(`Failed to send IPC command: ${e}`);
    }
}
