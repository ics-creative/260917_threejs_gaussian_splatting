interface UiHandlers {
  summon(): void;
  load(file: File): void;
  flip(): void;
}

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
}

export function setupUi(handlers: UiHandlers): void {
  const summonButton = element<HTMLButtonElement>("summon");
  summonButton.addEventListener("click", handlers.summon);
  element<HTMLButtonElement>("flip").addEventListener("click", handlers.flip);

  // 自分の .spz を読み込む。ブラウザー内で完結し、どこにも送信しない
  const fileInput = element<HTMLInputElement>("file");
  element<HTMLButtonElement>("load").addEventListener("click", () =>
    fileInput.click(),
  );
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handlers.load(file);
    // 同じファイルを続けて選んでも change が発火するようにする
    fileInput.value = "";
  });

  const dropOverlay = element<HTMLDivElement>("drop");
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropOverlay.classList.add("on");
  });
  window.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropOverlay.classList.remove("on");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dropOverlay.classList.remove("on");
    const file = event.dataTransfer?.files[0];
    if (file) handlers.load(file);
  });
}

export function showLoadError(): void {
  alert("Could not read this .spz file");
}

export function setLoading(on: boolean): void {
  element<HTMLDivElement>("loading").classList.toggle("off", !on);
}
