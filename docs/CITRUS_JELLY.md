# Citrus Jelly

> Original Citrus demo guide and historical HTTPS preview session. Temporary certificates, addresses and verification observations below are not a current service guarantee. See [Current state](CURRENT_STATE.md) for the repository overview. Commands run from the repository root.

A self-contained interactive citrus material study. Native WebGPU and WGSL render the scene; JavaScript runs a volumetric XPBD soft-body simulation. No framework, package installation, downloaded models, image assets, or API keys are required.

## Run

From this folder:

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open <http://127.0.0.1:5173> in a WebGPU-capable browser. Serve over localhost or HTTPS. The page displays an explanation if WebGPU is unavailable.

To serve only the demo on the local network, use your computer's current network IP:

```sh
python3 serve_demo.py --host 192.168.1.38 --port 5173
```

This server exposes only `/` and `/index.html`. It rejects requests for other project files. Devices on the same network can load the page at `http://192.168.1.38:5173`. WebGPU requires HTTPS when accessed through a network IP, so this HTTP network preview displays the fallback on those devices. The localhost preview can run WebGPU. The network IP can change.

### iPhone HTTPS preview

For the current preview session, HTTPS is available at `https://192.168.1.38:8443`. In Safari on an iPhone with iOS 26 or later:

1. Download `http://192.168.1.38:5173/citrus-local-ca.cer`.
2. Install the **Citrus Jelly Local Preview** certificate under **Settings → General → VPN & Device Management** (or **Profile Downloaded**).
3. Enable trust for that certificate under **Settings → General → About → Certificate Trust Settings**.
4. Open `https://192.168.1.38:8443` in Safari.

Trusting this certificate adds a local issuer to the phone's trusted certificate list. Remove the certificate profile after testing. The issuer signing key was deleted after creating the server certificate. The server certificate lasts seven days. Private keys are outside this project and cannot be downloaded through the demo server. No certificate trust setting on the Mac was changed.

Public issuer SHA-256 fingerprint:

```text
E4:A7:C3:DC:A3:3C:6D:61:DD:52:8B:77:12:82:AD:4C:83:97:94:9F:BD:46:05:13:3E:36:93:42:8C:B6:7E:71
```

The server supports `--cert`, `--key`, and optional `--ca-cert` arguments. Certificate and key files for this session are in `/private/tmp/citrus-jelly-tls-2cbaudk1`. These temporary files may be removed by the operating system. A new server certificate requires generating a new local issuer and installing its public certificate again.

## Play

- Drag the flesh to pull, lift, and stretch it. Release to let it wobble.
- Drag empty space to orbit; use the mouse wheel to zoom.
- Choose Orange, Lemon, or Ruby, and adjust firmness and internal damping.
- Use Nudge, Reset, Pause, quarter speed, and mesh display to explore the simulation.
- Keyboard: **N** nudges, **R** resets, **Space** pauses. Sliders support arrow keys.
- Reduced-motion preferences start the simulation paused; press Resume to play.

## Implementation

Everything needed by the browser lives in `index.html`. The procedural lattice has 995 nodes, 4,224 tetrahedra, and a watertight surface of 1,056 triangles. The fixed physics timestep is 1/120 second, with five constraint iterations. A firmer rind, volume constraints, mild shape matching, floor collision, bounded dragging, and recovery from excessive stretches keep the object stable. The camera gently follows the specimen after release.

The renderer uses a depth shadow pass, a floor/background pass, and a surface pass with screen-space refraction, Fresnel highlights, approximate thickness absorption, and procedural citrus membranes and pulp. Optics and physical readings are illustrative, not calibrated. Readings use a nominal mass of 420 g and 1 scene unit = 10 cm. Physics runs on the CPU; rendering runs on the GPU.

Inspired by the [Citrus Jelly prompt](https://github.com/TripoGrowthLab/awesome-astra-prompts#2103062348168618280). This is an original procedural implementation, not copied showcase code.

## Verify

With Node.js installed:

```sh
node tests/physics.mjs
node tests/fallback.mjs
```

The physics test exercises the actual solver embedded in the HTML: watertight topology, floor collision, finite positions, element inversion, volume preservation, repeated dragging and release across extreme settings, and settling after nudges. The fallback test checks unsupported WebGPU behavior and the reduced-motion starting state. Browser verification covered native shader compilation, rendering, presets, sliders, pause/resume, mesh display, slow motion, dragging, and desktop/narrow layouts.

## Second demo: digital watch

Open [SECOND / Watch Lab](http://127.0.0.1:5173/watch/) or use `https://192.168.1.38:8443/watch/` on the local network. This demo uses the CC0 Poly Haven watch, a Blender-edited GLB, Three.js, and WebGPU with WebGL2 fallback. It includes editable branding and face text, live time, physical button clicks, time adjustment, stopwatch, backlight, and finishes. See [Watch Lab](watch/README.md) for source assets, controls, rebuild commands, and verification.

`serve_demo.py` now serves both demos and the watch's explicit public HTML/CSS/JS/GLB files. Blender source files, other project files, and keys remain unavailable on the network.
