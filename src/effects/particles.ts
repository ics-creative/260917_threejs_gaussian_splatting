import * as THREE from "three/webgpu";
import { softTexture } from "../textures.ts";

// WebGPU の Points は 1px でしか描けないので、カメラを向いた板を InstancedMesh で描く。
// 色に明るさを乗せ、加算合成で黒＝不可視として扱う
class SoftParticles {
  private readonly mesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly instanceColor: THREE.InstancedBufferAttribute;
  private readonly count: number;
  private readonly camera: THREE.Camera;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    count: number,
    map: THREE.Texture,
  ) {
    this.count = count;
    this.camera = camera;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      count,
    );
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++)
      this.mesh.setColorAt(i, this.color.setScalar(0));
    const instanceColor = this.mesh.instanceColor;
    if (!instanceColor) throw new Error("instanceColor is not initialized");
    this.instanceColor = instanceColor;
    scene.add(this.mesh);
  }

  begin(): void {
    this.camera.getWorldQuaternion(this.quaternion);
  }

  set(
    i: number,
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    g: number,
    b: number,
  ): void {
    this.position.set(x, y, z);
    this.scale.setScalar(size);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.setColorAt(i, this.color.setRGB(r, g, b));
  }

  end(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.count; i++)
      this.mesh.setColorAt(i, this.color.setScalar(0));
    this.instanceColor.needsUpdate = true;
  }
}

const RISING_COUNT = 150;

// 魔法陣から渦を巻きながら立ちのぼる粒子
export class RisingParticles {
  private readonly particles: SoftParticles;
  private readonly seeds: {
    x: number;
    z: number;
    t: number;
    size: number;
  }[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.particles = new SoftParticles(
      scene,
      camera,
      RISING_COUNT,
      softTexture,
    );
    for (let i = 0; i < RISING_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.6;
      this.seeds.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        t: Math.random(),
        size: 0.04 + Math.random() * 0.07,
      });
    }
  }

  update(
    now: number,
    amount: number,
    color: THREE.Color,
    subjectHeight: number,
  ): void {
    if (amount <= 0) {
      this.particles.clear();
      return;
    }
    this.particles.begin();
    for (let i = 0; i < RISING_COUNT; i++) {
      const seed = this.seeds[i];
      const life = (now * 0.00035 + seed.t) % 1;
      const swirl = now * 0.0008 + seed.t * 6.28;
      const r = 1 - life * 0.5;
      const x = (seed.x * Math.cos(swirl) - seed.z * Math.sin(swirl)) * r;
      const z = (seed.x * Math.sin(swirl) + seed.z * Math.cos(swirl)) * r;
      const b = amount * Math.sin(life * Math.PI) * 0.8;
      this.particles.set(
        i,
        x,
        life * (subjectHeight + 1.2),
        z,
        seed.size,
        color.r * b,
        color.g * b,
        color.b * b,
      );
    }
    this.particles.end();
  }
}

const DUST_COUNT = 150;

// 光の柱のまわりを漂う粒子。大きさは小・中・大の 3 段で、大きいものほど淡い
export class DustParticles {
  private readonly particles: SoftParticles;
  private readonly seeds: {
    a: number;
    r: number;
    y0: number;
    w: number;
    rise: number;
    phase: number;
    life: number;
    size: number;
    bright: number;
  }[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.particles = new SoftParticles(scene, camera, DUST_COUNT, softTexture);
    for (let i = 0; i < DUST_COUNT; i++) {
      const tier = i < 100 ? 0 : i < 138 ? 1 : 2;
      this.seeds.push({
        a: Math.random() * Math.PI * 2,
        r: 0.35 + Math.random() * 0.75,
        y0: 0.1 + Math.random() * 1.9,
        w: (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1),
        rise: 0.05 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        life: 0.6 + Math.random() * 0.8,
        size: [0.06, 0.15, 0.26][tier] * (0.8 + Math.random() * 0.4),
        bright: [1.0, 0.45, 0.18][tier],
      });
    }
  }

  update(
    now: number,
    amount: number,
    color: THREE.Color,
    subjectHeight: number,
  ): void {
    if (amount <= 0) {
      this.particles.clear();
      return;
    }
    const t = now * 0.001;
    const top = subjectHeight + 1.0;
    this.particles.begin();
    for (let i = 0; i < DUST_COUNT; i++) {
      const seed = this.seeds[i];
      const a = seed.a + t * seed.w;
      const y = 0.05 + ((seed.y0 + t * seed.rise) % top);
      // 呼吸するように明滅し、上端に近づくほど薄くなる
      const pulse = 0.55 + 0.45 * Math.sin(t * seed.life * 4 + seed.phase);
      const fade = Math.min(1, (top - y) * 1.5) * Math.min(1, y * 4);
      const b = amount * seed.bright * pulse * fade;
      this.particles.set(
        i,
        Math.cos(a) * seed.r,
        y,
        Math.sin(a) * seed.r,
        seed.size,
        color.r * b,
        color.g * b,
        color.b * b,
      );
    }
    this.particles.end();
  }
}
