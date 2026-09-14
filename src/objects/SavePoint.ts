import { gsap } from "gsap";
import * as THREE from "three/webgpu";
import Lightning from "../effects/Lightning";
import MagicCircle from "../effects/MagicCircle";
import Pillar from "../effects/Pillar";
import Swirl from "../effects/Swirl";
import imageGround from "../img/ground.png";
import ParticleEmitter from "../particles/ParticleEmitter";
import type Subject from "./Subject";

/** セーブポイントを構成するエフェクトとアニメーションを管理し、被写体を召喚します。 */
export default class SavePoint extends THREE.Object3D {
  /** 各エフェクトで共有するアニメーション値です。 */
  private readonly _motion = { energy: 0, sparkle: 0.2 };
  /** 召喚の進み具合です。revealは被写体の出現率、lightningは稲妻の強さです。 */
  private readonly _summon = { reveal: 0, lightning: 0 };
  /** 召喚される被写体です。 */
  private readonly _subject: Subject;
  /** 地面の明るさを更新するマテリアルです。 */
  private readonly _groundMaterial: THREE.MeshBasicMaterial;
  /** 地面上でまとめて展開するエフェクトです。 */
  private readonly _floorEffects = new THREE.Object3D();
  /** 三層の魔法陣です。 */
  private readonly _magicCircle = new MagicCircle();
  /** 床面を照らすポイントライトです。 */
  private readonly _light = new THREE.PointLight(0x20b0ff, 50, 4, 2);
  /** 中央から立ち上がる光柱です。 */
  private readonly _pillar = new Pillar();
  /** 中央から外側へ広がる光です。 */
  private readonly _spreadLight = new Pillar(4, 3, 2);
  /** 地面を流れる渦です。 */
  private readonly _swirl = new Swirl();
  /** 通常粒子と発動粒子を管理します。 */
  private readonly _particleEmitter = new ParticleEmitter();
  /** 召喚中に被写体へ走る稲妻です。 */
  private readonly _lightning = new Lightning(0xa0e0ff);
  /** 周期的な明滅のタイムラインです。召喚中は止めます。 */
  private _pulse: gsap.core.Timeline | null = null;
  /** 再生中の召喚タイムラインです。 */
  private _summonTimeline: gsap.core.Timeline | null = null;
  /** 被写体が出現しきるまでtrueで、その間の召喚ボタンは無視します。 */
  private _busy = false;

  constructor(subject: Subject) {
    super();
    this._subject = subject;

    // 地面の光
    const groundTexture = new THREE.TextureLoader().load(imageGround);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    // 明輪を魔法陣の外へずらしつつ、swirlの内側へ収める
    groundTexture.repeat.setScalar(0.86);
    groundTexture.offset.setScalar(0.07);
    this._groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x0070d0,
      map: groundTexture,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.65,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 8.5),
      this._groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.05;

    // エフェクトの配置
    this._light.position.y = 2;
    this._spreadLight.brightness = 0.8;
    this._floorEffects.add(ground, this._spreadLight, this._swirl);
    this.add(
      this._floorEffects,
      this._magicCircle,
      this._pillar,
      this._particleEmitter,
      this._lightning,
      this._light,
      this._subject,
    );

