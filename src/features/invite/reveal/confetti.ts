// A short burst of paper pieces on a canvas. No library: ~100 rectangles for under two seconds.

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; spin: number; angle: number; color: string };

export function burst(canvas: HTMLCanvasElement, origin: { x: number; y: number }, colors: string[], count = 110): () => void {
  const context = canvas.getContext("2d");
  if (!context || colors.length === 0) return () => {};
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      spin: (Math.random() - 0.5) * 0.5,
      angle: Math.random() * Math.PI,
      color: colors[i % colors.length],
    };
  });

  const started = performance.now();
  const LIFE = 1900;
  let frame = 0;
  let last = started;
  const draw = (now: number) => {
    const step = Math.min(2, (now - last) / 16.7);
    last = now;
    const age = now - started;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, 1 - Math.max(0, age - LIFE * 0.6) / (LIFE * 0.4));
    for (const p of pieces) {
      p.vx *= 0.985 ** step;
      p.vy = p.vy * 0.985 ** step + 0.32 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.angle += p.spin * step;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = p.color;
      context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.angle * 1.7)));
      context.restore();
    }
    if (age < LIFE) frame = requestAnimationFrame(draw);
    else context.clearRect(0, 0, width, height);
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    context.clearRect(0, 0, width, height);
  };
}

// Resolves a CSS colour expression (custom properties, color-mix) to something a canvas accepts.
export function resolveColor(host: HTMLElement, expression: string): string {
  const probe = document.createElement("span");
  probe.style.color = expression;
  probe.style.display = "none";
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || "#888";
}
