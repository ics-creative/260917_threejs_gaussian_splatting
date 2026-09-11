import * as THREE from "three/webgpu";
import { canvasTexture, dotTexture } from "../textures.ts";

const SEGMENTS = 32;
const BOLT_COUNT = 6;

// 帯の幅方向に明るさが落ちるグラデーション
const boltTexture = canvasTexture(64, 4, (ctx) => {
  const grad = ctx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgb(255 255 255 / 0)");
  grad.addColorStop(0.5, "rgb(255 255 255 / 1)");
  grad.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 4);
});

// カメラを向いた帯。折れ線の各点で視線と進行方向の外積を取り、幅を張る
class BoltRibbon {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly width: number;
  private readonly direction = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    width: number,
    color: THREE.ColorRepresentation,
    intensity: number,
  ) {
    this.width = width;
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
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: boltTexture,
        color: new THREE.Color(color).multiplyScalar(intensity),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  set opacity(value: number) {
    this.mesh.material.opacity = value;
  }

  // points は SEGMENTS + 1 個。taper で先端に向けて細くする
  build(
    points: THREE.Vector3[],
    cameraPosition: THREE.Vector3,
    taper: boolean,
  ): void {
    const attribute = this.mesh.geometry.getAttribute("position");
    const pos = attribute.array;
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = points[i];
      const next = points[Math.min(i + 1, SEGMENTS)];
      const prev = points[Math.max(i - 1, 0)];
      this.direction.subVectors(next, prev).normalize();
      this.view.subVectors(cameraPosition, p).normalize();
      this.side.crossVectors(this.direction, this.view).normalize();
      const w = this.width * (taper ? 1 - (i / SEGMENTS) * 0.6 : 1);
      pos[i * 6] = p.x - this.side.x * w;
      pos[i * 6 + 1] = p.y - this.side.y * w;
      pos[i * 6 + 2] = p.z - this.side.z * w;
      pos[i * 6 + 3] = p.x + this.side.x * w;
      pos[i * 6 + 4] = p.y + this.side.y * w;
      pos[i * 6 + 5] = p.z + this.side.z * w;
    }
    attribute.needsUpdate = true;
  }
}

// 中点変位で始点から終点までのギザギザを作る
function jaggedPath(
  from: THREE.Vector3,
  to: THREE.Vector3,
  amplitude: number,
): THREE.Vector3[] {
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

// 魔法陣の外周から被写体の切断面へ走る稲妻。芯（細く明るい）とにじみ（太く淡い）の 2 層で、短い寿命で明滅させる
export class Lightning {
  private readonly bolts: Bolt[] = [];
  private readonly camera: THREE.Camera;
  private readonly cameraPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.Camera, hotColor: THREE.Color) {
    this.camera = camera;
    for (let i = 0; i < BOLT_COUNT; i++) {
      const impact = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dotTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      impact.scale.setScalar(0.22);
      impact.renderOrder = 3;
      scene.add(impact);
      this.bolts.push({
        core: new BoltRibbon(scene, 0.008, 0xffffff, 3.5),
        halo: new BoltRibbon(scene, 0.035, hotColor, 1.2),
        branch: new BoltRibbon(scene, 0.005, hotColor, 2.2),
        impact,
        startedAt: -1,
        life: 0,
        hasBranch: false,
        points: [],
        branchPoints: [],
      });
    }
  }

  private spawn(bolt: Bolt, topY: number, now: number): void {
    const a = Math.random() * Math.PI * 2;
    const r0 = 0.9 + Math.random() * 0.35;
    const from = new THREE.Vector3(Math.cos(a) * r0, 0.02, Math.sin(a) * r0);
    const a2 = a + (Math.random() - 0.5) * 1.4;
    const r1 = Math.random() * 0.32;
    const to = new THREE.Vector3(
      Math.cos(a2) * r1,
      Math.max(0.06, topY - Math.random() * 0.15),
      Math.sin(a2) * r1,
    );
    bolt.points = jaggedPath(from, to, 0.45);
    bolt.startedAt = now;
    bolt.life = 90 + Math.random() * 110;
    bolt.hasBranch = Math.random() < 0.6;
    if (bolt.hasBranch) {
      const k = 8 + Math.floor(Math.random() * 14);
      const end = bolt.points[k]
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0.15 + Math.random() * 0.35,
            (Math.random() - 0.5) * 0.5,
          ),
        );
      bolt.branchPoints = jaggedPath(bolt.points[k], end, 0.2);
    }
    bolt.impact.position.copy(to);
  }

  private hide(bolt: Bolt): void {
    bolt.core.opacity = 0;
    bolt.halo.opacity = 0;
    bolt.branch.opacity = 0;
    bolt.impact.material.opacity = 0;
  }

  // topY は稲妻の着弾する高さ。strength が高いほど次の稲妻までの間隔が短い
  update(now: number, topY: number, strength: number): void {
    this.camera.getWorldPosition(this.cameraPosition);
    for (const bolt of this.bolts) {
      const age = now - bolt.startedAt;
      if (bolt.startedAt < 0 || age > bolt.life) {
        if (Math.random() < 0.08 * strength) {
          this.spawn(bolt, topY, now);
        } else {
          this.hide(bolt);
          continue;
        }
      }
      const t = (now - bolt.startedAt) / bolt.life;
      // 立ち上がりは速く、消えるときは揺らぎながら減衰
      const envelope =
        (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) *
        (0.75 + Math.random() * 0.25) *
        strength;
      bolt.core.build(bolt.points, this.cameraPosition, false);
      bolt.halo.build(bolt.points, this.cameraPosition, false);
      bolt.core.opacity = envelope;
      bolt.halo.opacity = envelope * 0.7;
      if (bolt.hasBranch) {
        bolt.branch.build(bolt.branchPoints, this.cameraPosition, true);
        bolt.branch.opacity = envelope * 0.8;
      } else {
        bolt.branch.opacity = 0;
      }
      bolt.impact.material.opacity = envelope;
      bolt.impact.scale.setScalar(0.16 + envelope * 0.18);
    }
  }

  clear(): void {
    for (const bolt of this.bolts) {
      bolt.startedAt = -1;
      this.hide(bolt);
    }
  }
}
