import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "M Tech QMS", template: "%s · M Tech QMS" },
  description: "Your community learning and quiz workspace.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="qms-theme" dangerouslySetInnerHTML={{ __html:
          `try{document.documentElement.dataset.theme=localStorage.getItem('qms-theme-v1')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`
        }}/>
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
