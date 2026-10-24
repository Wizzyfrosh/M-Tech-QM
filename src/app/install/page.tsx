import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { InstallApp } from "@/components/install-app";
export const metadata = { title: "Install the app" };

export default function InstallPage() {
  return <main id="main" className="install-page">
    <header className="install-header"><Brand/></header>
    <Link href="/dashboard" className="back-link"><ArrowLeft size={17}/> Back to your workspace</Link>
    <div className="page-heading"><div><span className="eyebrow">M TECH QMS · ON YOUR DEVICE</span>
      <h1>A dedicated space to keep learning.</h1><p>Install the web app from your browser. No app-store download needed.</p></div></div>
    <InstallApp/>
  </main>;
}
