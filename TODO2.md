# TODO2 — ra-anno (post-migration / draw-tools / schema)

Snapshot of remaining work after the 2026-06-23 session. Supersedes the now-stale
`TODO.md` for current priorities. **No IIIF / no W3C Web Annotation** — Apache Arrow
is the native model.

## ✅ Done this session
- **Deno → Bun**: `@sveltejs/adapter-node` (run via `bun ./build/index.js`), `node:fs/promises`
  in API routes, Deno globals removed, `deno.json`/`deno.lock` deleted, `bun.lock`, `annotorious/` gitignored.
- **TypeScript 7 RC** all-in: `typescript@7.0.1-rc` + `@typescript/native-preview` + `svelte-check-native`.
- **All deps → latest**: Vite 8, vite-plugin-svelte 7, `@lucide/svelte` 1, bits-ui, tailwind 4.3, etc.
  `motion-dom`/`framer-motion` pinned to `12.38.0` via `overrides` (12.41 dropped `activeAnimations`, broke motion-sv).
- **Schema extended** (X-AnyLabeling-inspired, `src/lib/types/schemas.ts`): `shape_type`, `rotation`,
  `group_id`, `reading_order`, `difficult`, `links` (kie_linking), `mask` + `ShapeType`/`RelationType`/`REGION_TYPES`.
  Mock data regenerated.
- **Draw tools**: Pencil (freehand → DP-simplified polygon/baseline), Point, Line, Brush
  (RenderTexture paint + eraser) + a **raster mask overlay layer** in `ArrowDataPlugin`.
- **Brush options**: `maskMode` instance/semantic (same-label union) + **mask→polygon** vectorization
  (`traceMaskContour` + `simplifyPath`) + Toolbar toggles (MSK/POLY, INST/SEM, Eraser).

## ⚠️ Known caveats
- **`bun run check` = 20 errors, all route-level `$types`** (`src/routes/*`) — `svelte-kit sync` CLI
  generates 0 `$types.d.ts` under Kit 2.67 + Vite 8 + svelte-check-native 0.8.7, though `vite build`/dev
  generate them fine (**build is green**). App-layer tooling quirk; engine code type-checks clean.
  Revisit when TS7 GAs / svelte-check-native matures.
- **Semantic mask mode = same-label union only.** Cross-label pixel-exclusivity (subtract painted pixels
  from other-label masks) deferred — needs a batch mask-rewrite path (do in the store refactor below).
- No standalone "convert committed mask → polygon" action yet (brush-output toggle covers the create path).
- New schema fields are **data-only**: not yet surfaced in renderer/editors/sidebar (see below).

## 🎯 Next — Engine extraction (the keystone, was task #3)
Turn the editing engine into an installable, framework-agnostic TS package; SvelteKit becomes a thin binding.
- Carve `src/lib/engine/` (zero `svelte`/`$app`, single barrel `index.ts`).
- **Decouple `annotations.svelte.ts` (+ layers/undo) from Svelte runes** → plain-TS store + observer/change-events;
  thin runes adapter in `src/lib/svelte/` (Annotorious `toSvelteStore` pattern). This is what makes it a package.
- Move pure-TS in: `pixi/*` (minus `PixiCanvas.svelte`), `interaction/*`, `tools/*`, `editors/*`, `geometry`,
  `types/schemas`, `utils/{arrow,color}`, `maskOps`.
- **Layered render-engine scope**: viewer mode (no mutation) + editor mode; layers = image · raster overlays
  (masks/saliency/depth/confidence + shaders) · vector annotations · data-driven highlight/style. Renderer-agnostic (WebGPU+WebGL).
- Delete dead `src/lib/stores/undo.svelte.ts`.

## 🗺️ Engine roadmap (HTR data model + perf + AI)
- **Surface the new schema fields in UI**: oriented-box editor (rotation handle), point/line/baseline editors,
  relation-drawing (`links`), reading-order panel, region-type (`REGION_TYPES`) dropdown, `difficult` toggle.
- **HTR structure**: region→line→word hierarchy (`parent_id`) + reading order; text-line = baseline + (auto) mask +
  transcription. Block model (PaddleOCR-style) preferred over kraken baselines.
- **Spatial index**: Flatbush over annotation bboxes for picking + culling (replace the O(n) scans).
- **Model-in-the-loop**: pluggable `InferenceProvider` seam (layout/baseline/SAM/HTR/embeddings; X-AnyLabeling
  model-zoo + remote-server pattern) → feed the existing prediction→draft→review path; replace the SAM mockup.
- Undo coalescing (250 ms); finish cross-label semantic mask exclusivity; mask↔polygon convert action.

## 🔭 Later / differentiators
- Table structure (rows/cols/cells); copy/paste/duplicate + cross-page propagation; minimap/overview;
  zoom-to-annotation; comments/issues + inter-annotator agreement.
- **Real persistence backend** (Lance/columnar) replacing the mock in-memory + `static/mock/*.arrow`
  (the API rebuilds the whole table per PATCH — won't scale).
- PAGE-XML / ALTO / COCO export — **TBD / your call** (these are HTR-domain formats, NOT W3C/IIIF).

## ❌ Out of scope (decided)
- **No IIIF, no W3C Web Annotation model** (Arrow native).
- Skip: cuboid/3D boxes, video tracking, pose/keypoints, depth, VQA chatbot, in-app training, the COCO model zoo.
