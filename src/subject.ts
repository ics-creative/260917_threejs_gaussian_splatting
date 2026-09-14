import * as THREE from "three/webgpu";
import {
  float,
  hash,
  instanceIndex,
  mix,
  modelWorldMatrix,
  smoothstep,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import { GaussianSplat } from "three/addons/objects/GaussianSplat.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

export interface SubjectOptions {
  // X 軸まわりの回転（度）
  rx: number;
  // 表示する高さと幅の上限（m）。両方に収まる縮尺にする
  height: number;
  widthMax: number;
}

// 切断面の光る縁の厚み
const EDGE = 0.05;
// 被写体の底を置く高さ。魔法陣のわずかに上
const Y_BOTTOM = 0.02;

const percentile = (sorted: ArrayLike<number>, q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

// 召喚される被写体。読み込んだ粒を魔法陣の中央に合わせ、下から上へ現れる演出を材質に組み込む
export class Subject {
  readonly reveal = uniform(0);
  private readonly scene: THREE.Scene;
  private readonly glowColor: THREE.Color;
  // 被写体の奥にある帯や柱が透けて手前に出ないよう、凸包の背面だけを深度に書く。
  // 出現途中は切断面より上をクリップして、まだ見えていない部分の帯が欠けないようにする
  private readonly cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private root: THREE.Group | null = null;
  private current: {
    geometry: THREE.BufferGeometry;
    options: SubjectOptions;
  } | null = null;
  private objectHeight = 1;

  constructor(scene: THREE.Scene, glowColor: THREE.Color) {
    this.scene = scene;
    this.glowColor = glowColor;
  }

  // 実際の表示高さ。演出の高さはこれに連動させる
  get height(): number {
    return this.objectHeight;
  }

  get geometry(): THREE.BufferGeometry | null {
    return this.current?.geometry ?? null;
  }

  get options(): SubjectOptions | null {
    return this.current?.options ?? null;
  }

  // 切断面のワールド高さ。稲妻の着弾点に使う
  get cutHeight(): number {
    return Y_BOTTOM + this.reveal.value * this.objectHeight;
  }

  // 出現率 0〜1。切断面より下の粒だけが見える。1 のとき切断面は上端より縁の厚み（ノイズ込み）以上に高く、白い縁が残らない
  setReveal(value: number): void {
    this.reveal.value = value;
    this.cutPlane.constant =
      Y_BOTTOM - EDGE * 2 + value * (this.objectHeight + EDGE * 6);
  }

  // 寸法の決め方: 高さは 0.5%〜99.5% 点の範囲、幅は中心からの距離の 99% 点で測り、
  // 高さと幅の両方の上限に収まる縮尺にして魔法陣の中央に置く
  set(geometry: THREE.BufferGeometry, options: SubjectOptions): void {
    this.dispose();
    this.current = { geometry, options };
    const root = new THREE.Group();
    const splat = new GaussianSplat(geometry);
    splat.rotation.x = (options.rx * Math.PI) / 180;
    const rotation = new THREE.Matrix4().makeRotationFromEuler(splat.rotation);
    const source = geometry.getAttribute("position");
    const count = source.count;
    const v = new THREE.Vector3();
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const zs = new Float32Array(count);
    let meanX = 0;
    let meanZ = 0;
    for (let i = 0; i < count; i++) {
      v.set(source.getX(i), source.getY(i), source.getZ(i)).applyMatrix4(
        rotation,
      );
      xs[i] = v.x;
      ys[i] = v.y;
      zs[i] = v.z;
      meanX += v.x;
      meanZ += v.z;
    }
    meanX /= count;
    meanZ /= count;
    const ySorted = Float32Array.from(ys).sort();
    const yLow = percentile(ySorted, 0.005);
    const yHigh = percentile(ySorted, 0.995);
    const rSorted = new Float32Array(count);
    for (let i = 0; i < count; i++)
      rSorted[i] = Math.hypot(xs[i] - meanX, zs[i] - meanZ);
    rSorted.sort();
    // 99% 点を使うのは、遠くに散った粒で幅が膨らむのを避けるため
    const widthLocal = 2 * percentile(rSorted, 0.99);
    const k = Math.min(
      options.height / (yHigh - yLow),
      options.widthMax / widthLocal,
    );
    splat.scale.setScalar(k);
    splat.position.set(-meanX * k, Y_BOTTOM - yLow * k, -meanZ * k);
    splat.updateMatrixWorld();
    this.objectHeight = (yHigh - yLow) * k;
    root.add(splat);

    // 深度プロキシ。上下の端に散った粒を含めると凸包が大きくなり黒い縁が出るので、中ほどの粒だけを使う
    const hullPoints: THREE.Vector3[] = [];
    const step = Math.max(1, Math.floor(count / 4000));
    for (let i = 0; i < count; i += step) {
      if (
        ys[i] < yLow + (yHigh - yLow) * 0.05 ||
        ys[i] > yHigh - (yHigh - yLow) * 0.05
      )
        continue;
      hullPoints.push(new THREE.Vector3(xs[i], ys[i], zs[i]));
    }
    if (hullPoints.length >= 4) {
      const hullGeometry = new ConvexGeometry(hullPoints);
      hullGeometry.computeBoundingBox();
      const center = hullGeometry.boundingBox!.getCenter(new THREE.Vector3());
      hullGeometry
        .translate(-center.x, -center.y, -center.z)
        .scale(0.9, 0.9, 0.9)
        .translate(center.x, center.y, center.z);
      const proxy = new THREE.Mesh(
        hullGeometry,
        new THREE.MeshBasicMaterial({
          colorWrite: false,
          side: THREE.BackSide,
        }),
      );
      proxy.position.copy(splat.position);
      proxy.scale.copy(splat.scale);
      proxy.renderOrder = -2;
      // WebGPURenderer のクリップは ClippingGroup 単位
      const clipGroup = new THREE.ClippingGroup();
      clipGroup.clippingPlanes = [this.cutPlane];
      clipGroup.add(proxy);
      root.add(clipGroup);
    }

    // 出現の演出。粒ごとのワールド高さを頂点ステージで求め、切断面より上をアルファ 0 にする。
    // 切断面のすぐ下は白く光らせて輪郭にする
    const cut = float(Y_BOTTOM - EDGE * 2).add(
      this.reveal.mul(this.objectHeight + EDGE * 6),
    );
    const splatIndex = splat._sort.orderRead.element(instanceIndex);
    const center = splat._buffers.centerRead.element(splatIndex).xyz;
    const worldPosition = modelWorldMatrix.mul(vec4(center, 1));
    const worldY = varying(worldPosition.y);
    const noise = varying(hash(splatIndex));
    const floorMask = varying(
      smoothstep(Y_BOTTOM - 0.01, Y_BOTTOM + 0.005, worldPosition.y),
    );
    const depth = cut.sub(worldY).sub(noise.mul(EDGE * 1.5));
    const mask = smoothstep(-0.004, 0.004, depth).mul(floorMask);
    const edge = float(1)
      .sub(smoothstep(0, EDGE, depth))
      .mul(mask);
    // GaussianSplat の colorNode は色と不透明度を持つ vec4
    const base = splat.material.colorNode as THREE.Node<"vec4"> | null;
    if (!base) throw new Error("GaussianSplat has no colorNode");
    const glow = vec3(this.glowColor.r, this.glowColor.g, this.glowColor.b).mul(
      1.7,
    );
    splat.material.colorNode = vec4(
      mix(base.rgb, glow, edge.mul(0.6)),
      base.a.mul(mask),
    );
    // 深度プロキシは帯や柱を隠すためのもので、被写体自身の粒まで隠してはいけない。
    // 皿の内側のように凸包の底より低い面は深度判定で消えるので、粒は深度判定を受けない
    splat.material.depthTest = false;
    splat.material.needsUpdate = true;

    this.scene.add(root);
    this.root = root;
    this.setReveal(this.reveal.value);
  }

  // r186 の GaussianSplat に dispose はないので、geometry と material を個別に解放する
  private dispose(): void {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials: THREE.Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.root = null;
  }
}
