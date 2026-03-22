import { Graphics } from "pixi.js";
import { boundsFromPolygon } from "../interaction/geometry.js";
import {
  type CommitShape,
  HANDLE_FILL,
  type InteractionContext,
  SNAP_THRESHOLD_PX,
  STROKE_COLOR,
  type Tool,
} from "../interaction/types.js";

/**
 * Intelligent Scissors tool — Photoshop-style "magnetic lasso".
 * Uses OpenCV.js IntelligentScissorsMB for edge-following contour tracing.
 *
 * Flow:
 * 1. Click to set anchor point (builds cost map at that point)
 * 2. Move cursor — tool traces optimal path along image edges
 * 3. Click to lock segment and set new anchor
 * 4. Double-click or snap-to-first to close polygon
 */
export class ScissorsTool implements Tool {
  readonly name = "scissors";
  readonly preview: Graphics;
  private ctx: InteractionContext;

  // OpenCV objects (loaded lazily)
  private cv: typeof import("@techstark/opencv-js") | null = null;
  private srcMat: unknown | null = null;
  private scissorsTool: unknown | null = null;
  private hasMap = false;
  private ready = false;

  // Canvas element for reading image pixels
  private imageCanvas: HTMLCanvasElement | null = null;

  // Drawing state
  private lockedPoints: number[] = [];
  private nextLeg: number[] = [];
  private isClosable = false;

  onCommit?: (shape: CommitShape) => void;

  constructor(ctx: InteractionContext) {
    this.ctx = ctx;
    this.preview = new Graphics();
    this.preview.label = "scissors-tool-preview";
    ctx.app.stage.addChild(this.preview);
  }

  /** Initialize OpenCV and prepare the image for edge detection */
  async initWithImage(imageElement: HTMLImageElement): Promise<void> {
    // Dynamic import — OpenCV.js is 8MB, only load when tool is used
    const cv = await import("@techstark/opencv-js");

    // Wait for OpenCV runtime to be ready
    if (!cv.Mat) {
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
    }

    this.cv = cv;

    // Render image to canvas for OpenCV to read
    const canvas = document.createElement("canvas");
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.drawImage(imageElement, 0, 0);
    this.imageCanvas = canvas;

    // Create source matrix from image
    this.srcMat = cv.imread(canvas);

    // Create scissors tool
    // @ts-expect-error: opencv-js types incomplete for segmentation API — opencv-js types are incomplete
    this.scissorsTool = new cv.segmentation_IntelligentScissorsMB();
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    this.scissorsTool.setEdgeFeatureCannyParameters(32, 100);
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    this.scissorsTool.setGradientMagnitudeMaxLimit(200);
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    this.scissorsTool.applyImage(this.srcMat);

    this.ready = true;
  }

  get isDrawing(): boolean {
    return this.lockedPoints.length >= 2 || this.nextLeg.length >= 2;
  }

  onPointerDown(x: number, y: number): boolean {
    if (!this.ready || !this.scissorsTool || !this.cv) return false;

    if (this.isClosable) {
      this.commitPolygon();
      return true;
    }

    // Lock current leg
    this.lockedPoints = [...this.lockedPoints, ...this.nextLeg];
    this.nextLeg = [];

    // Build new cost map at this anchor point
    const cv = this.cv;
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    this.scissorsTool.buildMap(new cv.Point(Math.round(x), Math.round(y)));
    this.hasMap = true;

    return true;
  }

