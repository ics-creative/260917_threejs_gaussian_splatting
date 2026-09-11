import * as THREE from "three/webgpu";

// 種を固定した乱数。魔法陣の記号を毎回同じ形にするために使う
export function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context is not available");
  draw(ctx);
  return new THREE.CanvasTexture(canvas);
}

// 中心が明るく縁で消える白い丸。stops は [位置, 不透明度]
export function radialTexture(
  size: number,
  stops: [number, number][],
): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx) => {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [t, alpha] of stops) {
      grad.addColorStop(t, `rgb(255 255 255 / ${alpha})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}

// 芯のはっきりした光点。稲妻の着弾と閃光に使う
export const dotTexture = radialTexture(64, [
  [0, 1],
  [0.3, 0.6],
  [1, 0],
]);

// ぼかしの強い光点。漂う粒子に使う
export const softTexture = radialTexture(128, [
  [0, 0.9],
  [0.25, 0.45],
  [0.6, 0.1],
  [1, 0],
]);
