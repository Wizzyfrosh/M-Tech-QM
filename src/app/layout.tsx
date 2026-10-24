import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { LaunchScreen } from "@/components/launch-screen";
import { PwaProvider } from "@/components/pwa-provider";
import { appTheme, startupScreens, startupSize } from "@/lib/pwa";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "M Tech QMS", template: "%s · M Tech QMS" },
  description: "Your community learning and quiz workspace.",
  robots: { index: false, follow: false },
  applicationName: "M Tech QMS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "M Tech QMS", statusBarStyle: "default" },
  icons: { icon: [{ url: "/pwa/icon/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa/icon/180", sizes: "180x180", type: "image/png" }] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: appTheme };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {startupScreens.map(screen => <link key={startupSize(screen)} rel="apple-touch-startup-image"
          href={`/pwa/startup/${startupSize(screen)}`}
          media={`(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`}/>)}
        <script id="qms-theme" nonce={nonce} dangerouslySetInnerHTML={{ __html:
          `try{document.documentElement.dataset.theme=localStorage.getItem('qms-theme-v1')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`
        }}/>
      </head>
      <body>
        <LaunchScreen/>
        <noscript><style>{"#qms-launch-screen{display:none}"}</style></noscript>
        <PwaProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        </PwaProvider>
      </body>
    </html>
  );
}
