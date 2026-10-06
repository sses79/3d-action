# SECOND / Watch Lab

Documentation location: `docs/watch/README.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `watch/`.

An interactive Three.js watch, built from the CC0 Digital Wrist Watch by Adrian C / Poly Haven. The model was edited and exported with Blender 4.5.9 LTS. WebGPU renders the scene when available; Three.js falls back to WebGL2.

## Open

- Mac: http://127.0.0.1:5173/watch/
- Local network / iPhone: https://192.168.1.38:8443/watch/

The existing local certificate setup also applies to this demo. The network IP can change. The LAN server serves only explicit public demo files. It does not expose Blender sources, npm files, or private keys.

If no server is running, use `python3 serve_demo.py` from the project root. This serves both demos on localhost:5173. Use the HTTPS arguments in the project README for network WebGPU access.

## Controls

Drag to rotate. Scroll or pinch to zoom. Face and Full watch change the framing. Auto rotate is optional.

Click/tap the physical side buttons, or use the corresponding panel controls:

- LIGHT (upper left): toggle backlight.
- MODE (lower left): switch between clock and stopwatch. While setting time, select hours or minutes.
- ADJUST (right): enter settings, then add one to the selected value. In stopwatch mode, start or stop.
- Done: save time, with seconds reset to zero.
- Sync to device: discard the custom offset and use the device's local time.
- Reset stopwatch: stop and clear the timer.

Keyboard: L / M / A activate the buttons. Enter saves time when not typing in an input.

Brand, face inscription, finish, time offset, and 12/24-hour preference are saved locally in this browser. The custom time does not change the device clock. The stopwatch uses monotonic elapsed time and continues when switching back to the clock. It resets on reload.

## Assets and license

Source: https://polyhaven.com/a/digital_wrist_watch

License: CC0 1.0, https://polyhaven.com/license

Original artist: Adrian C. Credit is included as a courtesy. The watch's original model branding and fixed display were replaced with our custom face. No endorsement is implied.

- `source/digital_wrist_watch.blend`: original Blender model, with its original external textures in `source/textures/`.
- `source/second-watch.blend`: edited Blender scene with all three textures packed, separate buttons, a complete face surface, studio lights, a camera, and a START HERE text block.
- `assets/watch.glb`: final self-contained browser model, approximately 2.17 MB, including textures.
- `source/files.json`: published asset metadata and download checksums.
- `source/THREE-LICENSE.txt`: MIT license for bundled Three.js.

The runtime face is a canvas texture with seven-segment digits. It is supplied by JavaScript after loading the GLB. Blender shows a plain dark face surface. Button movement and watch behavior are JavaScript animations and state, not built into the GLB. The display is an illustrative LCD appearance.

## Rebuild

From the project root:

```sh
npm ci
npm run build
npm test
python3 tests/server.py
```

`main.js` contains scene and UI code. `state.js` contains time-setting and stopwatch behavior. The shipped `app.js` bundle works without a CDN, account, API key, or npm on the viewing device.

To reproduce asset preparation:

```sh
python3 watch/prepare_asset.py
blender --background --factory-startup --python watch/prepare_blender.py
npm run build
```

The preparation script separates components without changing the original case/bracelet shape. The Blender script fills the face opening, creates editable UVs, packs textures, saves the source scene, and exports only model meshes. The studio lights and camera stay in the Blender scene and are excluded from GLB. Blender was run from an official temporary portable runtime; it was not installed system-wide.

## Verification

Seven automated checks cover clock rollover, editing and time commit, sync, monotonic stopwatch pause/resume, saved preferences, source mesh indices/dependencies, and the final self-contained GLB. The server test checks public routes and rejection of private/source paths. The saved Blender scene was reopened to verify packed images and button objects.

Browser checks cover WebGPU rendering and the HTTP network preview’s WebGL2 fallback, physical button picking, live face, time adjustment, stopwatch, backlight, customization, preference persistence, full-watch view, and a narrow phone viewport. A physical iPhone test of this new demo has not been performed.
