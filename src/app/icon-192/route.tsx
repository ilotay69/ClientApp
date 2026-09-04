import { ImageResponse } from "next/og";

// Chrome's install criteria require a manifest icons array with BOTH a
// 192px and a 512px entry — the special icon.tsx convention only
// generates one size per file, so this is a plain route handler for the
// second size, referenced directly from manifest.ts.
export async function GET() {
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
            fontSize: 100,
            fontWeight: 700,
            color: "#e93e3f",
            fontFamily: "sans-serif",
          }}
        >
          CG
        </span>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
