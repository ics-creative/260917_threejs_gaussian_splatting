import * as THREE from "three/webgpu";
import imageOrb from "../img/ball.png";

const SEGMENTS = 32;
const BOLT_COUNT = 6;

/** 帯の幅方向に明るさが落ちるグラデーションです。 */
function createBoltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgb(255 255 255 / 0)");
  grad.addColorStop(0.5, "rgb(255 255 255 / 1)");
  grad.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 4);
  return new THREE.CanvasTexture(canvas);
}

/** カメラを向いた帯です。折れ線の各点で視線と進行方向の外積を取り、幅を張ります。 */
class BoltRibbon extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial
> {
  private readonly _width: number;
  private readonly _direction = new THREE.Vector3();
  private readonly _view = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();

  constructor(
    texture: THREE.Texture,
    width: number,
    color: THREE.ColorRepresentation,
    intensity: number,
  ) {
    const vertexCount = (SEGMENTS + 1) * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
    );
    const uv = new Float32Array(vertexCount * 2);
    for (let i = 0; i <= SEGMENTS; i++) {
      uv[i * 4] = 0;
      uv[i * 4 + 1] = i / SEGMENTS;
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = i / SEGMENTS;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    super(
      geometry,
      new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(color).multiplyScalar(intensity),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this._width = width;
    this.renderOrder = 2;
    // 頂点を毎フレーム書き換えるのでバウンディングボックスが追従しない
    this.frustumCulled = false;
  }

  /** 折れ線に沿って帯を張り直します。taperで先端に向けて細くします。 */
  build(
    points: THREE.Vector3[],
    cameraPosition: THREE.Vector3,
    taper: boolean,
  ) {
    const attribute = this.geometry.getAttribute("position");
    const pos = attribute.array;
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = points[i];
      const next = points[Math.min(i + 1, SEGMENTS)];
      const prev = points[Math.max(i - 1, 0)];
      this._direction.subVectors(next, prev).normalize();
      this._view.subVectors(cameraPosition, p).normalize();
      this._side.crossVectors(this._direction, this._view).normalize();
      const w = this._width * (taper ? 1 - (i / SEGMENTS) * 0.6 : 1);
      pos[i * 6] = p.x - this._side.x * w;
      pos[i * 6 + 1] = p.y - this._side.y * w;
      pos[i * 6 + 2] = p.z - this._side.z * w;
      pos[i * 6 + 3] = p.x + this._side.x * w;
      pos[i * 6 + 4] = p.y + this._side.y * w;
      pos[i * 6 + 5] = p.z + this._side.z * w;
    }
    attribute.needsUpdate = true;
  }
}

/** 中点変位で始点から終点までのギザギザを作ります。 */
function jaggedPath(from: THREE.Vector3, to: THREE.Vector3, amplitude: number) {
  const points = new Array<THREE.Vector3>(SEGMENTS + 1);
  points[0] = from.clone();
  points[SEGMENTS] = to.clone();
  const subdivide = (a: number, b: number, offset: number) => {
    if (b - a < 2) return;
    const m = (a + b) >> 1;
    const mid = points[a].clone().add(points[b]).multiplyScalar(0.5);
    mid.x += (Math.random() - 0.5) * offset;
    mid.y += (Math.random() - 0.5) * offset * 0.6;
    mid.z += (Math.random() - 0.5) * offset;
    points[m] = mid;
    subdivide(a, m, offset * 0.55);
    subdivide(m, b, offset * 0.55);
  };
  subdivide(0, SEGMENTS, amplitude);
  return points;
}

interface Bolt {
  core: BoltRibbon;
  halo: BoltRibbon;
  branch: BoltRibbon;
  impact: THREE.Sprite;
  startedAt: number;
  life: number;
  hasBranch: boolean;
  points: THREE.Vector3[];
  branchPoints: THREE.Vector3[];
}

/** 魔法陣の外周から被写体の切断面へ走る稲妻です。芯（細く明るい）とにじみ（太く淡い）の2層で、短い寿命で明滅させます。 */
export default class Lightning extends THREE.Object3D {
  private readonly _bolts: Bolt[] = [];
  private readonly _cameraPosition = new THREE.Vector3();

