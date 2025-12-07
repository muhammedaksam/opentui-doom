/**
 * OpenTUI sound bridge for doomgeneric
 *
 * This file implements the sound_module_t and music_module_t interfaces
 * that DOOM uses for audio. It calls out to JavaScript via Emscripten.
 */

// Include DOOM headers first to define 'boolean' type before emscripten's
// macros
#include "config.h"
#include "doomtype.h"
#include "i_sound.h"
#include "m_misc.h"
#include "w_wad.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Now include emscripten - it defines true/false as macros, but that's OK
// since we've already defined them via doomtype.h's enum
#include <emscripten.h>

// JavaScript callbacks (defined via EM_JS or called via emscripten_run_script)
// We'll use simple string-based callbacks for simplicity

// These are expected to exist by i_sound.h
int use_libsamplerate = 0;
float libsamplerate_scale = 0.65f;

static boolean sound_initialized = false;
static boolean use_sfx_prefix = true;

// Initialize sound
static boolean I_JS_InitSound(boolean _use_sfx_prefix) {
  use_sfx_prefix = _use_sfx_prefix;
  sound_initialized = true;

  // Call JavaScript to initialize audio
  EM_ASM({
    if (typeof Module.initAudio === 'function') {
      Module.initAudio();
    }
  });

  return true;
}

static void I_JS_ShutdownSound(void) {
  if (!sound_initialized)
    return;

  EM_ASM({
    if (typeof Module.shutdownAudio === 'function') {
      Module.shutdownAudio();
    }
  });

  sound_initialized = false;
}

static int I_JS_GetSfxLumpNum(sfxinfo_t *sfx) {
  char namebuf[9];

  if (sfx->link != NULL) {
    sfx = sfx->link;
  }

  if (use_sfx_prefix) {
    M_snprintf(namebuf, sizeof(namebuf), "ds%s", sfx->name);
  } else {
    M_StringCopy(namebuf, sfx->name, sizeof(namebuf));
  }

  return W_GetNumForName(namebuf);
}

static void I_JS_UpdateSound(void) {
  // No-op - JavaScript handles its own updates
}

static void I_JS_UpdateSoundParams(int channel, int vol, int sep) {
  // No-op - we don't support stereo positioning currently
}

// Play a sound effect with volume
static int I_JS_StartSound(sfxinfo_t *sfxinfo, int channel, int vol, int sep) {
  if (!sound_initialized || !sfxinfo)
    return -1;

  const char *name = sfxinfo->name;

  // Call JavaScript to play the sound with volume
  EM_ASM(
      {
        var name = UTF8ToString($0);
        var volume = $1;
        if (typeof Module.playSound === 'function') {
          Module.playSound(name, volume);
        }
      },
      name, vol);

  return channel;
}

static void I_JS_StopSound(int handle) {
  // No-op - sounds play to completion
}

static boolean I_JS_SoundIsPlaying(int handle) {
  // Always return false - we don't track sound state
  return false;
}

static void I_JS_PrecacheSounds(sfxinfo_t *sounds, int num_sounds) {
  // No-op - JavaScript handles caching
}

// Sound module definition
static snddevice_t sound_devices[] = {
    SNDDEVICE_SB,          SNDDEVICE_PAS,         SNDDEVICE_GUS,
    SNDDEVICE_WAVEBLASTER, SNDDEVICE_SOUNDCANVAS, SNDDEVICE_AWE32,
};

sound_module_t DG_sound_module = {
    sound_devices,          sizeof(sound_devices) / sizeof(sound_devices[0]),
    I_JS_InitSound,         I_JS_ShutdownSound,
    I_JS_GetSfxLumpNum,     I_JS_UpdateSound,
    I_JS_UpdateSoundParams, I_JS_StartSound,
    I_JS_StopSound,         I_JS_SoundIsPlaying,
    I_JS_PrecacheSounds,
};

// ===== Music Module =====

static boolean music_initialized = false;
static char *current_music_name = NULL;

static boolean I_JS_InitMusic(void) {
  music_initialized = true;
  return true;
}

static void I_JS_ShutdownMusic(void) {
  if (current_music_name) {
    free(current_music_name);
    current_music_name = NULL;
  }
  music_initialized = false;
}

static void I_JS_SetMusicVolume(int volume) {
  EM_ASM(
      {
        if (typeof Module.setMusicVolume === 'function') {
          Module.setMusicVolume($0);
        }
      },
      volume);
}

static void I_JS_PauseSong(void) {
  // No-op for now
}

static void I_JS_ResumeSong(void) {
  // No-op for now
}

static void *I_JS_RegisterSong(void *data, int len) {
  // For our purposes, 'data' is the music name (string)
  char *name = (char *)data;
  size_t name_len = strlen(name);
  char *copy = malloc(name_len + 1);
  strcpy(copy, name);
  return copy;
}

static void I_JS_UnRegisterSong(void *handle) {
  if (handle) {
    free(handle);
  }
}

static void I_JS_PlaySong(void *handle, boolean looping) {
  if (!handle)
    return;

  const char *name = (const char *)handle;

  // Store current music name
  if (current_music_name) {
    free(current_music_name);
  }
  current_music_name = malloc(strlen(name) + 1);
  strcpy(current_music_name, name);

  // Call JavaScript to play music
  EM_ASM(
      {
        var name = UTF8ToString($0);
        var looping = $1;
        if (typeof Module.playMusic === 'function') {
          Module.playMusic(name, looping);
        }
      },
      name, looping ? 1 : 0);
}

static void I_JS_StopSong(void) {
  EM_ASM({
    if (typeof Module.stopMusic === 'function') {
      Module.stopMusic();
    }
  });
}

static boolean I_JS_MusicIsPlaying(void) { return current_music_name != NULL; }

static void I_JS_PollMusic(void) {
  // No-op - JavaScript handles its own polling
}

// Music module definition
static snddevice_t music_devices[] = {
    SNDDEVICE_SB,          SNDDEVICE_PAS,         SNDDEVICE_GUS,
    SNDDEVICE_WAVEBLASTER, SNDDEVICE_SOUNDCANVAS, SNDDEVICE_GENMIDI,
    SNDDEVICE_AWE32,
};

music_module_t DG_music_module = {
    music_devices,       sizeof(music_devices) / sizeof(music_devices[0]),
    I_JS_InitMusic,      I_JS_ShutdownMusic,
    I_JS_SetMusicVolume, I_JS_PauseSong,
    I_JS_ResumeSong,     I_JS_RegisterSong,
    I_JS_UnRegisterSong, I_JS_PlaySong,
    I_JS_StopSong,       I_JS_MusicIsPlaying,
    I_JS_PollMusic,
};
