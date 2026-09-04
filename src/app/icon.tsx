import { ImageResponse } from "next/og";

// Also doubles as the browser-tab favicon reference — one 512x512 source
// covers both, browsers downscale for the tab automatically.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#333333",
        }}
      >
        <span
          style={{
            fontSize: 260,
            fontWeight: 700,
            color: "#e93e3f",
            fontFamily: "sans-serif",
          }}
        >
          CG
        </span>
      </div>
    ),
    { ...size }
  );
}
