"use client";

import { useEffect, useRef, useState } from "react";

/** A draw-your-signature pad — finger, stylus, or mouse.
 *
 * Deliberately no library: this is line-drawing on a <canvas>, which the
 * Canvas 2D API and the Pointer Events API (one event model that already
 * covers touch, pen, and mouse) handle natively. Adding a dependency for
 * something this small would be the wrong trade for an 11-dependency app.
 *
 * Reports back through onChange rather than an imperative ref/handle — a
 * PNG data URL once a stroke ends, or null once cleared — so the parent
 * just holds it in state like any other form field, no ref plumbing. */
export function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Backs the canvas at its real pixel density so a signature drawn on a
  // retina screen doesn't come out blurry — the element's CSS size and its
  // drawing-buffer size are two different things, and only matching them
  // to devicePixelRatio keeps a 1px stroke looking like one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1e293b";
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasDrawn) setHasDrawn(true);
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        // Otherwise a finger drawing a signature also scrolls the page on
        // a phone — the one thing a signature pad must not do.
        className={`h-36 w-full touch-none rounded-lg border bg-white ${
          disabled ? "cursor-not-allowed border-slate-200 bg-slate-50" : "border-slate-300"
        }`}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">Sign above with your finger, stylus, or mouse.</span>
        {hasDrawn && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
