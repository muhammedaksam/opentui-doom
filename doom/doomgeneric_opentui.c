/**
 * OpenTUI platform implementation for doomgeneric
 *
 * This file implements the 5 required functions for doomgeneric:
 * - DG_Init: Initialize the rendering system
 * - DG_DrawFrame: Called when a frame is ready to be displayed
 * - DG_SleepMs: Sleep for a number of milliseconds
 * - DG_GetTicksMs: Get current time in milliseconds
 * - DG_GetKey: Get keyboard input
 */

#include "doomgeneric.h"
#include "doomkeys.h"
#include <emscripten.h>
#include <stdint.h>
#include <string.h>

// NOTE: vanilla_keyboard_mapping is defined in i_input.c

// Key event queue
#define KEY_QUEUE_SIZE 256
static struct {
  int pressed;
  unsigned char key;
} key_queue[KEY_QUEUE_SIZE];
static int key_queue_read = 0;
static int key_queue_write = 0;

// Frame buffer pointer (exposed to JS)
static uint32_t *frame_buffer = NULL;

// Get the framebuffer pointer for JS to read
EMSCRIPTEN_KEEPALIVE
uint32_t *DG_GetFrameBuffer(void) { return DG_ScreenBuffer; }

// Push a key event from JavaScript
EMSCRIPTEN_KEEPALIVE
void DG_PushKeyEvent(int pressed, unsigned char key) {
  int next_write = (key_queue_write + 1) % KEY_QUEUE_SIZE;
  if (next_write != key_queue_read) {
    key_queue[key_queue_write].pressed = pressed;
    key_queue[key_queue_write].key = key;
    key_queue_write = next_write;
  }
}

// NOTE: I_InitInput and I_GetEvent are defined in i_input.c
// i_input.c's I_GetEvent calls DG_GetKey to read our key queue
// Do NOT define stubs here as they would override the real implementations!

void DG_Init(void) {
  // Initialization done in JavaScript
}

void DG_DrawFrame(void) {
  // The frame is drawn to DG_ScreenBuffer
  // JavaScript will read it via DG_GetFrameBuffer
  // Signal to JS that a frame is ready (handled by tick loop)
}

void DG_SleepMs(uint32_t ms) {
  // No-op in WASM - JavaScript handles timing via game loop
  // Don't use emscripten_sleep as it requires ASYNCIFY
  (void)ms; // Suppress unused warning
}

uint32_t DG_GetTicksMs(void) { return (uint32_t)emscripten_get_now(); }

int DG_GetKey(int *pressed, unsigned char *key) {
  if (key_queue_read != key_queue_write) {
    *pressed = key_queue[key_queue_read].pressed;
    *key = key_queue[key_queue_read].key;
    key_queue_read = (key_queue_read + 1) % KEY_QUEUE_SIZE;
    return 1;
  }
  return 0;
}

void DG_SetWindowTitle(const char *title) {
  // Could emit to JS if needed
}