  onPointerMove(x: number, y: number): void {
    if (!this.ready || !this.scissorsTool || !this.cv || !this.hasMap) return;

    const cv = this.cv;

    // Get contour from last anchor to cursor
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    const contour = new cv.Mat();
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    this.scissorsTool.getContour(
      // @ts-expect-error: opencv-js types incomplete for segmentation API
      new cv.Point(Math.round(x), Math.round(y)),
      contour,
    );

    // Extract contour points
    const leg: number[] = [];
    for (let i = 0; i < contour.rows; i++) {
      leg.push(contour.data32S[i * 2], contour.data32S[i * 2 + 1]);
    }
    contour.delete();

    // Simplify the contour to reduce point count
    this.nextLeg = this.simplifyPoints(leg, 0.8);

    // Check snap-to-close
    const allPoints = [...this.lockedPoints, ...this.nextLeg];
    if (allPoints.length >= 6) {
      const threshold = SNAP_THRESHOLD_PX / this.ctx.getViewportScale();
      const dx = x - allPoints[0];
      const dy = y - allPoints[1];
      this.isClosable = Math.sqrt(dx * dx + dy * dy) < threshold;
    } else {
      this.isClosable = false;
    }

    this.renderPreview();
  }

  onPointerUp(_x: number, _y: number): void {
    // Scissors uses click (pointerdown), not drag
  }

  onDoubleClick(_x: number, _y: number): void {
    const allPoints = [...this.lockedPoints, ...this.nextLeg];
    if (allPoints.length >= 6) {
      this.commitPolygon();
    }
  }

  onKeyDown(key: string): void {
    if (key === "Escape") this.cancel();
  }

  cancel(): void {
    this.preview.clear();
    this.lockedPoints = [];
    this.nextLeg = [];
    this.hasMap = false;
    this.isClosable = false;
  }

  destroy(): void {
    this.preview.destroy();
    // @ts-expect-error: opencv-js types incomplete for segmentation API
    if (this.srcMat) this.srcMat.delete();
    this.srcMat = null;
    this.scissorsTool = null;
  }

  private commitPolygon(): void {
    const pts = [...this.lockedPoints, ...this.nextLeg];
    if (pts.length < 6) return;

    const bounds = boundsFromPolygon(pts);
    this.preview.clear();
    this.lockedPoints = [];
    this.nextLeg = [];
    this.hasMap = false;
    this.isClosable = false;

    this.onCommit?.({
      type: "polygon",
      x: bounds.x,
      y: bounds.y,
      width: bounds.w,
      height: bounds.h,
      polygon: pts,
    });
  }

  private simplifyPoints(flat: number[], tolerance: number): number[] {
    // Convert flat [x,y,x,y,...] to [{x,y},...] for simplify-js
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      points.push({ x: flat[i], y: flat[i + 1] });
    }

    // Dynamic import would be cleaner but simplify-js is tiny
    // For now, use a simple Douglas-Peucker inline
    if (points.length <= 2) return flat;

    const simplified = this.douglasPeucker(points, tolerance);
    const result: number[] = [];
    for (const p of simplified) {
      result.push(p.x, p.y);
    }
    return result;
  }

  private douglasPeucker(
    points: { x: number; y: number }[],
    epsilon: number,
  ): { x: number; y: number }[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = this.pointLineDistance(points[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIdx), epsilon);
      return [...left.slice(0, -1), ...right];
    }

    return [first, last];
  }

  private pointLineDistance(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  }

  private renderPreview(): void {
    this.preview.clear();
    const scale = this.ctx.getViewportScale();
    const allPoints = [...this.lockedPoints, ...this.nextLeg];

    if (allPoints.length >= 4) {
      this.preview.poly(allPoints, false);
      this.preview.fill({ color: STROKE_COLOR, alpha: 0.08 });
      this.preview.stroke({ color: STROKE_COLOR, width: 2 / scale });
    }

    // Anchor dots at locked segment starts
    for (let i = 0; i < this.lockedPoints.length; i += 2) {
      const r = 3 / scale;
      this.preview.circle(this.lockedPoints[i], this.lockedPoints[i + 1], r);
      this.preview.fill({ color: HANDLE_FILL });
      this.preview.stroke({ color: STROKE_COLOR, width: 1 / scale });
    }

    // Snap-to-close indicator
    if (this.isClosable && allPoints.length >= 2) {
      const r = 6 / scale;
      this.preview.circle(allPoints[0], allPoints[1], r);
      this.preview.fill({ color: STROKE_COLOR, alpha: 0.2 });
      this.preview.stroke({ color: STROKE_COLOR, width: 2 / scale });
    }
  }
}
