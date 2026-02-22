"use client";

import dynamic from "next/dynamic";

const NeuralNet = dynamic(() => import("./NeuralNet"), { ssr: false });

export default function HeroNeuralNet() {
  return (
    <div className="absolute inset-0 w-full h-full z-0">
      {/* Canvas sits behind everything, receives mouse events */}
      <NeuralNet />
      {/* Vignette overlays — pointer-events-none so canvas gets the mouse */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-32 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, black)" }}
      />
    </div>
  );
}
