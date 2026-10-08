"use client";

import { useLayoutEffect, useRef } from "react";

// A round avatar with initials that sit in the middle of the circle whatever font is in use.
// The browser centers the line box of a text, not the shape of the capital letters, and the gap
// between the two changes with the font. So the letters are measured once with the real font and
// placed by their own height.
const PROBE = 400;

export function InitialsAvatar({
  initials,
  size = 34,
  color = "var(--mantine-color-brand-filled)",
  label,
}: {
  initials: string;
  size?: number;
  color?: string;
  label?: string;
}) {
  const text = useRef<SVGTextElement>(null);
  const fontSize = Math.round(size * 0.4 * 100) / 100;
  // Before the measure (and on the server): a capital letter is about 0.72 em high.
  const guess = size / 2 + fontSize * 0.36;

  useLayoutEffect(() => {
    const element = text.current;
    if (!element) return;
    const place = () => {
      const style = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      // The browser reports the letter height in whole pixels, so it is measured big and scaled down.
      context.font = `${style.fontWeight} ${PROBE}px ${style.fontFamily}`;
      const metrics = context.measureText(initials);
      if (!metrics.actualBoundingBoxAscent) return;
      const scale = fontSize / PROBE;
      const y = size / 2 + ((metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) * scale) / 2;
      element.setAttribute("y", y.toFixed(2));
    };
    place();
    // The web font arrives after the first paint.
    void document.fonts?.ready.then(place);
  }, [initials, size, fontSize]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? initials}
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
      <text
        ref={text}
        x={size / 2}
        y={guess}
        fill="#fff"
        fontSize={fontSize}
        fontWeight={600}
        textAnchor="middle"
        style={{ fontFamily: "inherit", userSelect: "none" }}
      >
        {initials}
      </text>
    </svg>
  );
}
