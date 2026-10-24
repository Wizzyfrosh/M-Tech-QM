import { iconSizes } from "@/lib/pwa";
import { pwaArtwork } from "@/lib/pwa-artwork";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return iconSizes.map(size => ({ size: String(size) })); }
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!iconSizes.some(value => value === size)) return new Response("Not found", { status: 404 });
  return pwaArtwork(size, size, true);
}
