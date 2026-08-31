import type { SceneCtx } from "./scene/SceneContext";
import type { Globe } from "./scene/Globe";
import type { LedgerView } from "./scene/views/LedgerView";
import type { HyperView } from "./scene/views/HyperView";

// THE DEV TUNING PANEL, lifted out of Engine.ts (2026-08-31).
//
// Dev-only by construction — the panel is a dynamic import that never enters the normal bundle
// (src/engine/tune.ts is the contract), reachable through `?tune` at load or, in `next dev`, the
// corner switch this mounts. It shared nothing with the Engine's real work: all three of its
// fields were its own, and everything it needs from the Engine arrives through the host below.
//
// Keeping it here rather than in the Engine is the point — an engine that also owns a piece of
// developer UI makes every reader of the render loop scroll past it.

export interface DevTuneHost {
  ctx: SceneCtx;
  globe: Globe;
  ledger: LedgerView;
  layers: HyperView;
  /** Re-runs the whole theme thread, so a light-look dial lands exactly like a real flip. */
  refreshTheme(): void;
  /** The Engine has been disposed — an in-flight open must throw its panel away. */
  disposed(): boolean;
}

export class DevTunePanel {
  private readonly h: DevTuneHost;
  private _devTune?: { dispose(): void };
  private _tuneBtn?: HTMLButtonElement;

  constructor(host: DevTuneHost) {
    this.h = host;
  }

  /** True while a panel is mounted — the Engine's dispose path asks before tearing down. */
  get open_(): boolean {
    return !!this._devTune;
  }

  /** Tear down both the panel and its switch. Called from Engine.dispose(). */
  dispose(): void {
    this._tuneBtn?.remove();
    this._devTune?.dispose();
  }

  // ── The dev tuning panel: one open path, whether the URL flag or the switch asked ──────────
  // `_tuneOpening` is the re-entrancy guard: the import is async, so without it a second click
  // during the load mounts a second panel bound to the same objects.
  private _tuneOpening = false;
  async open(): Promise<void> {
    if (this._devTune || this._tuneOpening) return;
    this._tuneOpening = true;
    try {
      const m = await import("./devTune");
      if (this.h.disposed()) return;
      this._devTune = await m.mountDevTune({
        ledger: this.h.ledger,
        hyper: this.h.layers,
        camera: this.h.ctx.camera,
        controls: this.h.ctx.controls,
        // The light-look group's onChange re-runs the whole theme thread (token re-read, scene
        // map rebuild, bloom re-apply) so every dial lands the same way a real flip does.
        refreshTheme: () => this.h.refreshTheme(),
      });
      if (this.h.disposed()) this._devTune.dispose();
    } finally {
      this._tuneOpening = false;
      this._syncSwitch();
    }
  }

  close(): void {
    this._devTune?.dispose();
    this._devTune = undefined;
    this._syncSwitch();
  }

  private _syncSwitch(): void {
    const b = this._tuneBtn;
    if (!b) return;
    const on = !!this._devTune;
    b.setAttribute("aria-pressed", String(on));
    b.style.opacity = on ? "1" : "0.55";
  }

  // The switch itself. Plain DOM beside Stats, built here rather than in devTune.ts because it has
  // to exist BEFORE the panel module loads — it is what asks for the load.
  mountSwitch(): void {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "tune";
    b.title = "Live-tune the scene look (dev only). Same panel as ?tune.";
    b.setAttribute("aria-pressed", "false");
    // Offset right of Next's own dev-tools badge, which claims the bottom-left corner in `next dev`
    // and was covering half this pill — including its hit area.
    Object.assign(b.style, {
      position: "fixed",
      left: "66px",
      bottom: "8px",
      zIndex: "10000",
      padding: "3px 8px",
      font: "11px/1.4 ui-monospace, monospace",
      letterSpacing: "0.06em",
      color: "#fff",
      background: "rgba(0,0,0,0.72)",
      border: "1px solid rgba(255,255,255,0.22)",
      borderRadius: "4px",
      cursor: "pointer",
      opacity: "0.55",
    } satisfies Partial<CSSStyleDeclaration>);
    b.addEventListener("click", () => {
      if (this._devTune) this.close();
      else void this.open();
    });
    document.body.appendChild(b);
    this._tuneBtn = b;
  }
}
