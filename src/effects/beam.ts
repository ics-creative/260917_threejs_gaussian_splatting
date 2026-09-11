import * as THREE from "three/webgpu";
import { canvasTexture, dotTexture } from "../textures.ts";

// 被写体を包む光の柱。根元が明るく上に向かって消える
export class Beam {
  readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene, color: THREE.Color) {
    const texture = canvasTexture(8, 256, (ctx) => {
      const grad = ctx.createLinearGradient(0, 256, 0, 0);
      grad.addColorStop(0, "rgb(255 255 255 / 1)");
      grad.addColorStop(0.35, "rgb(255 255 255 / 0.45)");
      grad.addColorStop(1, "rgb(255 255 255 / 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 256);
    });
    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.8, 2.6, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.position.y = 1.3;
    // 柱は被写体より先に描き、被写体に覆わせる（深度プロキシで隠すと輪郭が四角く出る）
    this.mesh.renderOrder = -3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(now: number, opacity: number, color: THREE.Color): void {
    this.mesh.material.opacity = opacity;
    this.mesh.material.color.copy(color);
    this.mesh.rotation.y = now * 0.0004;
  }
}

// 召喚開始時に床を広がる波紋
export class ShockWave {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene, color: THREE.Color) {
    const texture = canvasTexture(256, 256, (ctx) => {
      const grad = ctx.createRadialGradient(128, 128, 96, 128, 128, 128);
      grad.addColorStop(0, "rgb(255 255 255 / 0)");
      grad.addColorStop(0.7, "rgb(255 255 255 / 1)");
      grad.addColorStop(1, "rgb(255 255 255 / 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.01;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  update(scale: number, opacity: number): void {
    this.mesh.scale.setScalar(scale);
    this.mesh.material.opacity = opacity;
  }
}

// 点火の瞬間の閃光
export class Flash {
  readonly sprite: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sprite.position.y = 0.4;
    this.sprite.scale.setScalar(1.7);
    this.sprite.renderOrder = 3;
    scene.add(this.sprite);
  }

  set opacity(value: number) {
    this.sprite.material.opacity = value;
  }
}
