"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaContextValue = {
  installed: boolean; canPrompt: boolean; busy: boolean; message: string;
  registrationError: boolean; updateReady: boolean;
  install(): Promise<void>; applyUpdate(): void;
};
const PwaContext = createContext<PwaContextValue | null>(null);
const standaloneSnapshot = () => typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
const serverSnapshot = () => false;
function subscribeStandalone(notify: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const standalone = useSyncExternalStore(subscribeStandalone, standaloneSnapshot, serverSnapshot);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [registrationError, setRegistrationError] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);
  const requestedUpdate = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.appReady = "true";
    const syncTheme = () => document.querySelector('meta[name="theme-color"]')?.setAttribute("content",
      document.documentElement.dataset.theme === "dark" ? "#101522" : "#6556d8");
    syncTheme();
    window.addEventListener("qms-theme-change", syncTheme);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
      setMessage("");
    };
    const didInstall = () => { setInstalled(true); setDeferred(null); setMessage(""); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const workerChanged = () => {
      if (!disposed && worker?.state === "installed" && navigator.serviceWorker.controller && registration?.waiting)
        setWaiting(registration);
    };
    const updateFound = () => {
      worker = registration?.installing ?? null;
      worker?.addEventListener("statechange", workerChanged);
    };
    const controllerChanged = () => { if (requestedUpdate.current) window.location.reload(); };
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(value => {
          if (disposed) return;
          registration = value;
          if (value.waiting) setWaiting(value);
          value.addEventListener("updatefound", updateFound);
          updateFound();
        }).catch(() => { if (!disposed) setRegistrationError(true); });
    }
    return () => {
      disposed = true;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      window.removeEventListener("qms-theme-change", syncTheme);
      registration?.removeEventListener("updatefound", updateFound);
      worker?.removeEventListener("statechange", workerChanged);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  async function install() {
    if (!deferred || busy) return;
    const event = deferred;
    setDeferred(null); setBusy(true); setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted"
        ? "Installation requested. Your browser will finish adding the app."
        : "Installation cancelled. You can still install from your browser menu.");
    } catch { setMessage("Use your browser menu to install the app, or reload and try again."); }
    finally { setBusy(false); }
  }
  function applyUpdate() {
    if (!waiting?.waiting) return;
    requestedUpdate.current = true;
    waiting.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }
  return <PwaContext.Provider value={{ installed: standalone || installed, canPrompt: !!deferred,
    busy, message, registrationError, updateReady: !!waiting, install, applyUpdate }}>
    {children}
  </PwaContext.Provider>;
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("PWA controls require PwaProvider.");
  return context;
}
