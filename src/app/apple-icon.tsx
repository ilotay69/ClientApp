import { ImageResponse } from "next/og";
import { getCgMarkDataUrl } from "@/lib/brand-assets";

// iOS ignores the manifest's icons array for "Add to Home Screen" and
// looks for this file specifically.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
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
        <img src={markUrl} width={size.width * 0.78} height={size.height * 0.78} alt="" />
      </div>
    ),
    { ...size }
  );
}
