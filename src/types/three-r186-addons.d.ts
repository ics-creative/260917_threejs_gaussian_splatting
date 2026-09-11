// @types/three は 0.185 までで、r186 で追加された GaussianSplat と SPZLoader の型がない。
// 0.186 の型が公開されたらこのファイルは削除する

declare module "three/addons/objects/GaussianSplat.js" {
  import type {
    BufferGeometry,
    Mesh,
    NodeMaterial,
    StorageBufferNode,
  } from "three/webgpu";

  export class GaussianSplat extends Mesh<BufferGeometry, NodeMaterial> {
    constructor(geometry: BufferGeometry, options?: { autoSort?: boolean });
    // 出現演出で粒の並び順と中心座標を読むための内部プロパティ
    _sort: { orderRead: StorageBufferNode<"uint"> };
    _buffers: { centerRead: StorageBufferNode<"vec4"> };
  }
}

declare module "three/addons/loaders/SPZLoader.js" {
  import type { BufferGeometry, Loader } from "three/webgpu";

  export class SPZLoader extends Loader<BufferGeometry> {
    parse(
      buffer: ArrayBuffer,
      onLoad?: (geometry: BufferGeometry) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
}
