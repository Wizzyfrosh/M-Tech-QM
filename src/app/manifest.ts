import type { MetadataRoute } from "next";
import { appBackground, appName, appTheme } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: appName,
    short_name: "M Tech QMS",
    description: "Your private programming lessons, quizzes and learning progress.",
    lang: "en",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: appBackground,
    theme_color: appTheme,
    orientation: "any",
    prefer_related_applications: false,
    categories: ["education", "productivity"],
    icons: [
      { src: "/pwa/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
