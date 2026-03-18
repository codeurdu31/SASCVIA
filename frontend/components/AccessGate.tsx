"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthProvider";
import { getAccessStatus, requestAccess, AccessStatus } from "@/lib/api";

interface AccessGateProps {
  children: React.ReactNode;
  onAccessInfo?: (info: AccessStatus) => void;
}

/**
 * Gate d'accès : vérifie que l'utilisateur connecté est approuvé.
 * - Approuvé → affiche children
 * - Pending → affiche "demande en attente"
 * - Denied → affiche "accès refusé"
 * - Unknown → affiche bouton "Demander l'accès"
 */
export default function AccessGate({ children, onAccessInfo }: AccessGateProps) {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!user?.email) return;
    setChecking(true);
    try {
      const status = await getAccessStatus(user.email);
      setAccessStatus(status);
      onAccessInfo?.(status);
    } catch {
      setAccessStatus({ status: "unknown", role: "user", quota_limit: 0 });
    } finally {
      setChecking(false);
    }
  }, [user?.email, onAccessInfo]);

  useEffect(() => {
    if (user?.email) {
      checkAccess();
    } else {
      setAccessStatus(null);
    }
  }, [user?.email, checkAccess]);

  // Auth en cours de chargement
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Pas connecté → bouton Google
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Connecte-toi pour commencer
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Un compte Google suffit pour acceder a l'application.
          </p>
        </div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-6 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuer avec Google
        </button>
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email || "";
  const avatarUrl = user.user_metadata?.avatar_url || "";

  // Vérification en cours → affiche l'app directement (optimistic)
  // On bloquera seulement si le statut revient "denied" ou "unknown"
  if (checking || !accessStatus) {
    return <>{children}</>;
  }

  // Accès approuvé → affiche l'app
  if (accessStatus.status === "approved") {
    return <>{children}</>;
  }

  // Demande en attente
  if (accessStatus.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Demande en attente
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            Ta demande d'acces a ete envoyee. Tu recevras un email quand elle sera acceptee.
          </p>
        </div>
        <button
          onClick={checkAccess}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Verifier a nouveau
        </button>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Se deconnecter
        </button>
      </div>
    );
  }

  // Accès refusé
  if (accessStatus.status === "denied") {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Acces refuse
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ta demande n'a pas ete acceptee.
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Se deconnecter
        </button>
      </div>
    );
  }

  // Statut inconnu → bouton demander l'accès
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
        <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Acces restreint
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Cette application est en acces limite. Envoie une demande pour obtenir l'acces.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        )}
        <div className="text-left">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{displayName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
        </div>
      </div>
      <button
        onClick={async () => {
          if (requesting) return;
          setRequesting(true);
          try {
            const result = await requestAccess(
              user.email!,
              displayName,
              avatarUrl
            );
            setAccessStatus(result);
          } catch {
            // Fallback
          } finally {
            setRequesting(false);
          }
        }}
        disabled={requesting}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
      >
        {requesting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Envoi en cours...
          </>
        ) : (
          "Demander l'acces"
        )}
      </button>
      <button
        onClick={signOut}
        className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        Se deconnecter
      </button>
    </div>
  );
}
