"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";

const key = "qms-theme-v1";
function snapshot() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function subscribe(onChange: () => void) {
  function storage(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    onChange();
  }
  window.addEventListener("qms-theme-change", onChange);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("qms-theme-change", onChange);
    window.removeEventListener("storage", storage);
  };
}
export function ThemeToggle() {
  const hydrated = useHydrated();
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  function toggle() {
    const next = snapshot() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(key, next); } catch { /* Theme still works when storage is unavailable. */ }
    window.dispatchEvent(new Event("qms-theme-change"));
  }
  return <button type="button" className="button theme-toggle" onClick={toggle} disabled={!hydrated}
    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
    {theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
    <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
  </button>;
}
