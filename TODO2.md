# TODO2 — ra-anno (engine decoupling / audits / go-native)

Snapshot after the **2026-06-24** session. Supersedes the 2026-06-23 notes below the line.
**No IIIF / no W3C Web Annotation** — Apache Arrow is the native model.

---

## ✅ Done — 2026-06-24 session

### Engine decoupling (the keystone — was task #3)
- **Phase 1 carve** (`c89429a`): framework-agnostic `src/lib/engine/` (zero `svelte`/`$app`), barrel `index.ts`; `PixiCanvas.svelte` → `src/lib/svelte/`.
- **Phase 2 store decoupling**: `src/lib/engine/store/{AnnotationStore,LayerStore}.ts` are now plain-TS + an observer (`on`/`emit` "structural"/"field"); `src/lib/stores/*.svelte.ts` are thin runes adapters (tick-bump). Old `undo.svelte.ts` deleted.
- **Transport injection** (THE packaging blocker, fixed): `AnnotationStore` no longer hardcodes `fetch('/api/annotations/…')`. It takes an injected `AnnotationTransport` (`src/lib/engine/store/transport.ts`); the HTTP impl is `src/lib/stores/httpAnnotationTransport.ts` in the binding. Engine is now genuinely host-agnostic (in-memory / gRPC / **streaming-inference** transports drop in).

