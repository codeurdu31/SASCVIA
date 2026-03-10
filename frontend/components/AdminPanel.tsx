"use client";

import { useState, useEffect } from "react";
import { getPendingUsers, decideAccess, PendingUser } from "@/lib/api";

interface AdminPanelProps {
  adminEmail: string;
  onClose: () => void;
}

export default function AdminPanel({ adminEmail, onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await getPendingUsers(adminEmail);
      setUsers(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(email: string, decision: "approved" | "denied", quotaLimit: number = 20) {
    setDeciding(email);
    try {
      await decideAccess(adminEmail, email, decision, quotaLimit);
      setUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, status: decision } : u))
      );
    } catch {
      // silently fail
    } finally {
      setDeciding(null);
    }
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Gestion des acces
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            Aucune demande pour le moment.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Demandes en attente */}
            {pending.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-3">
                  En attente ({pending.length})
                </h3>
                <div className="space-y-3">
                  {pending.map((u) => (
                    <UserCard
                      key={u.email}
                      user={u}
                      deciding={deciding === u.email}
                      onApprove={() => handleDecision(u.email, "approved")}
                      onDeny={() => handleDecision(u.email, "denied")}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Autres (approuvés / refusés) */}
            {others.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 mt-4">
                  Historique ({others.length})
                </h3>
                <div className="space-y-2">
                  {others.map((u) => (
                    <div
                      key={u.email}
                      className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 text-xs font-bold text-white">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.status === "approved"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {u.status === "approved" ? "Approuve" : "Refuse"}
                        </span>
                        {/* Bouton pour changer la décision */}
                        {u.status === "approved" ? (
                          <button
                            onClick={() => handleDecision(u.email, "denied")}
                            disabled={deciding === u.email}
                            className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                          >
                            Revoquer
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDecision(u.email, "approved")}
                            disabled={deciding === u.email}
                            className="text-xs text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                          >
                            Approuver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserCard({
  user,
  deciding,
  onApprove,
  onDeny,
}: {
  user: PendingUser;
  deciding: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const requestDate = user.requested_at
    ? new Date(user.requested_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-800 text-sm font-bold text-amber-800 dark:text-amber-200">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            {requestDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{requestDate}</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onApprove}
          disabled={deciding}
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {deciding ? "..." : "Accepter"}
        </button>
        <button
          onClick={onDeny}
          disabled={deciding}
          className="flex-1 rounded-lg border border-red-300 dark:border-red-700 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
