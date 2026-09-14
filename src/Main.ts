import * as THREE from "three/webgpu";
import { float, mrt, output, pass } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SPZLoader } from "three/addons/loaders/SPZLoader.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import Floor from "./objects/Floor";
import SavePoint from "./objects/SavePoint";
import Subject, { type SubjectOptions } from "./objects/Subject";
import { setLoading, setupUi, showLoadError } from "./ui";

/** 被写体の表示オプションです。書き出し元によって上下が反転していることがあり、その場合はFlipボタンで直します。 */
const DEFAULT_OPTIONS: SubjectOptions = { rx: 0, height: 3.2, widthMax: 4.4 };

/** 画像とレンダラーの準備後に描画とモーションを開始します。 */
async function init() {
  // シーンとカメラ
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0);
  scene.fog = new THREE.FogExp2(0x0, 0.03);
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    1000,
  );
  camera.position.set(10, 7, 0);

  // レンダラー。3DGSは数十万の半透明の粒を重ねて描くので、MSAAを有効にするとfpsが大きく落ちる
  const renderer = new THREE.WebGPURenderer({ antialias: false });
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  // 画像と3Dオブジェクト
  const texturesReady = new Promise<void>((resolve) => {
    THREE.DefaultLoadingManager.onLoad = resolve;
  });
  const subject = new Subject(new THREE.Color(0xa0e0ff));
  const savePoint = new SavePoint(subject);
  scene.add(new Floor(), savePoint);
  // エフェクトのマテリアルはブルームの対象にする。被写体は後から読み込むので含まれない
  const bloomTarget = mrt({ bloomIntensity: float(1) });
  savePoint.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      object.material.mrtNode = bloomTarget;
    }
  });
  await texturesReady;

  // 被写体の3DGSデータ
  const loader = new SPZLoader();
  subject.set(
    await loader.loadAsync("./models/spaghetti.spz"),
    DEFAULT_OPTIONS,
  );

  // カメラ制御
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.minDistance = 6;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = true;

  // ライト
  scene.add(new THREE.HemisphereLight(0x2080c0, 0x102040, 2));

  // ポストエフェクト。撮影した色をそのまま見せるため、ブルームはmrtNodeで指定したエフェクトだけにかける
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, bloomIntensity: float(0) }));
  const sceneColor = scenePass.getTextureNode();
  // 加算合成が重なると1を超えるので、ブルームの強さは1に抑える
  const bloomIntensity = scenePass.getTextureNode("bloomIntensity").clamp();
  const bloomPass = bloom(sceneColor.mul(bloomIntensity), 1, 0.5, 0.3);
  const postProcessing = new THREE.RenderPipeline(renderer);
  postProcessing.outputNode = sceneColor.add(bloomPass);

  // リサイズ処理
  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize);

  // 自分の.spzを読み込む。ブラウザー内で完結し、どこにも送信しない
  const loadUserFile = async (file: File) => {
    if (!/\.spz$/i.test(file.name)) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const geometry = await new Promise<THREE.BufferGeometry>(
        (resolve, reject) => loader.parse(buffer, resolve, reject),
      );
      subject.set(geometry, DEFAULT_OPTIONS);
      savePoint.restart();
    } catch {
      showLoadError();
    } finally {
      setLoading(false);
    }
  };

  setupUi({
    summon: () => savePoint.summon(),
    load: (file) => void loadUserFile(file),
    flip: () => {
      const { geometry, options } = subject;
      if (!geometry || !options) return;
      subject.set(geometry, { ...options, rx: (options.rx + 180) % 360 });
      savePoint.restart();
    },
  });

  // アニメーション
  const timer = new THREE.Timer();
  timer.connect(document);
  postProcessing.render();
  requestAnimationFrame(() => savePoint.start());
  let firstFrame = true;
  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = timer.getDelta();
    controls.update(delta);
    const energy = savePoint.update(delta, camera);
    bloomPass.strength.value = 1 + energy * 0.3;
    bloomPass.radius.value = 0.5 + energy * 0.1;
    postProcessing.render();
    // 初回描画はシェーダーのコンパイルを含んで時間がかかるので、描き終えてからローディング表示を消す
    if (firstFrame) {
      firstFrame = false;
      setLoading(false);
    }
  });

  if (new URLSearchParams(location.search).has("auto")) {
    setTimeout(() => savePoint.summon(), 1500);
  }
}

init();
