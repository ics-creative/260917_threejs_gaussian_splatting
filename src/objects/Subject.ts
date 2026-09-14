import * as THREE from "three/webgpu";
import {
  float,
  hash,
  instanceIndex,
  mix,
  modelWorldMatrix,
  mrt,
  smoothstep,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { GaussianSplat } from "three/addons/objects/GaussianSplat.js";

export interface SubjectOptions {
  /** X軸まわりの回転（度）。書き出し元によって上下が反転していることがある */
  rx: number;
  /** 表示する高さと幅の上限。両方に収まる縮尺にする */
  height: number;
  widthMax: number;
}

/** 切断面の光る縁の厚みです。 */
const EDGE = 0.12;
/** 被写体の底を置く高さです。魔法陣のわずかに上に置きます。 */
const Y_BOTTOM = 0.15;

const percentile = (sorted: ArrayLike<number>, q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

/** 召喚される3DGSの被写体です。読み込んだ粒を魔法陣の中央に合わせ、下から上へ現れる演出を材質に組み込みます。 */
export default class Subject extends THREE.Object3D {
  /** 出現率です。0で見えず、1で全体が見えます。 */
  readonly reveal = uniform(0);
  /** 切断面の縁を光らせる色です。 */
  private readonly _glowColor: THREE.Color;
  /** 出現途中の深度プロキシを切断面より上でクリップする平面です。 */
  private readonly _cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  /** 現在の被写体をまとめたグループです。 */
  private _root: THREE.Group | null = null;
  /** 現在の被写体のデータと表示オプションです。 */
  private _current: {
    geometry: THREE.BufferGeometry;
    options: SubjectOptions;
  } | null = null;
  /** 実際の表示高さです。 */
  private _height = 1;

  constructor(glowColor: THREE.Color) {
    super();
    this._glowColor = glowColor;
  }

  get height() {
    return this._height;
  }

  /** 切断面のワールド高さです。稲妻の着弾点に使います。 */
  get cutHeight() {
    return Y_BOTTOM + this.reveal.value * this._height;
  }

  get geometry() {
    return this._current?.geometry ?? null;
  }

  get options() {
    return this._current?.options ?? null;
  }

  /** 出現率を更新します。切断面より下の粒だけが見えます。 */
  setReveal(value: number) {
    this.reveal.value = value;
    // 1のとき切断面は上端より縁の厚み（ノイズ込み）以上に高く、白い縁が残らない
    this._cutPlane.constant =
      Y_BOTTOM - EDGE * 2 + value * (this._height + EDGE * 6);
  }

  /** 被写体を差し替えます。高さは0.5%〜99.5%点、幅は中心からの距離の99%点で測り、上限に収まる縮尺で魔法陣の中央に置きます。 */
  set(geometry: THREE.BufferGeometry, options: SubjectOptions) {
    this._dispose();
    this._current = { geometry, options };
    const root = new THREE.Group();
    const splat = new GaussianSplat(geometry);
    splat.rotation.x = (options.rx * Math.PI) / 180;

    // 回転後の座標で寸法を測る
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
    // 99%点を使うのは、遠くに散った粒で幅が膨らむのを避けるため
    const widthLocal = 2 * percentile(rSorted, 0.99);
    const k = Math.min(
      options.height / (yHigh - yLow),
      options.widthMax / widthLocal,
    );
    splat.scale.setScalar(k);
    splat.position.set(-meanX * k, Y_BOTTOM - yLow * k, -meanZ * k);
    splat.updateMatrixWorld();
    this._height = (yHigh - yLow) * k;
    root.add(splat);

    // 深度プロキシ。被写体の奥にある魔法陣や光の柱が透けて手前に出ないよう、凸包の背面だけを深度に書く。
    // 上下の端に散った粒を含めると凸包が大きくなり黒い縁が出るので、中ほどの粒だけを使う
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
      // 出現途中は切断面より上をクリップして、まだ見えていない部分の奥が欠けないようにする。
      // WebGPURendererのクリップはClippingGroup単位
      const clipGroup = new THREE.ClippingGroup();
      clipGroup.clippingPlanes = [this._cutPlane];
      clipGroup.add(proxy);
      root.add(clipGroup);
    }

    // 出現の演出。粒ごとのワールド高さを頂点ステージで求め、切断面より上を不透明度0にする。
    // 切断面のすぐ下は白く光らせて輪郭にする
    const cut = float(Y_BOTTOM - EDGE * 2).add(
      this.reveal.mul(this._height + EDGE * 6),
    );
    const splatIndex = splat._sort.orderRead.element(instanceIndex);
    const center = splat._buffers.centerRead.element(splatIndex).xyz;
    const worldPosition = modelWorldMatrix.mul(vec4(center, 1));
    const worldY = varying(worldPosition.y);
    const noise = varying(hash(splatIndex));
    const floorMask = varying(
      smoothstep(Y_BOTTOM - 0.03, Y_BOTTOM + 0.015, worldPosition.y),
    );
    const depth = cut.sub(worldY).sub(noise.mul(EDGE * 1.5));
    const mask = smoothstep(-0.01, 0.01, depth).mul(floorMask);
    const edge = float(1)
      .sub(smoothstep(0, EDGE, depth))
      .mul(mask);
    // GaussianSplatのcolorNodeは色と不透明度を持つvec4
    const base = splat.material.colorNode as THREE.Node<"vec4"> | null;
    if (!base) throw new Error("GaussianSplat has no colorNode");
    const glow = vec3(
      this._glowColor.r,
      this._glowColor.g,
      this._glowColor.b,
    ).mul(1.7);
    splat.material.colorNode = vec4(
      mix(base.rgb, glow, edge.mul(0.6)),
      base.a.mul(mask),
    );
    // 撮影した色はそのまま見せたいので、ブルームは切断面の縁だけにかける
    splat.material.mrtNode = mrt({ bloomIntensity: edge });
    // 深度プロキシは奥のエフェクトを隠すためのもので、被写体自身の粒まで隠してはいけない。
    // 皿の内側のように凸包の底より低い面は深度判定で消えるので、粒は深度判定を受けない
    splat.material.depthTest = false;
    splat.material.needsUpdate = true;

    this.add(root);
    this._root = root;
    this.setReveal(this.reveal.value);
  }

  /** r186のGaussianSplatにdisposeはないので、geometryとmaterialを個別に解放します。 */
  private _dispose() {
    if (!this._root) return;
    this.remove(this._root);
    this._root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials: THREE.Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this._root = null;
  }
}
