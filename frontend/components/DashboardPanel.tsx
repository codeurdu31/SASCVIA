"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

// ---------- Types ----------

type ApplicationStatus = "saved" | "applied" | "relaunched" | "interview" | "offer" | "rejected";

interface CandidatureRow {
  id: string;
  created_at: string;
  job_title: string;
  company: string;
  score_current: number;
  score_potential: number;
  summary: string;
  status?: ApplicationStatus;
}

// Sous-onglets du dashboard
type DashboardTab = "board" | "emails" | "alerts";

// ---------- Constantes ----------

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; icon: string }> = {
  saved:      { label: "Sauvegardee",  color: "text-gray-600 dark:text-gray-400",   bg: "bg-gray-100 dark:bg-gray-800",         icon: "&#128278;" },
  applied:    { label: "Postulee",     color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-900/30",       icon: "&#128232;" },
  relaunched: { label: "Relancee",     color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30",  icon: "&#128260;" },
  interview:  { label: "Entretien",    color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30",  icon: "&#127897;" },
  offer:      { label: "Offre recue",  color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-900/30",     icon: "&#127881;" },
  rejected:   { label: "Refusee",      color: "text-red-500 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-900/30",         icon: "&#10060;" },
};

const STATUS_ORDER: ApplicationStatus[] = ["saved", "applied", "relaunched", "interview", "offer", "rejected"];

// ---------- Helpers ----------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-600 dark:text-green-400";
  if (score >= 4) return "text-orange-500 dark:text-orange-400";
  return "text-red-500 dark:text-red-400";
}

// ---------- Composant Stats ----------

function StatsBar({ items }: { items: CandidatureRow[] }) {
  const stats = useMemo(() => {
    const total = items.length;
    const byStatus: Record<string, number> = {};
    for (const s of STATUS_ORDER) byStatus[s] = 0;
    for (const item of items) byStatus[item.status ?? "saved"]++;
    const avgScore = total > 0
      ? (items.reduce((sum, i) => sum + (i.score_current ?? 0), 0) / total).toFixed(1)
      : "—";
    return { total, byStatus, avgScore };
  }, [items]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Candidatures totales</p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byStatus.applied + stats.byStatus.relaunched}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">En cours</p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.byStatus.interview}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Entretiens</p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className={`text-2xl font-bold ${Number(stats.avgScore) >= 7 ? "text-green-600" : Number(stats.avgScore) >= 4 ? "text-orange-500" : "text-gray-500"}`}>
          {stats.avgScore}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Score moyen</p>
      </div>
    </div>
  );
}

// ---------- StatusBadge ----------

function StatusBadge({ status, small }: { status: ApplicationStatus; small?: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${cfg.bg} ${cfg.color} ${
      small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    }`}>
      <span dangerouslySetInnerHTML={{ __html: cfg.icon }} />
      {cfg.label}
    </span>
  );
}

// ---------- StatusSelector ----------

function StatusSelector({
  current,
  onChange,
  onClose,
}: {
  current: ApplicationStatus;
  onChange: (s: ApplicationStatus) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute z-20 mt-1 right-0 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => { onChange(s); onClose(); }}
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
            s === current
              ? "bg-gray-100 dark:bg-gray-700 font-medium"
              : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <span dangerouslySetInnerHTML={{ __html: STATUS_CONFIG[s].icon }} />
          <span className={STATUS_CONFIG[s].color}>{STATUS_CONFIG[s].label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Tableau Kanban / Liste ----------

function BoardView({
  items,
  onStatusChange,
  onOpenDetail,
}: {
  items: CandidatureRow[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onOpenDetail: (id: string) => void;
}) {
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => (i.status ?? "saved") === filter);
  }, [items, filter]);

  return (
    <div className="space-y-4">
      {/* Filtres par statut */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            filter === "all"
              ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Toutes ({items.length})
        </button>
        {STATUS_ORDER.map((s) => {
          const count = items.filter((i) => (i.status ?? "saved") === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                filter === s
                  ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} ring-2 ring-current ring-opacity-30`
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {STATUS_CONFIG[s].label} ({count})
            </button>
          );
        })}
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-3xl mb-2">&#128203;</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune candidature</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Analyse un CV dans l&apos;onglet Candidature pour commencer
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header desktop */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-3 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div className="col-span-4">Poste</div>
            <div className="col-span-2">Statut</div>
            <div className="col-span-2 text-center">Score</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="group px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                onClick={() => onOpenDetail(item.id)}
              >
                {/* Mobile layout */}
                <div className="sm:hidden space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.job_title || "Sans titre"}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{item.company || "—"}</p>
                    </div>
                    <span className={`text-lg font-bold ${scoreColor(item.score_current)}`}>
                      {item.score_current?.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={(item.status ?? "saved") as ApplicationStatus} small />
                    <span className="text-xs text-gray-400">{formatDate(item.created_at)}</span>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.job_title || "Sans titre"}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.company || "—"}</p>
                  </div>
                  <div className="col-span-2 relative">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingStatus(editingStatus === item.id ? null : item.id); }}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <StatusBadge status={(item.status ?? "saved") as ApplicationStatus} />
                    </button>
                    {editingStatus === item.id && (
                      <StatusSelector
                        current={(item.status ?? "saved") as ApplicationStatus}
                        onChange={(s) => onStatusChange(item.id, s)}
                        onClose={() => setEditingStatus(null)}
                      />
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`text-lg font-bold ${scoreColor(item.score_current)}`}>
                      {item.score_current?.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">/10</span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenDetail(item.id); }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Voir le detail
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Onglet Emails ----------

function EmailsView() {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center space-y-3">
      <p className="text-4xl">&#128232;</p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Suivi des emails</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
        Retrouve ici tous les emails de networking envoyes, les relances et les reponses recues.
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">Bientot disponible</p>
    </div>
  );
}

// ---------- Onglet Alertes / Veille ----------

function AlertsView() {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center space-y-3">
      <p className="text-4xl">&#128276;</p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Veille automatique</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
        Recois des offres pertinentes des leur publication, matchees a ton CV et tes criteres de recherche.
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">Bientot disponible</p>
    </div>
  );
}

