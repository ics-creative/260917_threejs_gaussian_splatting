import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { SPZLoader } from "three/addons/loaders/SPZLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Beam, Flash, ShockWave } from "./effects/beam.ts";
import { Lightning } from "./effects/lightning.ts";
import { DustParticles, RisingParticles } from "./effects/particles.ts";
import { MagicCircle } from "./magicCircle.ts";
import { Subject, type SubjectOptions } from "./subject.ts";
import { Summoner } from "./summon.ts";
import { setLoading, setupUi, showLoadError } from "./ui.ts";

const MAGIC = new THREE.Color(0x8f7cff);
const MAGIC_HOT = new THREE.Color(0xcfe6ff);
// 書き出し元によって上下が反転していることがある。反転していたら Flip ボタンで直す
const DEFAULT_OPTIONS: SubjectOptions = { rx: 0, height: 1.1, widthMax: 1.5 };
// 上の文字帯を被写体の頭上に置くときの余白
const BAND_CLEARANCE = 0.35;

const params = new URLSearchParams(location.search);

// MSAA は数十万粒の近接描画で大きく fps が落ちる（ブレンド帯域が 4 倍になる）ため無効
const renderer = new THREE.WebGPURenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// 3DGS は撮影時の色をそのまま持っているので、トーンマッピングは掛けずに SuperSplat と同じ発色にする
renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06070c);

const camera = new THREE.PerspectiveCamera(
  46,
  window.innerWidth / window.innerHeight,
  0.05,
  100,
);
camera.position.set(0, 2.0, 2.9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.55, 0);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
controls.minDistance = 1.2;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

// 床と照明
scene.add(new THREE.HemisphereLight(0x2a2c48, 0x08080c, 0.5));
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8, 64),
  new THREE.MeshStandardMaterial({
    color: 0x0d0e15,
    roughness: 0.5,
    metalness: 0.15,
  }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
// 魔法陣の光が床に落ちるぶん。強さは演出に合わせて動かす
const glowLight = new THREE.PointLight(MAGIC, 0, 5, 1.5);
glowLight.position.set(0, 0.5, 0);
scene.add(glowLight);

const circle = new MagicCircle(scene, MAGIC);
const subject = new Subject(scene, MAGIC_HOT);
const summoner = new Summoner({
  subject,
  circle,
  beam: new Beam(scene, MAGIC),
  wave: new ShockWave(scene, MAGIC_HOT),
  flash: new Flash(scene),
  rising: new RisingParticles(scene, camera),
  dust: new DustParticles(scene, camera),
  lightning: new Lightning(scene, camera, MAGIC_HOT),
  glowLight,
  baseColor: MAGIC,
  hotColor: MAGIC_HOT,
});

function setSubject(
  geometry: THREE.BufferGeometry,
  options: SubjectOptions,
): void {
  subject.set(geometry, options);
  circle.setBandHeight(subject.height + BAND_CLEARANCE);
}

const loader = new SPZLoader();
setSubject(await loader.loadAsync("./models/spaghetti.spz"), DEFAULT_OPTIONS);

async function loadUserFile(file: File): Promise<void> {
  if (!/\.spz$/i.test(file.name)) return;
  setLoading(true);
  try {
    const buffer = await file.arrayBuffer();
    const geometry = await new Promise<THREE.BufferGeometry>(
      (resolve, reject) => loader.parse(buffer, resolve, reject),
    );
    setSubject(geometry, DEFAULT_OPTIONS);
    summoner.restart();
  } catch {
    showLoadError();
  } finally {
    setLoading(false);
  }
}

setupUi({
  summon: () => summoner.summon(),
  load: (file) => void loadUserFile(file),
  flip: () => {
    const { geometry, options } = subject;
    if (!geometry || !options) return;
    setSubject(geometry, { ...options, rx: (options.rx + 180) % 360 });
    summoner.restart();
  },
});

// ポストプロセス。ブルームで魔法陣と稲妻を光らせる。しきい値は白い皿が光らない程度に高くする
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
pipeline.outputNode = scenePass.add(bloom(scenePass, 0.7, 0.55, 0.92));

let firstFrame = true;
renderer.setAnimationLoop((now) => {
  summoner.update(now);
  controls.update();
  camera.position.add(summoner.shake);
  pipeline.render();
  // 初回描画はシェーダーのコンパイルを含んで時間がかかるので、描き終えてからローディング表示を消す
  if (firstFrame) {
    firstFrame = false;
    setLoading(false);
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (params.has("auto")) setTimeout(() => summoner.summon(), 600);
