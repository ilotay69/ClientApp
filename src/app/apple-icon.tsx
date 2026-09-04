import { ImageResponse } from "next/og";

// iOS ignores the manifest's icons array for "Add to Home Screen" and
// looks for this file specifically.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            fontSize: 92,
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
