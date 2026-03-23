import { Application, ColorMatrixFilter, Sprite, Texture } from "pixi.js";
import type { ViewportBounds } from "./types.js";

export class ImagePlugin {
  private app: Application;
  private sprite: Sprite | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  zoom = 1;
  panX = 0;
  panY = 0;
  imageWidth = 0;
  imageHeight = 0;

  onViewportChange?: (bounds: ViewportBounds) => void;
  canPan?: () => boolean;

  constructor(app: Application) {
    this.app = app;
    // GPU-accelerated transforms for the viewport container
    app.stage.isRenderGroup = true;
    this.setupEvents();
  }

  async load(url: string): Promise<void> {
    if (this.sprite) {
      this.app.stage.removeChild(this.sprite);
      this.sprite.destroy();
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });

    const texture = Texture.from(img);
    this.sprite = new Sprite(texture);
    this.imageWidth = img.naturalWidth;
    this.imageHeight = img.naturalHeight;

    // Add as bottom layer on stage
    this.app.stage.addChildAt(this.sprite, 0);
    this.fitToViewport();
  }

  /**
   * Load image from Arrow Binary column data (zero-copy path).
   * The bytes go from Arrow buffer → Blob → ObjectURL → Image → GPU texture.
   * No extra HTTP request, no separate endpoint.
   */
  async loadFromBytes(
    bytes: Uint8Array,
    mimeType = "image/png",
  ): Promise<void> {
    if (this.sprite) {
      this.app.stage.removeChild(this.sprite);
      this.sprite.destroy();
    }

    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error("Failed to load image from Arrow binary data"));
        img.src = url;
      });

      const texture = Texture.from(img);
      this.sprite = new Sprite(texture);
      this.imageWidth = img.naturalWidth;
      this.imageHeight = img.naturalHeight;

      this.app.stage.addChildAt(this.sprite, 0);
      this.fitToViewport();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  fitToViewport(): void {
    if (!this.sprite) return;

    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const scale = Math.min(vw / this.imageWidth, vh / this.imageHeight);

    this.zoom = scale;
    this.panX = (vw - this.imageWidth * scale) / 2;
    this.panY = (vh - this.imageHeight * scale) / 2;

    this.applyTransform();
  }

  getViewportBounds(): ViewportBounds {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    return {
      x: -this.panX / this.zoom,
      y: -this.panY / this.zoom,
      width: vw / this.zoom,
      height: vh / this.zoom,
    };
  }

  destroy(): void {
    this.removeEvents();
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }

  private applyTransform(): void {
    this.app.stage.scale.set(this.zoom);
    this.app.stage.position.set(this.panX, this.panY);
    this.onViewportChange?.(this.getViewportBounds());
    // Render on demand — no continuous ticker
    this.app.render();
  }

  private get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  private setupEvents(): void {
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerUp);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
  }

  private removeEvents(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerUp);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
  }

  private zoomAt(x: number, y: number, factor: number): void {
    const newZoom = Math.max(0.05, Math.min(50, this.zoom * factor));
    this.panX = x - (x - this.panX) * (newZoom / this.zoom);
    this.panY = y - (y - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.ctrlKey) {
      // Pinch-to-zoom (trackpad): deltaY is continuous, clamp and scale gently
      const delta = Math.max(-20, Math.min(20, e.deltaY));
      this.zoomAt(mx, my, 1 - delta * 0.003);
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5) {
      // Trackpad two-finger pan (deltaX is significant)
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
    } else {
      // Mouse wheel zoom: use deltaY magnitude for proportional zoom
      // Normalize: most mice send deltaY ~100 per tick, trackpads send ~1-10
      const normalized = Math.max(-150, Math.min(150, e.deltaY));
      const factor = 1 - normalized * 0.001;
      this.zoomAt(mx, my, factor);
    }

    this.applyTransform();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.canPan && !this.canPan()) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;

    this.panX += e.clientX - this.lastX;
    this.panY += e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.applyTransform();
  };

  private onPointerUp = (): void => {
    if (this.dragging) {
      this.dragging = false;
      this.canvas.style.cursor = "default";
    }
  };

  private onDoubleClick = (): void => {
    if (this.canPan && !this.canPan()) return;
    this.fitToViewport();
  };

  /** Apply image adjustments via ColorMatrixFilter */
  setImageAdjustments(brightness: number, contrast: number, saturation: number): void {
    if (!this.sprite) return;

    // All at defaults (1.0) — remove filter for zero overhead
    if (brightness === 1 && contrast === 1 && saturation === 1) {
      this.sprite.filters = [];
      this.app.render();
      return;
    }

    const filter = new ColorMatrixFilter();
    filter.brightness(brightness, false);
    filter.contrast(contrast - 1, true); // pixi contrast: 0 = normal, -1 = grey, +1 = high
    filter.saturate(saturation - 1, true); // pixi saturate: 0 = normal, -1 = desaturated
    this.sprite.filters = [filter];
    this.app.render();
  }

  /** Programmatic reset — callable from UI regardless of tool */
  resetView(): void {
    this.fitToViewport();
  }

  /** Zoom in by a fixed step, centered on canvas */
  zoomIn(): void {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    this.zoomAt(vw / 2, vh / 2, 1.25);
    this.applyTransform();
  }

  /** Zoom out by a fixed step, centered on canvas */
  zoomOut(): void {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    this.zoomAt(vw / 2, vh / 2, 0.8);
    this.applyTransform();
  }
}
