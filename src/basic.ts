// 記事「Three.jsで表示する」の章のコード。撮影した.spzを読み込んで表示するだけの最小構成
import * as THREE from "three/webgpu";
import { SPZLoader } from "three/addons/loaders/SPZLoader.js";
import { GaussianSplat } from "three/addons/objects/GaussianSplat.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// 3DGSの表示はWebGPURendererを使う
const renderer = new THREE.WebGPURenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// WebGPURendererは初期化が非同期なので、完了を待ってから描画を始める
await renderer.init();

// シーンの作成
const scene = new THREE.Scene();
// 粒の輪郭はふんわり途切れるので、暗めの背景のほうが形が締まって見える
scene.background = new THREE.Color(0x111111);

// カメラの設置
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(0, 0, 3);

// マウスやタッチで被写体のまわりを回れるようにする
const controls = new OrbitControls(camera, renderer.domElement);

// .spzを読み込む
const geometry = await new SPZLoader().loadAsync("./models/spaghetti.spz");
// BufferGeometryが返るので、GaussianSplatに渡す
const splat = new GaussianSplat(geometry);
scene.add(splat);

// 読み込んだデータが逆さまならX軸まわりに180度回す（Scaniverseから書き出したこのデータは不要）
// splat.rotation.x = Math.PI;

// 回転を反映したワールド行列を確定させてから、データ全体を囲む球を計算する
splat.updateMatrixWorld();
splat.computeBoundingSphere();

const radius = splat.boundingSphere!.radius;
// 球の中心はローカル座標なので、ワールド座標に直してから使う
const center = splat
  .boundingSphere!.center.clone()
  .applyMatrix4(splat.matrixWorld);

// カメラの注視点を被写体の中心にし、半径を目安に少し上から見下ろす位置へ置く
controls.target.copy(center);
camera.position.set(center.x, center.y + radius * 1.5, center.z + radius * 2.5);
controls.update();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
