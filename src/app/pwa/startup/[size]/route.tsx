import { startupScreens, startupSize } from "@/lib/pwa";
import { pwaArtwork } from "@/lib/pwa-artwork";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return startupScreens.map(screen => ({ size: startupSize(screen) })); }
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = (await params).size;
  const screen = startupScreens.find(value => startupSize(value) === requested);
  if (!screen) return new Response("Not found", { status: 404 });
  return pwaArtwork(screen.width * screen.ratio, screen.height * screen.ratio, false);
}