### Perf — incremental append (O(appended), not O(total))
- `appendManyLocal` concats ONE Arrow `RecordBatch` (built from the base schema's exact types — Float32/Dictionary/List preserved) instead of rebuilding the whole table. **Measured: ~1294 ms → ~2 ms** to append into a 100k table; correctness verified (shape_type + base64 mask round-trip). `appendLocal` delegates. Streamed model inference uses the same path.

### Drawing fixes (verified in-app)
- Brush produces a **real raster mask** (was a polygon "box" — caused by Toolbar↔engine brush-option **desync**; engine is now the single source of truth, Toolbar reflects it via `brushOptions`).
- Masks are **editable** (bbox editor + sprite follows geometry overrides).
- **Alt+click deletes a polygon vertex**; modifier state synced from the pointer event.
- Mask GPU-texture leak + `img.onload`-on-destroyed-sprite race fixed; `hover`/`highlight` render-on-clear (the stale selection "box").

### Security / data integrity
- **P0 path-traversal** closed on all `[pageId]` API routes (`src/lib/server/ids.ts` `safePageId`).
- **P0 empty-page schema drop** fixed: empty table now carries all 23 `ANNOTATION_COLUMNS` (was silently dropping `shape_type`/`mask`/`rotation`/… from the first shape on an empty page).

### Misc audit fixes
- `ImagePlugin`: texture/source destroy on swap+teardown; cached `ColorMatrixFilter`; pointer-capture pan.
- `Magnetic`/`Scissors` tools: `requestRender` (render-on-demand), removed `console.log`, Douglas-Peucker → shared `simplifyPath`.

---

## 🔬 Two audits run this session (multi-agent, adversarially verified)

### A) TS engine audit — 38 confirmed (2 P0, 15 P1, 21 P2)
**Done:** both P0s (above) + transport injection + mask leaks/race + render-on-clear + Magnetic/Scissors render + ImagePlugin leaks + ScissorsTool DP-dedup + `encodeURIComponent` + streaming `_loading` finally.
**Remaining (P1):**
- `noUncheckedIndexedAccess` OFF → 124 masked OOB/undefined accesses across 11 engine files. Enable + fix.
- `canUndo`/`canRedo` are **global**, but undo/redo are per-page → make page-scoped (thread `pageId` through adapter + Toolbar).
- `selectedSet` not cleared on undo/redo/Escape → fold into `cancel()`.
- per-`pageId` caches/undo stacks **never evicted** → add `dispose(pageId)` on page unmount.
- `tableFromArrays` widens Float32→Float64 on rematerialize/save (incremental append already preserves it; pin schema on the rematerialize/save path too).
- ESLint: **no config exists** → add flat `eslint.config.js` + typescript-eslint + svelte plugin; `tsc --noEmit` in CI.

### B) PixiJS-native audit — 72 findings (25 high) — "GO NATIVE"
We re-rasterize 5 monolithic Graphics on every transform with no culling, bake size-into-geometry (zoom ⇒ full rebuild), run two raw-DOM event stacks, and hand-roll math Pixi shapes already do.
**Top 5 (impact ÷ effort):**
1. **Register `CullerPlugin`** (`PixiCanvas.svelte`) — our `cullable=true` is inert (plugin never added); pan never culls. **S.**
2. **`isRenderGroup` on the annotation container** — GPU pan/zoom transform. **S.**
3. **`Assets.load({src, parser:'texture'})`** for image + base64 masks (off-main-thread decode + dedup; `parser` handles our extension-less `/api/pages` URLs). **S.**
4. **`ParticleContainer` for point annotations** (~1/3 of data) — one draw call; constant radius via `scale=1/zoom`. **L.**
5. **FederatedEvent system** — `stage.eventMode='static'` + `globalpointermove`/`pointerupoutside`; delete the dual DOM stack, `setPointerCapture` bookkeeping, and `getBoundingClientRect`-per-event. **L (incremental).**

**Real bug found:** line/open-polyline annotations have no fill area → only selectable by bbox. Fix with `Polygon.strokeContains`.

**Perf wall (100k):** `cacheAsTexture(true)` on the static layer · spatial tile grid of `isRenderGroup` sub-Containers (a 1-row edit currently rebuilds the whole monolith → the 1.1s freeze) · split `sync()` into geometry-build vs per-frame cull · `onRender` counter-scaling (kill zoom re-sync) · `boundsArea` on the container · **OffscreenCanvas + `WebWorkerAdapter`** (materialize+draw off-thread — the eventual ceiling for streamed inference) · mask atlas/spritesheet.

**Viz moat (the FiftyOne differentiator):** today's "heatmap" is a fake per-row tint. Real: GPU **density field** = one viewport quad `Mesh` + `Shader.from({gl,gpu})` with region centers in a `UniformGroup`/data-Texture → constant cost regardless of N; `FillGradient` saliency; `blendMode:'add'` masks; single-channel mask data-Texture + colormap; native `graphicsContextToSvg` export. Same shader layer is modality-agnostic (runs on a video frame texture).

**Simpler math/events:** `stage.toLocal(event.global)` / `toGlobal` (handles rotation — our scalar transform breaks under oriented boxes) · `Polygon.contains`/`strokeContains` · `Rectangle.contains/intersects/pad` · interactive `eventMode='static'` handles (Pixi does hit-test+hover+cursor) · modifiers off the event · `renderer.events.cursorStyles` · `math-extras`.

**Leave custom:** the Arrow columnar store + transport + RecordBatch append; render-on-demand policy; tool state machines; the overlay/WAL.

---

## 🧱 Package restructure (decided: 2 packages, AFTER the audits)
`@ra-anno/engine` (all framework-agnostic: arrow + pixi + interaction) + `@ra-anno/svelte` (binding). One npm install; split arrow/pixi later as it grows. **Stay on TS7** (consumed as source via `exports`→`./src/index.ts`, no `composite`/project references). Keep `core`/`canvas` as separate **internal modules** so audio/video later is a file-move, not a rewrite. Fold the god-file decomposition (`InteractionManager`, `ArrowDataPlugin`) into the move.

## 🗺️ Roadmap — HTR + multimodal + inference
- **Surface new schema fields in UI**: oriented-box (rotation handle), point/line/baseline editors, relations (`links`), reading-order, region-type dropdown, `difficult`.
- **HTR**: region→line→word hierarchy + reading order; baseline + auto-mask + transcription.
- **Multimodal** (one Arrow store, modality-discriminated columns + `ModalityViewer` interface): image=Pixi (have) · **video=Pixi `VideoSource` sprite + overlay + DOM timeline** · audio=peaks.js · text=DOM spans. Sequence: image → text+embeddings → audio → video.
- **Inference streaming at scale** (~1M images): attach ML backends (e.g. NVIDIA **LocateAnything** VLM grounding → boxes/points/masks). Predictions stream back as Arrow RecordBatches → `appendManyLocal` (O(appended)) → progressive render. Next: an `InferenceProvider` abstraction parallel to the transport; render-side culling/ParticleContainer for the volume.
- **Persistence/data-flow gaps** (from the read/write trace): `X-Deleted-Ids` header overflows on bulk delete (>~500 ids) → move to body; field overlays not materialized into the cached table until save; server ETag versioning is in-memory only; no autosave/WAL checkpoint. Real columnar backend (Lance) replacing `static/mock/*.arrow` (the PATCH rebuilds the whole table).

## ⏳ In flight / next actions
- **Magnetic + Scissors wiring** (user chose "wire up"): lazy `initWithImage` on first select (8 MB OpenCV) + loading state — paused pending the `assets` finding (use `Assets.load` for the image element).
- Then: apply the pixi go-native Top 5 + the remaining TS P1s, then the package restructure.

## ❌ Out of scope (decided)
- **No IIIF, no W3C Web Annotation model** (Arrow native).
- Skip: cuboid/3D boxes, pose/keypoints, depth, VQA chatbot, in-app training, the COCO model zoo.
