import { ImageResponse } from "next/og";
import { getCgMarkDataUrl } from "@/lib/brand-assets";

// Chrome's install criteria require a manifest icons array with BOTH a
// 192px and a 512px entry — the special icon.tsx convention only
// generates one size per file, so this is a plain route handler for the
// second size, referenced directly from manifest.ts.
export async function GET() {
  const markUrl = await getCgMarkDataUrl();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markUrl} width={192 * 0.82} height={192 * 0.82} alt="" />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
