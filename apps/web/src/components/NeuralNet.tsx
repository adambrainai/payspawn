"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connections: number[];
}

interface Pulse {
  from: number;
  to: number;
  progress: number;
  speed: number;
  alpha: number;
}

const ORANGE = "#F65B1A";
const NODE_COUNT = 100;
const CONNECTION_DIST = 210;
const PULSE_INTERVAL = 20; // frames between new pulses
const MOUSE_REPEL_RADIUS = 150;
const MOUSE_REPEL_STRENGTH = 0.014;

export default function NeuralNet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    const parent = canvas.parentElement || document.body;
    let W = parent.offsetWidth;
    let H = parent.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    // --- Build nodes — grid-seeded so coverage is even, no dead zones ---
    const cols = Math.ceil(Math.sqrt(NODE_COUNT * (W / H)));
    const rows = Math.ceil(NODE_COUNT / cols);
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: (col + 0.3 + Math.random() * 0.4) * (W / cols),
        y: (row + 0.3 + Math.random() * 0.4) * (H / rows),
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: Math.random() * 1.8 + 1.2,
        connections: [],
      };
    });

    const pulses: Pulse[] = [];
    let frame = 0;

    // Build initial connections
    function buildConnections() {
      for (const n of nodes) n.connections = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < CONNECTION_DIST) {
            nodes[i].connections.push(j);
            nodes[j].connections.push(i);
          }
        }
      }
    }

    // Spawn a random pulse
    function spawnPulse() {
      // pick a random node that has connections
      const candidates = nodes.filter((n) => n.connections.length > 0);
      if (!candidates.length) return;
      const fromNode = candidates[Math.floor(Math.random() * candidates.length)];
      const fromIdx = nodes.indexOf(fromNode);
      const toIdx = fromNode.connections[Math.floor(Math.random() * fromNode.connections.length)];
      pulses.push({
        from: fromIdx,
        to: toIdx,
        progress: 0,
        speed: Math.random() * 0.004 + 0.003,
        alpha: Math.random() * 0.5 + 0.5,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Update node positions
      for (const node of nodes) {
        // Mouse repulsion
        const mdx = node.x - mouse.current.x;
        const mdy = node.y - mouse.current.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < MOUSE_REPEL_RADIUS && mdist > 0) {
          const force = (1 - mdist / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_STRENGTH;
          node.vx += (mdx / mdist) * force * 18;
          node.vy += (mdy / mdist) * force * 18;
        }

        // Damping
        node.vx *= 0.98;
        node.vy *= 0.98;

        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x < 0) { node.x = 0; node.vx *= -1; }
        if (node.x > W) { node.x = W; node.vx *= -1; }
        if (node.y < 0) { node.y = 0; node.vy *= -1; }
        if (node.y > H) { node.y = H; node.vy *= -1; }
      }

      buildConnections();

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (const j of nodes[i].connections) {
          if (j <= i) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const alpha = (1 - dist / CONNECTION_DIST) * 0.32;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(246,91,26,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }

      // Draw pulses
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p];
        pulse.progress += pulse.speed;

        if (pulse.progress >= 1) {
          // Chain: continue from destination
          if (Math.random() > 0.25 && nodes[pulse.to].connections.length > 0) {
            const next = nodes[pulse.to].connections[
              Math.floor(Math.random() * nodes[pulse.to].connections.length)
            ];
            pulses.push({
              from: pulse.to,
              to: next,
              progress: 0,
              speed: Math.random() * 0.004 + 0.003,
              alpha: pulse.alpha * 0.88,
            });
          }
          pulses.splice(p, 1);
          continue;
        }

        const fromNode = nodes[pulse.from];
        const toNode = nodes[pulse.to];
        const px = fromNode.x + (toNode.x - fromNode.x) * pulse.progress;
        const py = fromNode.y + (toNode.y - fromNode.y) * pulse.progress;

        // Glow
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 10);
        grd.addColorStop(0, `rgba(246,91,26,${pulse.alpha})`);
        grd.addColorStop(0.4, `rgba(255,120,50,${pulse.alpha * 0.5})`);
        grd.addColorStop(1, "rgba(246,91,26,0)");
        ctx.beginPath();
        ctx.fillStyle = grd;
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,160,80,${pulse.alpha})`;
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw nodes
      for (const node of nodes) {
        const isNearMouse =
          Math.sqrt((node.x - mouse.current.x) ** 2 + (node.y - mouse.current.y) ** 2) < MOUSE_REPEL_RADIUS;

        if (isNearMouse) {
          // Glow on hover proximity
          const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 5);
          g.addColorStop(0, "rgba(246,91,26,0.4)");
          g.addColorStop(1, "rgba(246,91,26,0)");
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.arc(node.x, node.y, node.radius * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = ORANGE;
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.fillStyle = "rgba(246,91,26,0.55)";
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Spawn pulses
      if (frame % PULSE_INTERVAL === 0) spawnPulse();
      if (frame % (PULSE_INTERVAL * 3) === 0) spawnPulse(); // burst occasionally

      frame++;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    // Handle resize — use parent for full-bleed canvas
    const onResize = () => {
      W = parent.offsetWidth;
      H = parent.offsetHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    // Mouse tracking via window so overlapping elements don't block it
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
    };
    window.addEventListener("mousemove", onMouseMove);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
