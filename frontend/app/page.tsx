"use client";

import { useState, useEffect, useCallback } from "react";
import AnalyzerForm from "@/components/AnalyzerForm";
import UserMenu from "@/components/UserMenu";
import AccessGate from "@/components/AccessGate";
import type { AccessStatus } from "@/lib/api";
import type { LoadedCandidature, LoadedContactSearch } from "@/components/HistoryPanel";

type DeviceMode = "desktop" | "mobile";

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm transition-all hover:bg-gray-100 dark:hover:bg-gray-700"
      title={dark ? "Mode clair" : "Mode sombre"}
    >
      {dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
    </button>
  );
}

function DeviceToggle({ mode, onChange }: { mode: DeviceMode; onChange: (m: DeviceMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1">
      <button
        onClick={() => onChange("desktop")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          mode === "desktop"
            ? "bg-blue-600 text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
        }`}
      >
        Desktop
      </button>
      <button
        onClick={() => onChange("mobile")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          mode === "mobile"
            ? "bg-blue-600 text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
        }`}
      >
        Mobile
      </button>
    </div>
  );
}

export default function Home() {
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [loadedCandidature, setLoadedCandidature] = useState<LoadedCandidature | null>(null);
  const [loadedContactSearch, setLoadedContactSearch] = useState<LoadedContactSearch | null>(null);
  const [accessInfo, setAccessInfo] = useState<AccessStatus | null>(null);

  const handleLoadCandidature = useCallback((data: LoadedCandidature) => {
    setLoadedCandidature(data);
  }, []);

  const handleLoadContactSearch = useCallback((data: LoadedContactSearch) => {
    setLoadedContactSearch(data);
  }, []);

  const containerClass =
    device === "mobile"
      ? "mx-auto max-w-[390px] border-x border-gray-200 dark:border-gray-700 min-h-screen shadow-lg"
      : "mx-auto max-w-2xl";

  return (
    <main className="min-h-screen px-4 py-8 sm:py-16">
      {/* Toolbar flottante */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <DeviceToggle mode={device} onChange={setDevice} />
        <ThemeToggle />
        <UserMenu
          onLoadCandidature={handleLoadCandidature}
          onLoadContactSearch={handleLoadContactSearch}
          isAdmin={accessInfo?.role === "admin"}
        />
      </div>

      <div className={containerClass}>
        {/* En-tete */}
        <div className="mb-8 sm:mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Postule plus vite,{" "}
            <span className="text-blue-600 dark:text-blue-400">postule mieux.</span>
          </h1>
          <p className="mt-3 text-base sm:text-lg text-gray-500 dark:text-gray-400">
            Importe ton CV et colle une offre depuis LinkedIn, Indeed, Welcome to the Jungle ou tout autre site.
            L&apos;IA analyse tout et te prepare une candidature sur-mesure.
          </p>
        </div>

        {/* Gate d'accès — vérifie que l'utilisateur est approuvé */}
        <AccessGate onAccessInfo={setAccessInfo}>
          {/* Carte principale */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 sm:p-8 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <AnalyzerForm
              loadedCandidature={loadedCandidature}
              onCandidatureLoaded={() => setLoadedCandidature(null)}
              loadedContactSearch={loadedContactSearch}
              onContactSearchLoaded={() => setLoadedContactSearch(null)}
            />
          </div>
        </AccessGate>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          ProjetSASIA - Propulse par Claude -{" "}
          <a href="https://esilv.fr" className="underline hover:text-gray-600 dark:hover:text-gray-300">
            ESILV Paris
          </a>
        </p>
      </div>
    </main>
  );
}
