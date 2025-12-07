#!/bin/bash
# Build DOOM for OpenTUI using doomgeneric and Emscripten

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOOM_DIR="$PROJECT_ROOT/doom"
BUILD_DIR="$PROJECT_ROOT/doom/build"

echo "=== DOOM OpenTUI Build Script ==="

# Check for emcc
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten (emcc) not found!"
    echo "Please install Emscripten SDK from https://emscripten.org/docs/getting_started/downloads.html"
    echo ""
    echo "Quick install:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Clone doomgeneric if not present
if [ ! -d "$DOOM_DIR/doomgeneric" ]; then
    echo "Cloning doomgeneric..."
    cd "$DOOM_DIR"
    git clone https://github.com/ozkl/doomgeneric.git
fi

# Create build directory
mkdir -p "$BUILD_DIR"

# Copy our platform file and sound bridge
cp "$DOOM_DIR/doomgeneric_opentui.c" "$DOOM_DIR/doomgeneric/doomgeneric/"
cp "$DOOM_DIR/doom_js_sound_bridge.c" "$DOOM_DIR/doomgeneric/doomgeneric/"

echo "Compiling DOOM to WebAssembly..."
cd "$DOOM_DIR/doomgeneric/doomgeneric"

# Compile with Emscripten
emcc -O2 \
    -s WASM=1 \
    -s USE_SDL=2 \
    -s EXPORTED_FUNCTIONS="['_doomgeneric_Create','_doomgeneric_Tick','_DG_GetFrameBuffer','_DG_PushKeyEvent','_malloc','_free']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','getValue','setValue']" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=33554432 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="createDoomModule" \
    -s ENVIRONMENT='node' \
    -s FILESYSTEM=1 \
    -s FORCE_FILESYSTEM=1 \
    -s EXIT_RUNTIME=0 \
    -s NO_EXIT_RUNTIME=1 \
    -DDOOMGENERIC_RESX=1280 \
    -DDOOMGENERIC_RESY=800 \
    -DFEATURE_SOUND \
    -I. \
    am_map.c \
    d_event.c \
    d_items.c \
    d_iwad.c \
    d_loop.c \
    d_main.c \
    d_mode.c \
    d_net.c \
    doomdef.c \
    doomgeneric.c \
    doomgeneric_opentui.c \
    doomstat.c \
    dstrings.c \
    f_finale.c \
    f_wipe.c \
    g_game.c \
    hu_lib.c \
    hu_stuff.c \
    i_cdmus.c \
    i_input.c \
    i_endoom.c \
    i_joystick.c \
    i_scale.c \
    i_sound.c \
    i_system.c \
    i_timer.c \
    i_video.c \
    icon.c \
    info.c \
    m_argv.c \
    m_bbox.c \
    m_cheat.c \
    m_config.c \
    m_controls.c \
    m_fixed.c \
    m_menu.c \
    m_misc.c \
    m_random.c \
    memio.c \
    p_ceilng.c \
    p_doors.c \
    p_enemy.c \
    p_floor.c \
    p_inter.c \
    p_lights.c \
    p_map.c \
    p_maputl.c \
    p_mobj.c \
    p_plats.c \
    p_pspr.c \
    p_saveg.c \
    p_setup.c \
    p_sight.c \
    p_spec.c \
    p_switch.c \
    p_telept.c \
    p_tick.c \
    p_user.c \
    r_bsp.c \
    r_data.c \
    r_draw.c \
    r_main.c \
    r_plane.c \
    r_segs.c \
    r_sky.c \
    r_things.c \
    s_sound.c \
    sha1.c \
    sounds.c \
    st_lib.c \
    st_stuff.c \
    statdump.c \
    tables.c \
    v_video.c \
    w_checksum.c \
    w_file.c \
    w_file_stdc.c \
    w_main.c \
    w_wad.c \
    wi_stuff.c \
    z_zone.c \
    dummy.c \
    doom_js_sound_bridge.c \
    -o "$BUILD_DIR/doom.js"

echo "Build complete!"
echo "Output: $BUILD_DIR/doom.js and $BUILD_DIR/doom.wasm"