// ---------- Detail candidature (panel lateral) ----------

function DetailPanel({ item, onClose }: { item: CandidatureRow | null; onClose: () => void }) {
  if (!item) return null;

  const status = (item.status ?? "saved") as ApplicationStatus;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{item.job_title || "Sans titre"}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{item.company || "—"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div className="px-6 py-6 space-y-6">
          {/* Score + statut */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className={`text-3xl font-bold ${scoreColor(item.score_current)}`}>
                {item.score_current?.toFixed(1)}
              </p>
              <p className="text-xs text-gray-400">Score actuel</p>
            </div>
            <div className="text-center">
              <p className={`text-3xl font-bold ${scoreColor(item.score_potential)}`}>
                {item.score_potential?.toFixed(1)}
              </p>
              <p className="text-xs text-gray-400">Score potentiel</p>
            </div>
            <div className="ml-auto">
              <StatusBadge status={status} />
            </div>
          </div>

          {/* Resume */}
          {item.summary && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Resume de l&apos;analyse</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Timeline placeholder */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Historique</h3>
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-gray-200 dark:before:bg-gray-700">
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Candidature analysee</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(item.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-all"
              onClick={onClose}
            >
              Voir l&apos;analyse complete
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              onClick={onClose}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Composant principal ----------

export default function DashboardPanel() {
  const { user } = useAuth();
  const [dashTab, setDashTab] = useState<DashboardTab>("board");
  const [items, setItems] = useState<CandidatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Charger les candidatures
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("candidatures")
      .select("id, created_at, job_title, company, score_current, score_potential, summary, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.warn("Erreur chargement dashboard:", error.message);
        setItems((data as CandidatureRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  // Mettre a jour le statut d'une candidature
  async function handleStatusChange(id: string, status: ApplicationStatus) {
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    const { error } = await supabase
      .from("candidatures")
      .update({ status })
      .eq("id", id);
    if (error) {
      console.warn("Erreur maj statut:", error.message);
      // Revert en cas d'erreur — recharger
      const { data } = await supabase
        .from("candidatures")
        .select("id, created_at, job_title, company, score_current, score_potential, summary, status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setItems(data as CandidatureRow[]);
    }
  }

  const detailItem = detailId ? items.find((i) => i.id === detailId) ?? null : null;

  if (!user) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center space-y-3">
        <p className="text-4xl">&#128274;</p>
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Connecte-toi pour acceder au dashboard</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Le suivi de tes candidatures necessite un compte.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sous-onglets */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
        {([
          { key: "board" as DashboardTab, label: "Mes candidatures", icon: "&#128203;" },
          { key: "emails" as DashboardTab, label: "Emails", icon: "&#128232;" },
          { key: "alerts" as DashboardTab, label: "Veille offres", icon: "&#128276;" },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDashTab(key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
              dashTab === key
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <span dangerouslySetInnerHTML={{ __html: icon }} className="text-sm" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Stats — seulement sur l'onglet board */}
      {dashTab === "board" && !loading && items.length > 0 && (
        <StatsBar items={items} />
      )}

      {/* Contenu */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                </div>
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {dashTab === "board" && (
            <BoardView
              items={items}
              onStatusChange={handleStatusChange}
              onOpenDetail={setDetailId}
            />
          )}
          {dashTab === "emails" && <EmailsView />}
          {dashTab === "alerts" && <AlertsView />}
        </>
      )}

      {/* Panel detail */}
      <DetailPanel item={detailItem} onClose={() => setDetailId(null)} />
    </div>
  );
}
