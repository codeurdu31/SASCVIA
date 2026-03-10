"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import HistoryPanel from "./HistoryPanel";
import AdminPanel from "./AdminPanel";
import type { LoadedCandidature, LoadedContactSearch } from "./HistoryPanel";

export default function UserMenu({ onLoadCandidature, onLoadContactSearch, isAdmin = false }: {
  onLoadCandidature?: (data: LoadedCandidature) => void;
  onLoadContactSearch?: (data: LoadedContactSearch) => void;
  isAdmin?: boolean;
}) {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) {
    return <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />;
  }

  // Pas connecté → bouton Google
  if (!user) {
    return (
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-sm"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Connexion
      </button>
    );
  }

  // Connecté → avatar + menu déroulant
  const avatarUrl = user.user_metadata?.avatar_url;
  const displayName = user.user_metadata?.full_name || user.email || "";

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 transition-all hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
          {displayName.split(" ")[0]}
        </span>
      </button>

      {menuOpen && (
        <>
          {/* Overlay invisible pour fermer le menu */}
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-lg">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={() => { setShowHistory(true); setMenuOpen(false); }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Mes candidatures
            </button>
            {isAdmin && (
              <button
                onClick={() => { setShowAdmin(true); setMenuOpen(false); }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                Gerer les acces
              </button>
            )}
            <button
              onClick={() => { signOut(); setMenuOpen(false); }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              Se deconnecter
            </button>
          </div>
        </>
      )}

      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
          onSelect={(data) => { onLoadCandidature?.(data); setShowHistory(false); }}
          onSelectContactSearch={(data) => { onLoadContactSearch?.(data); setShowHistory(false); }}
        />
      )}

      {showAdmin && user?.email && (
        <AdminPanel
          adminEmail={user.email}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  );
}