    // 初回モーションの開始位置
    this._pillar.position.y = -8;
    this._magicCircle.rotation.y = -Math.PI / 2;
    this._floorEffects.scale.set(0, 1, 0);
  }

  /** 各エフェクトを更新し、現在の発光の強さを返します。 */
  update(delta: number, camera: THREE.Camera) {
    const { energy, sparkle } = this._motion;
    this._magicCircle.update(energy);
    this._pillar.update(delta, energy);
    this._spreadLight.update(delta, energy);
    this._swirl.update(delta, energy);
    this._particleEmitter.update(energy, sparkle);
    this._subject.setReveal(this._summon.reveal);
    this._lightning.update(
      camera,
      this._subject.cutHeight,
      this._summon.lightning,
    );
    this._groundMaterial.color.setRGB(energy * 0.4, 0.4 + energy * 0.4, 1);
    this._groundMaterial.opacity = 0.65 + energy * 0.15;
    this._light.color.setRGB(energy, 0.6 + energy * 0.4, 1);
    this._light.intensity = 150 + energy * 200;
    return energy;
  }

  /** 初回の出現と周期的な明滅を開始します。 */
  start() {
    // 初回の出現
    this._magicCircle.startEntrance();
    gsap
      .timeline()
      .to(this._pillar.position, {
        y: 0,
        duration: 1.2,
        ease: "power4.out",
      })
      .to(
        this._magicCircle.rotation,
        { y: 0, duration: 1.2, ease: "expo.out" },
        0,
      )
      .to(
        this._floorEffects.scale,
        { x: 1, z: 1, duration: 1.2, ease: "expo.out" },
        0,
      );

    // 予兆から発光、余韻までを一つの周期で再生
    this._pulse = gsap.timeline({ delay: 0.2, repeat: -1, repeatDelay: 1 });
    this._pulse
      .to(this._motion, {
        energy: 0.8,
        sparkle: 1,
        duration: 1.2,
        ease: "power3.inOut",
      })
      .call(() => this._particleEmitter.emitWave(), [], "-=0.5")
      .to(this._motion, {
        energy: 0,
        sparkle: 0.2,
        duration: 3,
        ease: "power1.out",
      });
  }

  /** 被写体を召喚します。表示中なら一度沈めてから召喚し直します。 */
  summon() {
    if (this._busy) return;
    this._busy = true;
    // 余韻の途中で押されたら、余韻を打ち切って次の召喚へ進む
    this._summonTimeline?.kill();
    this._pulse?.pause();
    const timeline = gsap.timeline({
      // 余韻で発光が0に戻るので、周期的な明滅を最初から再開すると途切れない
      onComplete: () => this._pulse?.restart(true),
    });

    // 表示中の被写体を沈め、光の柱を戻す
    if (this._summon.reveal > 0) {
      timeline
        .to(this._summon, { reveal: 0, duration: 0.6, ease: "power2.in" })
        .to(
          this._pillar.position,
          { y: 0, duration: 0.8, ease: "power4.out" },
          "<",
        )
        .set(this._pillar, { brightness: 1 });
    }

    // 位置は「光を溜め始める時刻」からの相対で指定する
    timeline
      .addLabel("charge")
      // 光を溜め、稲妻を走らせ、発動粒子を放つ
      .to(
        this._motion,
        { energy: 0.8, sparkle: 1, duration: 1, ease: "power3.inOut" },
        "charge",
      )
      .to(this._summon, { lightning: 1, duration: 0.4 }, "charge+=0.3")
      .call(() => this._particleEmitter.emitWave(), [], "charge+=0.6")
      // 光の柱を暗くしてから地面へ沈め、その中から被写体を引き上げる。柱が明るいままだと中心が白く飛ぶ
      .to(
        this._pillar,
        { brightness: 0.3, duration: 0.8, ease: "power2.out" },
        "charge+=0.7",
      )
      .to(
        this._pillar.position,
        { y: -8, duration: 1.4, ease: "power2.in" },
        "charge+=1",
      )
      .to(
        this._summon,
        { reveal: 1, duration: 2.2, ease: "power2.inOut" },
        "charge+=1.5",
      )
      // 通常状態へ戻る余韻。被写体が出きったら稲妻を止める
      .to(
        this._motion,
        { energy: 0, sparkle: 0.2, duration: 2.5, ease: "power1.out" },
        "charge+=1.4",
      )
      .to(this._summon, { lightning: 0, duration: 0.6 }, "charge+=3.3")
      .call(
        () => {
          this._busy = false;
        },
        [],
        "charge+=3.7",
      );
    this._summonTimeline = timeline;
  }

  /** 被写体を差し替えたあと、最初から召喚し直します。 */
  restart() {
    this._busy = false;
    this._summonTimeline?.kill();
    this._summonTimeline = null;
    this._summon.reveal = 0;
    this._pillar.position.y = 0;
    this._pillar.brightness = 1;
    this.summon();
  }
}
