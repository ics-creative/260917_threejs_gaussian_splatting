# 260917_threejs_gaussian_splatting

Demo for the ICS MEDIA article on 3D Gaussian Splatting with Three.js r186: a plate of spaghetti captured with a smartphone is summoned from an RPG-style save point.

- Live demo: https://ics-creative.github.io/260917_threejs_gaussian_splatting/
- The summon plays once the model has loaded. Press **Summon** to play it again. **Load .spz** (or drag and drop) shows your own `.spz` file, and **Flip** turns it upside down when the export orientation differs. Files are parsed in the browser and never uploaded.
- `basic.html` is the minimal viewer from the article: load a `.spz`, add it to the scene, fit the camera. Nothing else.

## How it works

The save point (magic circle, light pillar, swirl and particles) is the code from the ICS MEDIA article [エフェクト作成入門講座 Three.js編 RPGのセーブポイント風の魔法陣](https://ics.media/entry/11401/) ([ics-creative/160304_threejs_save_point](https://github.com/ics-creative/160304_threejs_save_point)), used as-is. This demo adds the splat subject on top of it.

- `GaussianSplat` and `SPZLoader` from Three.js r186 render the splats with the WebGPU renderer. Browsers without WebGPU fall back to WebGL2.
- `src/objects/Subject.ts` fits the loaded splats into the circle and adds the reveal effect: the material's `colorNode` compares each splat's world height with a moving cut plane, so the subject rises out of the light pillar with a glowing edge.
- `src/objects/SavePoint.ts` gains a `summon()` timeline (GSAP) that charges the effects, fires lightning (`src/effects/Lightning.ts`), raises the subject and sinks the pillar.
- Bloom is selective: the save point effects declare `mrtNode = mrt({ bloomIntensity: 1 })`, the splats only bloom along the cut edge, so the captured colours stay as they were photographed.

## Source layout

```
src/
  Main.ts            renderer, scene, camera, post-processing and the frame loop
  basic.ts           minimal viewer for basic.html (no effects)
  objects/
    SavePoint.ts     save point effects and the summon sequence
    Subject.ts       fits the loaded splats into the circle and adds the reveal effect
    Floor.ts         tiled floor
  effects/           magic circle, light pillar, swirl (from the save point demo) and Lightning.ts
  particles/         floating and wave particles (from the save point demo)
  img/               textures for the effects (from the save point demo)
  ui.ts              buttons, file loading, drag and drop, loading indicator
  types/             type declaration for GaussianSplat internals used by the reveal effect
```

## Development

```
npm install
npm run dev
```

`npm run build` type-checks with `tsc` and bundles with Vite into `dist/`. Pushes to `main` deploy `dist/` to GitHub Pages through the workflow in `.github/workflows/`.

## License

MIT License / ICS INC.

The spaghetti model in `public/models/` was captured by the author with Scaniverse and cleaned up in SuperSplat.
