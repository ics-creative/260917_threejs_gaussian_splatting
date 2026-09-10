# 260925_threejs_gaussian_splatting

Demo for the ICS MEDIA article on 3D Gaussian Splatting with Three.js r186: a sushi captured with a smartphone is summoned from a magic circle.

- Live demo: https://ics-creative.github.io/260925_threejs_gaussian_splatting/
- Press **Summon** to play the effect again. **Load .spz** (or drag and drop) shows your own `.spz` file, and **Flip** turns it upside down when the export orientation differs. Files are parsed in the browser and never uploaded.
- Query parameters: `?lang=ja` switches the button label to Japanese, `?auto` starts the summon on load.

## How it works

- `GaussianSplat` and `SPZLoader` from Three.js r186 render the splats. Three.js (`three@0.186.0`) is bundled under `docs/vendor/` and resolved through an import map, so there is no build step and no CDN dependency.
- The reveal effect compares each splat's world height with a moving cut plane in the material's `colorNode`, so the subject rises out of the circle with a glowing edge.
- Everything else (magic circle, rune bands, lightning, particles, bloom) is ordinary Three.js drawn with the WebGPU renderer. Browsers without WebGPU fall back to WebGL2.

## Running locally

Serve `docs/` with any static server and open it.

```
npx serve docs
```

## License

MIT License / ICS INC.

The sushi model in `docs/models/` was captured by the author with Scaniverse and cleaned up in SuperSplat.
