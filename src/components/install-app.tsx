"use client";
import { CheckCircle2, Download, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { usePwa } from "./pwa-provider";
import { useHydrated } from "@/lib/use-hydrated";

export function InstallApp() {
  const pwa = usePwa();
  const hydrated = useHydrated();
  const ios = hydrated && (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  return <div className="install-grid">
    <section className="panel install-primary">
      <span className="install-symbol"><Smartphone size={32}/></span>
      <h2>{pwa.installed ? "Your app is ready" : "Your learning, one tap away"}</h2>
      <p>{pwa.installed ? "M Tech QMS is installed and ready to use on this device."
        : "Add M Tech QMS to your home screen for a focused app window and quick access to your learning."}</p>
      {pwa.installed ? <p className="notice success"><CheckCircle2 size={18}/> Installed on this device</p>
        : pwa.canPrompt ? <button className="button primary" disabled={pwa.busy} onClick={() => void pwa.install()}>
          <Download size={18}/>{pwa.busy ? "Opening installer…" : "Install M Tech QMS"}
        </button> : <p className="notice">{ios ? "On iPhone or iPad, add the app from your browser's Share menu."
          : "Use the installation steps below. Your browser may also offer an Install button in its menu or address bar."}</p>}
      {pwa.message && <p role="status" className="notice">{pwa.message}</p>}
      {pwa.registrationError && <p role="status" className="notice error">Offline support could not be prepared. Check your connection and reload.</p>}
      <div className="install-trust"><ShieldCheck size={18}/><span>Your account stays protected. Installation does not grant quiz access or change your sign-in details.</span></div>
      {pwa.updateReady && <div className="install-update">
        <h3>An update is ready</h3><p>Finish any quiz in your other windows first. Updating reloads this page.</p>
        <button className="button" onClick={pwa.applyUpdate}><RefreshCw size={17}/> Update this app</button>
      </div>}
    </section>
    <section className="panel install-instructions">
      <h2>Install on your device</h2>
      <details open={ios || undefined}>
        <summary>iPhone & iPad</summary>
        <ol><li>Open this site in Safari.</li><li>Open <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</li>
          <li>Keep <strong>Open as Web App</strong> enabled if offered, then tap <strong>Add</strong>.</li></ol>
      </details>
      <details open={!ios || undefined}>
        <summary>Android</summary>
        <ol><li>Open this site in Chrome.</li><li>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Confirm, then launch M Tech QMS from your home screen.</li></ol>
      </details>
      <details>
        <summary>Windows & Mac</summary>
        <ol><li>Open this site in Chrome or Edge.</li><li>Choose the install icon in the address bar or the browser menu.</li>
          <li>Confirm installation. In Safari on a supported Mac, use <strong>File → Add to Dock</strong>.</li></ol>
      </details>
      <p className="muted install-note">Installation depends on your browser. Quizzes, saved progress and results require an internet connection. Keep a quiz window open until it confirms your answers are saved.</p>
    </section>
  </div>;
}
