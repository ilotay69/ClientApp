import { ImageResponse } from "next/og";
import { getCgMarkDataUrl } from "@/lib/brand-assets";

// Also doubles as the browser-tab favicon reference — one 512x512 source
// covers both, browsers downscale for the tab automatically.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
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
        <img src={markUrl} width={size.width * 0.82} height={size.height * 0.82} alt="" />
      </div>
    ),
    { ...size }
  );
}
