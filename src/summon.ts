import * as THREE from "three/webgpu";
import type { Beam, Flash, ShockWave } from "./effects/beam.ts";
import type { Lightning } from "./effects/lightning.ts";
import type { DustParticles, RisingParticles } from "./effects/particles.ts";
import type { MagicCircle } from "./magicCircle.ts";
import type { Subject } from "./subject.ts";

export type SummonState = "idle" | "summon" | "shown" | "dismiss";

const SUMMON_DURATION = 3.2;
const DISMISS_DURATION = 0.7;

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface SummonEffects {
  subject: Subject;
  circle: MagicCircle;
  beam: Beam;
  wave: ShockWave;
  flash: Flash;
  rising: RisingParticles;
  dust: DustParticles;
  lightning: Lightning;
  glowLight: THREE.PointLight;
  // 通常時の紫と、演出のピークで混ぜる白青
  baseColor: THREE.Color;
  hotColor: THREE.Color;
}

// 召喚の進行。idle → summon → shown。shown で押すと dismiss してから再召喚する
export class Summoner {
  private currentState: SummonState = "idle";
  // 点火の瞬間にカメラを揺らすぶん
  readonly shake = new THREE.Vector3();
  private readonly fx: SummonEffects;
  private startedAt = 0;
  private pendingSummon = false;
  private idleOpacity = 0;
  private readonly tint = new THREE.Color();
  private readonly beamTint = new THREE.Color();

  constructor(effects: SummonEffects) {
    this.fx = effects;
  }

  get state(): SummonState {
    return this.currentState;
  }

  summon(): void {
    if (this.currentState === "summon") return;
    if (this.currentState === "shown") {
      this.currentState = "dismiss";
      this.startedAt = performance.now();
      this.pendingSummon = true;
      return;
    }
    this.currentState = "summon";
    this.startedAt = performance.now();
    this.fx.beam.mesh.visible = true;
  }

  // 被写体を差し替えたあとに最初から召喚し直す
  restart(): void {
    this.currentState = "idle";
    this.pendingSummon = false;
    this.fx.subject.setReveal(0);
    this.fx.beam.mesh.visible = false;
    this.summon();
  }

  update(now: number): void {
    const {
      subject,
      circle,
      beam,
      wave,
      flash,
      rising,
      dust,
      lightning,
      glowLight,
      baseColor,
      hotColor,
    } = this.fx;
    const elapsed = (now - this.startedAt) / 1000;
    let circleOpacity = this.idleOpacity;
    let beamOpacity = 0;
    let light = 0;
    let particleAmount = 0;
    // 0 で紫、1 で白青。演出のピークで色を変える
    let heat = 0;
    let boltStrength = 0;
    let dustAmount = 0;
    let flashOpacity = 0;
    this.shake.set(0, 0, 0);

    if (this.currentState === "summon") {
      const ignite = clamp01(elapsed / 0.5);
      const rise = clamp01((elapsed - 0.35) / 2.1);
      const settle = clamp01((elapsed - 2.45) / 0.75);
      subject.setReveal(easeInOut(rise));
      circleOpacity = 0.35 + ignite * 0.75 - settle * 0.5;
      beamOpacity =
        (rise < 1 ? 0.13 * Math.min(1, elapsed / 0.4) : 0.13) *
        (1 - settle) *
        (0.85 + Math.sin(elapsed * 37) * 0.15);
      light = 10 * Math.min(1, elapsed / 0.4) * (1 - settle * 0.7);
      particleAmount = rise < 1 ? Math.min(1, elapsed / 0.3) : 1 - settle;
      const w = clamp01(elapsed / 0.9);
      wave.update(0.4 + w * 4.2, (1 - w) * 0.9);
      this.idleOpacity = 0.6;
      // 魔法陣は縮んだ状態から勢いよく広がる
      circle.setScale(
        0.55 +
          0.45 * (1 - (1 - ignite) ** 3) +
          Math.sin(ignite * Math.PI) * 0.06,
      );
      flashOpacity =
        elapsed < 0.42 ? 0 : Math.max(0, 1 - (elapsed - 0.42) / 0.3) * 0.7;
      heat = rise < 1 ? Math.min(1, elapsed / 0.6) : 1 - settle;
      boltStrength =
        rise < 1 ? Math.min(1, elapsed / 0.5) : Math.max(0, 1 - settle * 2);
      dustAmount = rise < 1 ? Math.min(1, elapsed / 0.5) : 1 - settle * 0.7;
      if (elapsed > 0.42 && elapsed < 0.75) {
        this.shake
          .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .multiplyScalar(0.025 * (1 - (elapsed - 0.42) / 0.33));
      }
      if (elapsed >= SUMMON_DURATION) {
        this.currentState = "shown";
        beam.mesh.visible = false;
        subject.setReveal(1);
      }
    } else if (this.currentState === "dismiss") {
      const a = clamp01(elapsed / DISMISS_DURATION);
      subject.setReveal(1 - easeInOut(a));
      circleOpacity = 0.6 + a * 0.4;
      light = 4 + a * 4;
      particleAmount = a;
      heat = a;
      boltStrength = a * 0.7;
      dustAmount = a;
      if (a >= 1) {
        this.currentState = "idle";
        subject.setReveal(0);
        if (this.pendingSummon) {
          this.pendingSummon = false;
          this.summon();
        }
      }
    } else if (this.currentState === "shown") {
      light = 2.5 + Math.sin(now * 0.002) * 0.6;
      circleOpacity = this.idleOpacity + Math.sin(now * 0.0016) * 0.06;
      dustAmount = 0.3;
    }

    this.tint.lerpColors(baseColor, hotColor, heat * 0.55);
    circle.update(now, circleOpacity, this.tint);
    beam.update(
      now,
      beamOpacity,
      this.beamTint.lerpColors(baseColor, hotColor, heat * 0.3),
    );
    flash.opacity = flashOpacity;
    glowLight.color.copy(this.tint);
    glowLight.intensity = light;
    if (boltStrength > 0)
      lightning.update(now, subject.cutHeight, boltStrength);
    else lightning.clear();
    dust.update(now, dustAmount, this.tint, subject.height);
    rising.update(now, particleAmount, this.tint, subject.height);
  }
}
