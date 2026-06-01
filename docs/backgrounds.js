// Animated background: cyan network graph — drifting nodes connected by
// distance-based lines. Subtle, data-themed, low CPU.

let canvas = null;
let ctx = null;
let rafId = null;
let resizeHandler = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.id = "bg-canvas";
  canvas.style.cssText = "position:fixed; inset:0; z-index:-1; pointer-events:none;";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
}

function sizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function initBackground() {
  // Respect reduced-motion preference: no background at all
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  ensureCanvas();
  sizeCanvas();
  resizeHandler = () => sizeCanvas();
  window.addEventListener("resize", resizeHandler);
  renderNetwork();
}

function renderNetwork() {
  const NODE_RGB    = "56, 189, 248";  // sky-blue (cyan)
  const NODE_COUNT  = 115;
  const MAX_DIST    = 175;
  const NODE_ALPHA  = 0.45;
  const LINE_ALPHA  = 0.22;

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: Math.random() * W(),
      y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: 1 + Math.random() * 1.5
    });
  }

  function frame() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    // Move + bounce off edges
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx = -n.vx;
      if (n.y < 0 || n.y > h) n.vy = -n.vy;
    }

    // Connection lines (drawn first → nodes sit on top)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_DIST) continue;
        const a = (1 - dist / MAX_DIST) * LINE_ALPHA;
        ctx.strokeStyle = `rgba(${NODE_RGB}, ${a})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }

    // Nodes
    ctx.fillStyle = `rgba(${NODE_RGB}, ${NODE_ALPHA})`;
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(frame);
  }
  frame();
}
