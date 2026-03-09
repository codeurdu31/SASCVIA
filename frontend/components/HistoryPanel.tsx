"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import type { MatchAnalysisResponse, FindContactsResponse, DraftedEmail, InterviewOverviewResponse, TopicDetailResponse, InterviewQuestion } from "@/lib/api";

interface CandidatureRow {
  id: string;
  created_at: string;
  job_title: string;
  company: string;
  score_current: number;
  score_potential: number;
  summary: string;
}

interface ContactSearchRow {
  id: string;
  created_at: string;
  job_title: string;
  company: string;
}

export interface LoadedCandidature {
  id: string;
  cvText: string;
  jobContent: string;
  result: MatchAnalysisResponse;
  generatedCvText?: string | null;
  coverLetterText?: string | null;
  contactsData?: unknown | null;
  draftedEmails?: unknown | null;
  interviewOverview?: InterviewOverviewResponse | null;
  interviewTopicDetails?: Record<string, TopicDetailResponse> | null;
  interviewQuestions?: InterviewQuestion[] | null;
}

export interface LoadedContactSearch {
  id: string;
  jobContent: string;
  jobTitle: string;
  company: string;
  contactsData: FindContactsResponse;
  draftedEmails: DraftedEmail[] | null;
}

type HistoryTab = "analyses" | "contacts";

export default function HistoryPanel({
  onClose,
  onSelect,
  onSelectContactSearch,
}: {
  onClose: () => void;
  onSelect: (data: LoadedCandidature) => void;
  onSelectContactSearch?: (data: LoadedContactSearch) => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<HistoryTab>("analyses");
  const [items, setItems] = useState<CandidatureRow[]>([]);
  const [contactItems, setContactItems] = useState<ContactSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // Charger les candidatures (analyses CV)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("candidatures")
      .select("id, created_at, job_title, company, score_current, score_potential, summary")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.warn("Erreur chargement historique:", error.message);
        setItems((data as CandidatureRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  // Charger les recherches de contacts
  useEffect(() => {
    if (!user) return;
    supabase
      .from("contact_searches")
      .select("id, created_at, job_title, company")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.warn("Erreur chargement contacts:", error.message);
        setContactItems((data as ContactSearchRow[]) ?? []);
        setLoadingContacts(false);
      });
  }, [user]);

  function scoreColor(score: number): string {
    if (score >= 7) return "text-green-600";
    if (score >= 4) return "text-orange-500";
    return "text-red-500";
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleSelect(id: string) {
    setLoadingId(id);
    const { data, error } = await supabase
      .from("candidatures")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.warn("Erreur chargement candidature:", error?.message);
      setLoadingId(null);
      return;
    }

    onSelect({
      id: data.id,
      cvText: data.cv_text,
      jobContent: data.job_content,
      result: {
        job_title: data.job_title,
        company: data.company,
        score_current: data.score_current,
        score_potential: data.score_potential,
        strengths: data.strengths as string[],
        improvements: data.improvements as MatchAnalysisResponse["improvements"],
        summary: data.summary,
        suggested_project: data.suggested_project as MatchAnalysisResponse["suggested_project"],
      },
      generatedCvText: data.generated_cv_text ?? null,
      coverLetterText: data.cover_letter_text ?? null,
      contactsData: data.contacts_data ?? null,
      draftedEmails: data.drafted_emails ?? null,
      interviewOverview: data.interview_overview as InterviewOverviewResponse | null ?? null,
      interviewTopicDetails: data.interview_topic_details as Record<string, TopicDetailResponse> | null ?? null,
      interviewQuestions: data.interview_questions as InterviewQuestion[] | null ?? null,
    });
    onClose();
  }

  async function handleSelectContact(id: string) {
    setLoadingId(id);
    const { data, error } = await supabase
      .from("contact_searches")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.warn("Erreur chargement recherche contacts:", error?.message);
      setLoadingId(null);
      return;
    }

    onSelectContactSearch?.({
      id: data.id,
      jobContent: data.job_content,
      jobTitle: data.job_title,
      company: data.company,
      contactsData: data.contacts_data as FindContactsResponse,
      draftedEmails: data.drafted_emails as DraftedEmail[] | null ?? null,
    });
    onClose();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("candidatures").delete().eq("id", id);
    if (!error) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  }

  async function handleDeleteContact(id: string) {
    const { error } = await supabase.from("contact_searches").delete().eq("id", id);
    if (!error) {
      setContactItems((prev) => prev.filter((item) => item.id !== id));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mon historique</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          <button
            onClick={() => setTab("analyses")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "analyses"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Analyses CV
            {items.length > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{items.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("contacts")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "contacts"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Recherches contacts
            {contactItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{contactItems.length}</span>
            )}
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === "analyses" ? (
            /* ---------- ONGLET ANALYSES CV ---------- */
            loading ? (
              <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-12">
                Aucune analyse enregistree. Lance une analyse pour commencer !
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 space-y-2 cursor-pointer transition-all hover:border-blue-400 hover:shadow-sm ${loadingId === item.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.job_title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.company}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <div className="text-right">
                          <p className={`text-lg font-bold ${scoreColor(item.score_current)}`}>
                            {item.score_current.toFixed(1)}<span className="text-xs text-gray-400">/10</span>
                          </p>
                          <p className="text-xs text-gray-400">
                            potentiel {item.score_potential.toFixed(1)}
                          </p>
                        </div>
                        {loadingId === item.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                            className="rounded-lg p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Supprimer"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.summary}</p>
                    <p className="text-xs text-gray-400">{formatDate(item.created_at)}</p>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ---------- ONGLET RECHERCHES CONTACTS ---------- */
            loadingContacts ? (
              <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : contactItems.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-12">
                Aucune recherche de contacts enregistree.
              </p>
            ) : (
              <div className="space-y-3">
                {contactItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectContact(item.id)}
                    className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 space-y-2 cursor-pointer transition-all hover:border-blue-400 hover:shadow-sm ${loadingId === item.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.job_title || "Offre sans titre"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.company || "Entreprise inconnue"}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/30 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                          Contacts
                        </span>
                        {loadingId === item.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteContact(item.id); }}
                            className="rounded-lg p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Supprimer"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(item.created_at)}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
