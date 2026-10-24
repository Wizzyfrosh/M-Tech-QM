import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { appBackground, appName, appTheme } from "./pwa";

// Compose native PNG assets from the supplied logo; no external image service.
export async function pwaArtwork(width: number, height: number, icon: boolean) {
  const source = await readFile(join(process.cwd(), "public/m-tech-hub-logo.jpg"));
  const logo = `data:image/jpeg;base64,${source.toString("base64")}`;
  const unit = icon ? width : Math.min(width, height);
  const logoWidth = unit * (icon ? 0.68 : 0.62);
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: icon ? "#ffffff" : appBackground,
      alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#202539" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        width: unit * 0.82, padding: unit * 0.055, background: "#ffffff", borderRadius: unit * 0.05 }}>
        {/* ImageResponse renders the original logo into a newly composed PNG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={logoWidth} height={logoWidth * 472 / 1242} />
        <div style={{ display: "flex", marginTop: unit * 0.045, color: appTheme,
          fontSize: unit * (icon ? 0.12 : 0.065), fontWeight: 700, letterSpacing: unit * 0.006 }}>
          {icon ? "QMS" : appName}
        </div>
      </div>
      {!icon && <div style={{ display: "flex", marginTop: unit * 0.05, fontSize: unit * 0.028,
        color: "#626d82", letterSpacing: unit * 0.004 }}>LEARN. PRACTISE. PROGRESS.</div>}
    </div>,
    { width, height, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