  constructor(color: THREE.ColorRepresentation) {
    super();
    const boltTexture = createBoltTexture();
    const orbTexture = new THREE.TextureLoader().load(imageOrb);
    orbTexture.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < BOLT_COUNT; i++) {
      const impact = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: orbTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      impact.scale.setScalar(0.6);
      impact.renderOrder = 3;
      const bolt: Bolt = {
        core: new BoltRibbon(boltTexture, 0.025, 0xffffff, 3.5),
        halo: new BoltRibbon(boltTexture, 0.1, color, 1.2),
        branch: new BoltRibbon(boltTexture, 0.015, color, 2.2),
        impact,
        startedAt: -1,
        life: 0,
        hasBranch: false,
        points: [],
        branchPoints: [],
      };
      this.add(bolt.core, bolt.halo, bolt.branch, impact);
      this._bolts.push(bolt);
    }
  }

  /** 魔法陣の外周から高さtopYの着弾点へ向かう稲妻を1本作ります。 */
  private _spawn(bolt: Bolt, topY: number, now: number) {
    const a = Math.random() * Math.PI * 2;
    const r0 = 2.6 + Math.random() * 0.9;
    const from = new THREE.Vector3(Math.cos(a) * r0, 0.12, Math.sin(a) * r0);
    const a2 = a + (Math.random() - 0.5) * 1.4;
    const r1 = Math.random() * 0.9;
    const to = new THREE.Vector3(
      Math.cos(a2) * r1,
      Math.max(0.2, topY - Math.random() * 0.4),
      Math.sin(a2) * r1,
    );
    bolt.points = jaggedPath(from, to, 1.2);
    bolt.startedAt = now;
    bolt.life = 90 + Math.random() * 110;
    bolt.hasBranch = Math.random() < 0.6;
    if (bolt.hasBranch) {
      const k = 8 + Math.floor(Math.random() * 14);
      const end = bolt.points[k]
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            0.4 + Math.random() * 1,
            (Math.random() - 0.5) * 1.5,
          ),
        );
      bolt.branchPoints = jaggedPath(bolt.points[k], end, 0.6);
    }
    bolt.impact.position.copy(to);
  }

  private _hide(bolt: Bolt) {
    bolt.core.material.opacity = 0;
    bolt.halo.material.opacity = 0;
    bolt.branch.material.opacity = 0;
    bolt.impact.material.opacity = 0;
  }

  /** 稲妻を更新します。topYは着弾する高さ、strengthが高いほど次の稲妻までの間隔が短くなります。 */
  update(camera: THREE.Camera, topY: number, strength: number) {
    if (strength <= 0) {
      this.stop();
      return;
    }
    const now = performance.now();
    camera.getWorldPosition(this._cameraPosition);
    for (const bolt of this._bolts) {
      const age = now - bolt.startedAt;
      if (bolt.startedAt < 0 || age > bolt.life) {
        if (Math.random() < 0.08 * strength) {
          this._spawn(bolt, topY, now);
        } else {
          this._hide(bolt);
          continue;
        }
      }
      const t = (now - bolt.startedAt) / bolt.life;
      // 立ち上がりは速く、消えるときは揺らぎながら減衰
      const envelope =
        (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) *
        (0.75 + Math.random() * 0.25) *
        strength;
      bolt.core.build(bolt.points, this._cameraPosition, false);
      bolt.halo.build(bolt.points, this._cameraPosition, false);
      bolt.core.material.opacity = envelope;
      bolt.halo.material.opacity = envelope * 0.7;
      if (bolt.hasBranch) {
        bolt.branch.build(bolt.branchPoints, this._cameraPosition, true);
        bolt.branch.material.opacity = envelope * 0.8;
      } else {
        bolt.branch.material.opacity = 0;
      }
      bolt.impact.material.opacity = envelope;
      bolt.impact.scale.setScalar(0.45 + envelope * 0.5);
    }
  }

  /** すべての稲妻を消します。Object3Dのclear()と名前が重なるので別名にしている */
  stop() {
    for (const bolt of this._bolts) {
      bolt.startedAt = -1;
      this._hide(bolt);
    }
  }
}
