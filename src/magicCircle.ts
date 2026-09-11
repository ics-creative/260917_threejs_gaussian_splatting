import * as THREE from "three/webgpu";
import { canvasTexture, seeded } from "./textures.ts";

type LayerKind = "outer" | "mid" | "inner";

type LayerMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

interface RuneBand {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  pivot: THREE.Group;
}

const CIRCLE_SIZE = 2.6;

// 魔法陣の 1 層ぶんを Canvas に描く。記号の細部は種付き乱数で毎回同じ形にする
function layerTexture(kind: LayerKind, size = 1024): THREE.CanvasTexture {
  const texture = canvasTexture(size, size, (ctx) => {
    const cx = size / 2;
    const R = size / 2;
    const rand = seeded(kind === "outer" ? 7 : 13);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    const ring = (r: number, w: number) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(cx, cx, r * R, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (kind === "outer") {
      ring(0.985, 3);
      ring(0.96, 7);
      ring(0.91, 2);
      ring(0.8, 2);
      ring(0.77, 5);
      // 最外周に等間隔の小さな菱形
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.save();
        ctx.translate(
          cx + Math.cos(a) * 0.935 * R,
          cx + Math.sin(a) * 0.935 * R,
        );
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-9, 0);
        ctx.lineTo(0, -5);
        ctx.lineTo(9, 0);
        ctx.lineTo(0, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // 外周の目盛り
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const long = i % 8 === 0;
        const inner = long ? 0.86 : 0.885;
        ctx.lineWidth = long ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 0.91 * R, cx + Math.sin(a) * 0.91 * R);
        ctx.lineTo(cx + Math.cos(a) * inner * R, cx + Math.sin(a) * inner * R);
        ctx.stroke();
      }
      // 文字帯。短い画の組み合わせでルーン風の記号を並べる
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const r = 0.845 * R;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
        ctx.rotate(a + Math.PI / 2);
        ctx.lineWidth = 2.2;
        const strokes = 2 + Math.floor(rand() * 3);
        for (let s = 0; s < strokes; s++) {
          ctx.beginPath();
          ctx.moveTo((rand() - 0.5) * 14, (rand() - 0.5) * 22);
          ctx.lineTo((rand() - 0.5) * 14, (rand() - 0.5) * 22);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (kind === "mid") {
      ring(0.745, 2);
      ring(0.705, 1.5);
      // 2 つの正方形を 45 度ずらして重ねた八芒の格子
      for (let t = 0; t < 2; t++) {
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + (t ? Math.PI / 4 : 0);
          const x = cx + Math.cos(a) * 0.705 * R;
          const y = cx + Math.sin(a) * 0.705 * R;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // 12 個の小円と、その間をつなぐ弧の鎖
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(a) * 0.725 * R,
          cx + Math.sin(a) * 0.725 * R,
          0.022 * R,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cx, 0.68 * R, a + 0.08, a + Math.PI / 6 - 0.08);
        ctx.stroke();
      }
    } else {
      ring(0.66, 3);
      ring(0.62, 1.5);
      // 六芒星と頂点の小円
      for (let t = 0; t < 2; t++) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + (t ? Math.PI : 0) - Math.PI / 2;
          const x = cx + Math.cos(a) * 0.62 * R;
          const y = cx + Math.sin(a) * 0.62 * R;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(a) * 0.62 * R,
          cx + Math.sin(a) * 0.62 * R,
          0.045 * R,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ring(0.3, 2);
      ring(0.22, 4);
      // 中心の目印
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 0.05 * R, cx + Math.sin(a) * 0.05 * R);
        ctx.lineTo(cx + Math.cos(a) * 0.18 * R, cx + Math.sin(a) * 0.18 * R);
        ctx.stroke();
      }
    }
  });
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 空中に浮かぶ文字帯のテクスチャー。横に繰り返して輪にする
function runeBandTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(2048, 128, (ctx) => {
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    const rand = seeded(29);
    for (let i = 0; i < 64; i++) {
      ctx.save();
      ctx.translate(16 + i * 32, 64);
      const strokes = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < strokes; s++) {
        ctx.beginPath();
        ctx.moveTo((rand() - 0.5) * 18, (rand() - 0.5) * 60);
        ctx.lineTo((rand() - 0.5) * 18, (rand() - 0.5) * 60);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(2048, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 122);
    ctx.lineTo(2048, 122);
    ctx.stroke();
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function additiveMaterial(
  map: THREE.Texture,
  color: THREE.Color,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// 床に描く 3 層の魔法陣と、空中を回る 2 本の文字帯
export class MagicCircle {
  private readonly outer: LayerMesh;
  private readonly mid: LayerMesh;
  private readonly inner: LayerMesh;
  private readonly bandLow: RuneBand;
  private readonly bandHigh: RuneBand;

  constructor(scene: THREE.Scene, color: THREE.Color) {
    const geometry = new THREE.PlaneGeometry(CIRCLE_SIZE, CIRCLE_SIZE);
    const makeLayer = (kind: LayerKind, y: number): LayerMesh => {
      const mesh = new THREE.Mesh(
        geometry,
        additiveMaterial(layerTexture(kind), color),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      // 半透明の床面は被写体より先に描かないと被写体越しに透ける
      mesh.renderOrder = -1;
      scene.add(mesh);
      return mesh;
    };
    this.outer = makeLayer("outer", 0.006);
    this.mid = makeLayer("mid", 0.007);
    this.inner = makeLayer("inner", 0.008);

    const runeTexture = runeBandTexture();
    const makeBand = (
      radius: number,
      height: number,
      y: number,
      tilt: number,
    ): RuneBand => {
      const pivot = new THREE.Group();
      pivot.position.y = y;
      pivot.rotation.x = tilt;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
        additiveMaterial(runeTexture, color),
      );
      mesh.renderOrder = 1;
      pivot.add(mesh);
      scene.add(pivot);
      return { mesh, pivot };
    };
    this.bandLow = makeBand(1.12, 0.14, 0.32, 0);
    this.bandHigh = makeBand(0.78, 0.09, 1.25, 0.42);
  }

  // 上の帯は被写体の頭上に置く
  setBandHeight(y: number): void {
    this.bandHigh.pivot.position.y = y;
  }

  setScale(scale: number): void {
    for (const layer of [this.outer, this.mid, this.inner])
      layer.scale.setScalar(scale);
  }

  update(now: number, opacity: number, color: THREE.Color): void {
    const spin = now * 0.00025;
    this.outer.rotation.z = spin;
    this.inner.rotation.z = -spin * 1.6;
    for (const layer of [this.outer, this.mid, this.inner]) {
      layer.material.opacity = opacity;
      layer.material.color.copy(color);
    }
    this.bandLow.mesh.material.opacity = opacity * 0.8;
    this.bandHigh.mesh.material.opacity = opacity * 0.6;
    this.bandLow.mesh.material.color.copy(color);
    this.bandHigh.mesh.material.color.copy(color);
    this.bandLow.mesh.rotation.y = -now * 0.0006;
    this.bandHigh.mesh.rotation.y = now * 0.0011;
  }
}
