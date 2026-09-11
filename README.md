# 260925_threejs_gaussian_splatting

Demo for the ICS MEDIA article on 3D Gaussian Splatting with Three.js r186: a sushi captured with a smartphone is summoned from a magic circle.

- Live demo: https://ics-creative.github.io/260925_threejs_gaussian_splatting/
- Press **Summon** to play the effect again. **Load .spz** (or drag and drop) shows your own `.spz` file, and **Flip** turns it upside down when the export orientation differs. Files are parsed in the browser and never uploaded.
- Add `?auto` to the URL to start the summon on load.

## How it works

- `GaussianSplat` and `SPZLoader` from Three.js r186 render the splats with the WebGPU renderer. Browsers without WebGPU fall back to WebGL2.
- The reveal effect compares each splat's world height with a moving cut plane in the material's `colorNode`, so the subject rises out of the circle with a glowing edge (`src/subject.ts`).
- Everything else is ordinary Three.js: the magic circle and rune bands are canvas textures (`src/magicCircle.ts`), the lightning, particles and light pillar live in `src/effects/`, and the summon sequence is a small state machine (`src/summon.ts`).

## Source layout

```
src/
  main.ts            renderer, scene, camera and the frame loop
  subject.ts         fits the loaded splats into the circle and adds the reveal effect
  magicCircle.ts     three-layer magic circle and floating rune bands
  summon.ts          idle / summon / shown / dismiss sequence
  effects/           lightning, particles, light pillar, shock wave, flash
  ui.ts              buttons, file loading, drag and drop, language switch
  textures.ts        shared canvas textures
  types/             type declarations for r186 features not yet in @types/three
```

## Development

```
npm install
npm run dev
```

`npm run build` type-checks with `tsc` and bundles with Vite into `dist/`. Pushes to `main` deploy `dist/` to GitHub Pages through the workflow in `.github/workflows/`.

## License

MIT License / ICS INC.

The sushi model in `public/models/` was captured by the author with Scaniverse and cleaned up in SuperSplat.
