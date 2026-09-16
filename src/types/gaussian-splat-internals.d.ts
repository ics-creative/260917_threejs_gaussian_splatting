// 出現演出で粒の並び順と中心座標を読むための内部プロパティ。公開APIではないので@types/threeに型がない
import type { StorageBufferNode } from "three/webgpu";

declare module "three/addons/objects/GaussianSplat.js" {
  interface GaussianSplat {
    _sort: { orderRead: StorageBufferNode<"uint"> };
    _buffers: { centerRead: StorageBufferNode<"vec4"> };
  }
}
