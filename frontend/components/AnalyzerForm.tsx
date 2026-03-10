"use client";

import { useState, useRef, useEffect } from "react";
import {
  uploadCV,
  analyzeMatch,
  generateCVPreview,
  cvPreviewToPDF,
  cvPreviewToDocx,
  CVPreviewResult,
  generateCoverLetter,
  coverLetterToPDF,
  coverLetterToDocx,
  findContacts,
  draftEmails,
  interviewOverview,
  interviewTopicDetail,
  interviewQuestions,
  fetchTTS,
  evaluateSingleAnswer,
  evaluateBatchAnswers,
  AnswerToEvaluate,
  AnswerEvaluation,
  EvaluateBatchResult,
  MatchAnalysisResponse,
  SuggestedProject,
  CVImprovement,
  ContactProfile,
  ContactEmailFormat,
  DraftedEmail,
  FindContactsResponse,
  InterviewOverviewResponse,
  StudyTopicSummary,
  TopicDetailResponse,
  KeyConcept,
  FlashCard,
  InterviewQuestion,
  QuestionDistribution,
  QuestionsResponse,
  CVTemplate,
  getCVTemplates,
  suggestTemplate,
  cvPreviewToTemplatePDF,
  cvPreviewToTemplateHTML,
  importJobFromURL,
} from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import HistoryPanel from "./HistoryPanel";
import type { LoadedCandidature, LoadedContactSearch } from "./HistoryPanel";
import CVBuilderForm from "./CVBuilderForm";
import DashboardPanel from "./DashboardPanel";

type CVInputMode = "upload" | "builder";

type Status = "idle" | "loading" | "success" | "error";
type GenerateStatus = "idle" | "loading" | "done" | "error";
type AppTab = "candidature" | "entretien" | "dashboard";

// ---------- Skeleton loader ----------

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Titre */}
      <div>
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      {/* Scores */}
      <div className="flex gap-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex-1 text-center space-y-2">
          <Skeleton className="h-3 w-20 mx-auto" />
          <Skeleton className="h-12 w-16 mx-auto" />
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="flex-1 text-center space-y-2">
          <Skeleton className="h-3 w-24 mx-auto" />
          <Skeleton className="h-12 w-16 mx-auto" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
      {/* Resume */}
      <Skeleton className="h-16 w-full" />
      {/* Points forts */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      {/* Ameliorations */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

// ---------- Barre de progression estimee ----------

interface ProgressStep {
  label: string;
  duration: number; // duree estimee en secondes
}

function ProgressTracker({ steps, active }: { steps: ProgressStep[]; active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      setElapsed(sec);
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  // Progression asymptotique : ralentit naturellement, ne bloque jamais
  // Formule : pct = 95 * (1 - e^(-elapsed / (totalDuration * 0.6)))
  // Atteint ~63% a totalDuration*0.6, ~86% a totalDuration, ~95% a totalDuration*2
  const tau = totalDuration * 0.6;
  const pct = 95 * (1 - Math.exp(-elapsed / tau));

  // Etape courante basee sur le pourcentage (pas le temps brut)
  // pour que les etapes avancent proportionnellement a la barre
  let cumul = 0;
  let currentStepIdx = 0;
  const stepPcts = steps.map(s => (s.duration / totalDuration) * 95);
  for (let i = 0; i < steps.length; i++) {
    if (pct < cumul + stepPcts[i]) {
      currentStepIdx = i;
      break;
    }
    cumul += stepPcts[i];
    if (i === steps.length - 1) currentStepIdx = i;
  }

  const currentLabel = steps[currentStepIdx]?.label ?? steps[steps.length - 1].label;

  // Temps restant estime : on estime proportionnellement au pourcentage restant
  // mais on affiche "quelques secondes" quand on ne sait plus trop
  const remaining = pct > 0 ? Math.ceil((elapsed / pct) * (95 - pct)) : totalDuration;
  const remainingLabel = pct > 85
    ? "quelques secondes"
    : `~${Math.max(1, remaining)}s restantes`;

  return (
    <div className="mt-4 space-y-2 animate-in fade-in">
      {/* Barre */}
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
      {/* Label etape */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {currentLabel}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {remainingLabel}
        </p>
      </div>
      {/* Etapes */}
      <div className="flex gap-1">
        {steps.map((step, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`h-1 w-full rounded-full transition-colors duration-300 ${
              i < currentStepIdx ? "bg-green-500" : i === currentStepIdx ? "bg-green-400 animate-pulse" : "bg-gray-200 dark:bg-gray-700"
            }`} />
            <span className={`text-[10px] leading-tight text-center ${
              i <= currentStepIdx ? "text-green-700 dark:text-green-400 font-medium" : "text-gray-400 dark:text-gray-500"
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Etapes pour l'analyse CV
const ANALYSIS_STEPS_UPLOAD: ProgressStep[] = [
  { label: "Extraction du CV", duration: 5 },
  { label: "Lecture de l'offre", duration: 4 },
  { label: "Analyse des competences", duration: 15 },
  { label: "Evaluation du score", duration: 10 },
  { label: "Suggestions d'amelioration", duration: 12 },
];

const ANALYSIS_STEPS_TEXT: ProgressStep[] = [
  { label: "Lecture du profil", duration: 4 },
  { label: "Analyse de l'offre", duration: 5 },
  { label: "Analyse des competences", duration: 15 },
  { label: "Evaluation du score", duration: 10 },
  { label: "Suggestions d'amelioration", duration: 12 },
];

// Etapes pour la recherche de contacts
const CONTACTS_STEPS: ProgressStep[] = [
  { label: "Analyse de l'offre", duration: 5 },
  { label: "Recherche web", duration: 20 },
  { label: "Identification des contacts", duration: 15 },
  { label: "Verification des emails", duration: 8 },
];

// Etapes pour la preparation entretien
const INTERVIEW_OVERVIEW_STEPS: ProgressStep[] = [
  { label: "Lecture du CV", duration: 4 },
  { label: "Analyse de l'offre", duration: 6 },
  { label: "Evaluation du profil", duration: 15 },
  { label: "Construction du plan", duration: 12 },
];

const INTERVIEW_QUESTIONS_STEPS: ProgressStep[] = [
  { label: "Analyse du poste", duration: 6 },
  { label: "Questions fit", duration: 10 },
  { label: "Questions techniques", duration: 15 },
  { label: "Cas pratiques", duration: 12 },
  { label: "Exemples de reponses", duration: 10 },
];

// ---------- Jauge de score ----------

// Mapping explicite pour que Tailwind ne purge pas les classes dynamiques
const SCORE_BAR_COLORS: Record<string, string> = {
  "text-green-600": "bg-green-600",
  "text-orange-500": "bg-orange-500",
  "text-red-500": "bg-red-500",
};

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const pct = (score / 10) * 100;
  const barColor = SCORE_BAR_COLORS[color] ?? "bg-blue-500";
  return (
    <div className="flex-1 text-center">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-4xl sm:text-5xl font-bold ${color}`}>{score.toFixed(1)}<span className="text-xl sm:text-2xl text-gray-400">/10</span></p>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------- Langues supportées ----------

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "es", label: "Español",  flag: "🇪🇸" },
  { code: "de", label: "Deutsch",  flag: "🇩🇪" },
  { code: "pt", label: "Português",flag: "🇵🇹" },
] as const;

type LangCode = typeof LANGUAGES[number]["code"];

function LanguagePicker({
  value,
  onChange,
}: {
  value: LangCode;
  onChange: (lang: LangCode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => onChange(lang.code)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
            value === lang.code
              ? "border-blue-500 bg-blue-600 text-white shadow-sm"
              : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          <span>{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Carte projet suggéré ----------

function SuggestedProjectCard({ project }: { project: SuggestedProject }) {
  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">💡</span>
        <h3 className="font-bold text-blue-900 dark:text-blue-200">Projet à ajouter à ton CV</h3>
        <span className="ml-auto rounded-full bg-blue-200 dark:bg-blue-800 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-200">
          {project.duration}
        </span>
      </div>

      {/* Titre avec stack */}
      <div className="mb-2 flex items-start gap-2">
        <p className="text-base font-semibold text-blue-900 dark:text-blue-200">{project.title}</p>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {project.tech_stack.map((tech, i) => (
          <span key={i} className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">
            {tech}
          </span>
        ))}
      </div>

      {/* Bullet points */}
      {project.bullet_points && project.bullet_points.length > 0 ? (
        <ul className="mb-3 space-y-1.5 pl-1">
          {project.bullet_points.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              {point}
            </li>
          ))}
        </ul>
      ) : project.description ? (
        <p className="mb-3 text-sm text-blue-800 dark:text-blue-300 leading-relaxed">{project.description}</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Pourquoi ce projet ? </span>
          {project.why_relevant}
        </p>
        <p className="text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 rounded-lg px-3 py-2">
          <span className="font-semibold">Remplace : </span>
          {project.to_replace}
        </p>
      </div>
    </div>
  );
}

// ---------- Carte amélioration avec bouton copier ----------

function ImprovementCard({ item }: { item: CVImprovement }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = `[${item.category}]\nActuellement : ${item.current}\nA modifier : ${item.suggestion}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm space-y-3">
      {/* En-tete categorie + bouton copier */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-orange-200 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
          {item.category}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
        >
          {copied ? "Copie !" : "Copier"}
        </button>
      </div>

      {/* Suggestion principale — mise en avant */}
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Texte recommande</p>
        <p className="text-base font-semibold text-green-900 leading-relaxed">{item.suggestion}</p>
      </div>

      {/* Comparaison : ce qui est actuellement */}
      <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Actuellement dans le CV</p>
        <p className="text-sm text-red-900 leading-relaxed">{item.current}</p>
      </div>

      {/* Sous-points d'actions */}
      {item.key_actions && item.key_actions.length > 0 && (
        <div className="pl-1 space-y-1">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Actions a faire</p>
          <ul className="space-y-1">
            {item.key_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="mt-0.5 text-blue-500 shrink-0">&#10148;</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mots-cles a ajouter */}
      {item.keywords && item.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1 self-center">Mots-cles :</span>
          {item.keywords.map((kw, i) => (
            <span key={i} className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Impact */}
      <p className="text-xs text-orange-700 italic bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
        <span className="font-semibold not-italic">Impact : </span>{item.impact}
      </p>
    </div>
  );
}

// ---------- CV amélioré éditable ----------

function CVPreviewSection({
  cvText,
  jobContent,
  jobTitle,
  improvements,
  suggestedProject,
  language,
  initialText,
  onTextGenerated,
}: {
  cvText: string;
  jobContent: string;
  jobTitle: string;
  improvements: CVImprovement[];
  suggestedProject: SuggestedProject | null;
  language: LangCode;
  initialText?: string | null;
  onTextGenerated?: (text: string) => void;
}) {
  const [previewText, setPreviewText] = useState(initialText ?? "");
  const [genStatus, setGenStatus] = useState<GenerateStatus>(initialText ? "done" : "idle");
  const [pdfStatus, setPdfStatus] = useState<GenerateStatus>("idle");
  const [docxStatus, setDocxStatus] = useState<GenerateStatus>("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [rescoreStatus, setRescoreStatus] = useState<GenerateStatus>("idle");
  const [rescoreResult, setRescoreResult] = useState<{ score: number } | null>(null);
  const [changePct, setChangePct] = useState<number>(0);

  // Abort controllers
  const genAbort = useRef<AbortController | null>(null);
  const pdfAbort = useRef<AbortController | null>(null);
  const docxAbort = useRef<AbortController | null>(null);
  const rescoreAbort = useRef<AbortController | null>(null);
  const templateAbort = useRef<AbortController | null>(null);

  // Templates
  const [templates, setTemplates] = useState<CVTemplate[]>([]);
  const [suggestedTemplateId, setSuggestedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateStatus, setTemplateStatus] = useState<GenerateStatus>("idle");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [canTemplatePdf, setCanTemplatePdf] = useState(false);

  // Charger les templates au mount
  useEffect(() => {
    getCVTemplates().then((res) => {
      setTemplates(res.templates);
      setCanTemplatePdf(res.available);
    }).catch(() => {});
  }, []);

  // Suggerer un template quand le preview est genere
  useEffect(() => {
    if (genStatus === "done" && jobTitle) {
      suggestTemplate(jobTitle, "").then((id) => {
        setSuggestedTemplateId(id);
      }).catch(() => {});
    }
  }, [genStatus, jobTitle]);

  async function handleTemplatePreview() {
    if (templateStatus === "loading") { templateAbort.current?.abort(); return; }
    if (!selectedTemplate || !previewText.trim()) return;
    templateAbort.current = new AbortController();
    setTemplateStatus("loading");
    setTemplateError(null);
    try {
      const html = await cvPreviewToTemplateHTML(previewText, selectedTemplate, templateAbort.current.signal);
      setTemplateHtml(html);
      setTemplateStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setTemplateStatus("idle"); return; }
      setTemplateError(err instanceof Error ? err.message : "Erreur template.");
      setTemplateStatus("error");
    }
  }

  async function handleTemplateDownload() {
    if (templateStatus === "loading") { templateAbort.current?.abort(); return; }
    if (!selectedTemplate || !previewText.trim()) return;
    if (canTemplatePdf) {
      templateAbort.current = new AbortController();
      setTemplateStatus("loading");
      setTemplateError(null);
      try {
        const blob = await cvPreviewToTemplatePDF(previewText, selectedTemplate, templateAbort.current.signal);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cv_${selectedTemplate}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setTemplateStatus("done");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") { setTemplateStatus("idle"); return; }
        setTemplateError(err instanceof Error ? err.message : "Erreur template PDF.");
        setTemplateStatus("error");
      }
    } else {
      // Sans WeasyPrint : generer le HTML puis ouvrir dans une nouvelle fenetre avec impression
      let html = templateHtml;
      if (!html) {
        templateAbort.current = new AbortController();
        setTemplateStatus("loading");
        setTemplateError(null);
        try {
          html = await cvPreviewToTemplateHTML(previewText, selectedTemplate, templateAbort.current.signal);
          setTemplateHtml(html);
          setTemplateStatus("done");
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") { setTemplateStatus("idle"); return; }
          setTemplateError(err instanceof Error ? err.message : "Erreur template.");
          setTemplateStatus("error");
          return;
        }
      }
      if (html) {
        const printHtml = html.replace("</body>", "<script>window.onload=function(){window.print();}<\/script></body>");
        const blob = new Blob([printHtml], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      }
    }
  }

  async function handleGenerate() {
    if (genStatus === "loading") { genAbort.current?.abort(); return; }
    genAbort.current = new AbortController();
    setGenStatus("loading");
    setGenError(null);
    setPdfPreviewUrl(null);
    setRescoreResult(null);
    try {
      const result = await generateCVPreview(cvText, jobTitle, improvements, suggestedProject, language, genAbort.current.signal);
      setPreviewText(result.preview_text);
      setChangePct(result.change_percentage);
      setGenStatus("done");
      onTextGenerated?.(result.preview_text);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setGenStatus("idle"); return; }
      setGenError(err instanceof Error ? err.message : "Erreur de generation.");
      setGenStatus("error");
    }
  }

  async function handlePreviewPDF() {
    if (pdfStatus === "loading") { pdfAbort.current?.abort(); return; }
    pdfAbort.current = new AbortController();
    setPdfStatus("loading");
    setPdfError(null);
    try {
      const blob = await cvPreviewToPDF(previewText, pdfAbort.current.signal);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setPdfStatus("idle"); return; }
      setPdfError(err instanceof Error ? err.message : "Erreur de preview PDF.");
      setPdfStatus("error");
    }
  }

  async function handleDownloadPDF() {
    if (pdfStatus === "loading") { pdfAbort.current?.abort(); return; }
    pdfAbort.current = new AbortController();
    setPdfStatus("loading");
    setPdfError(null);
    try {
      const blob = await cvPreviewToPDF(previewText, pdfAbort.current.signal);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cv_ameliore.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setPdfStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setPdfStatus("idle"); return; }
      setPdfError(err instanceof Error ? err.message : "Erreur PDF.");
      setPdfStatus("error");
    }
  }

  async function handleDownloadDocx() {
    if (docxStatus === "loading") { docxAbort.current?.abort(); return; }
    docxAbort.current = new AbortController();
    setDocxStatus("loading");
    try {
      const blob = await cvPreviewToDocx(previewText, docxAbort.current.signal);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cv_ameliore.docx";
      a.click();
      URL.revokeObjectURL(url);
      setDocxStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setDocxStatus("idle"); return; }
      setDocxStatus("error");
    }
  }

  async function handleRescore() {
    if (rescoreStatus === "loading") { rescoreAbort.current?.abort(); return; }
    rescoreAbort.current = new AbortController();
    setRescoreStatus("loading");
    try {
      const result = await analyzeMatch(previewText, jobContent, undefined, rescoreAbort.current.signal);
      setRescoreResult({ score: result.score_current });
      setRescoreStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setRescoreStatus("idle"); return; }
      setRescoreStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Bouton de generation */}
      {genStatus !== "done" && (
        <button
          onClick={handleGenerate}
          className="w-full rounded-xl bg-green-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-green-700"
        >
          {genStatus === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Arreter la generation
            </span>
          ) : "Generer le CV ameliore"}
        </button>
      )}

      {genError && <p className="text-center text-sm text-red-600">{genError}</p>}

      {/* Textarea editable + actions */}
      {genStatus === "done" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Modifie librement le CV avant de le telecharger.
              </p>
              {changePct > 0 && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  changePct <= 15 ? "bg-green-100 text-green-700" : changePct <= 30 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
                }`}>
                  {changePct}% modifie
                </span>
              )}
            </div>
            <button
              onClick={handleGenerate}
              className="text-xs text-green-700 underline hover:text-green-900"
            >
              Regenerer
            </button>
          </div>

          <textarea
            value={previewText}
            onChange={(e) => { setPreviewText(e.target.value); setPdfPreviewUrl(null); setRescoreResult(null); }}
            rows={30}
            spellCheck
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-4 font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 outline-none transition-colors focus:border-green-400 focus:ring-2 focus:ring-green-100 resize-y"
          />

          {/* Bouton re-scorer */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRescore}
              disabled={!previewText.trim() && rescoreStatus !== "loading"}
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-all disabled:opacity-50"
            >
              {rescoreStatus === "loading" ? (
                <span className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Arreter l&apos;analyse
                </span>
              ) : "Re-scorer ce CV"}
            </button>
            {rescoreResult && (
              <span className={`text-lg font-bold ${rescoreResult.score >= 7 ? "text-green-600" : rescoreResult.score >= 4 ? "text-orange-500" : "text-red-500"}`}>
                {rescoreResult.score.toFixed(1)}/10
              </span>
            )}
            {rescoreStatus === "error" && <span className="text-xs text-red-500">Erreur</span>}
          </div>

          {/* Template selector (optionnel) */}
          {templates.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Template design (optionnel)
                </p>
                {selectedTemplate && (
                  <button
                    onClick={() => { setSelectedTemplate(null); setTemplateHtml(null); }}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Revenir au classique
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => { setSelectedTemplate(tmpl.id); setTemplateHtml(null); }}
                    className={`relative rounded-lg border-2 p-3 text-left transition-all ${
                      selectedTemplate === tmpl.id
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {suggestedTemplateId === tmpl.id && (
                      <span className="absolute -top-2 -right-2 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">
                        Conseille
                      </span>
                    )}
                    <div
                      className="h-2 w-full rounded-full mb-2"
                      style={{ backgroundColor: tmpl.preview_color }}
                    />
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{tmpl.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{tmpl.description}</p>
                  </button>
                ))}
              </div>

              {/* Template preview + download */}
              {selectedTemplate && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleTemplatePreview}
                      disabled={!previewText.trim() && templateStatus !== "loading"}
                      className="rounded-xl border border-purple-300 bg-purple-50 dark:bg-purple-900/20 px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 transition-all disabled:opacity-50"
                    >
                      {templateStatus === "loading" ? "Arreter le chargement" : "Previsualiser template"}
                    </button>
                    <button
                      onClick={handleTemplateDownload}
                      disabled={!previewText.trim() && templateStatus !== "loading"}
                      className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 transition-all disabled:opacity-50"
                    >
                      {canTemplatePdf ? "Telecharger template PDF" : "Telecharger template PDF (impression)"}
                    </button>
                  </div>
                  {templateHtml && (
                    <div className="relative w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white overflow-hidden" style={{ height: "800px" }}>
                      <iframe
                        srcDoc={templateHtml.replace(
                          "</style>",
                          "html { transform: scale(0.7); transform-origin: top center; } body { margin: 10mm; }</style>"
                        )}
                        className="w-full h-full border-0"
                        title="Preview CV Template"
                      />
                    </div>
                  )}
                  {templateError && <p className="text-center text-xs text-red-600">{templateError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Boutons preview + download (classique) */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">
              PDF classique
            </p>
            {/* Preview PDF */}
            <button
              onClick={handlePreviewPDF}
              disabled={!previewText.trim() && pdfStatus !== "loading"}
              className="w-full rounded-xl border border-green-300 bg-green-50 px-6 py-3 font-medium text-green-700 transition-all hover:bg-green-100 disabled:opacity-50"
            >
              {pdfStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Arreter le chargement
                </span>
              ) : "Previsualiser le PDF"}
            </button>

            {/* Iframe preview */}
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-[600px] rounded-xl border border-gray-200 dark:border-gray-700"
                title="Preview CV PDF"
              />
            )}

            {/* Download PDF + DOCX */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={!previewText.trim()}
                className="rounded-xl bg-green-700 px-4 py-3 font-semibold text-white transition-all hover:bg-green-800 disabled:opacity-50"
              >
                Telecharger PDF
              </button>
              <button
                onClick={handleDownloadDocx}
                disabled={docxStatus === "loading" || !previewText.trim()}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {docxStatus === "loading" ? "..." : docxStatus === "done" ? "DOCX telecharge !" : "Telecharger Word"}
              </button>
            </div>
            {pdfError && <p className="text-center text-xs text-red-600">{pdfError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Contacts & emails ----------

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};
const PRIORITY_LABELS: Record<string, string> = {
  high: "Prioritaire", medium: "Pertinent", low: "Réseau large",
};
const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior", mid: "Confirmé", senior: "Senior",
  lead: "Lead", manager: "Manager", director: "Directeur",
};
const CIRCLE_LABELS: Record<number, string> = {
  1: "Équipe directe", 2: "Département", 3: "Direction",
};
const CIRCLE_STYLES: Record<number, string> = {
  1: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  3: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

function ContactCard({ contact }: { contact: ContactProfile }) {
  const linkedinHref = contact.linkedin_url || contact.linkedin_search_url;
  const linkedinLabel = contact.linkedin_url ? "Voir le profil" : "Chercher sur LinkedIn";
  const teamPct = Math.round(contact.team_match * 100);
  const priorityClass = PRIORITY_STYLES[contact.priority_level] ?? PRIORITY_STYLES.medium;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      {/* En-tête : rang + nom + badges */}
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
          {contact.rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">{contact.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{contact.title}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityClass}`}>
            {PRIORITY_LABELS[contact.priority_level] ?? contact.priority_level}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CIRCLE_STYLES[contact.search_circle] ?? CIRCLE_STYLES[2]}`}>
            {CIRCLE_LABELS[contact.search_circle] ?? "Département"}
          </span>
          <span className="text-xs text-gray-400">
            {SENIORITY_LABELS[contact.seniority] ?? contact.seniority}
          </span>
        </div>
      </div>

      {/* Adéquation équipe */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Adéquation équipe</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{teamPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-1.5 rounded-full ${teamPct >= 80 ? "bg-green-500" : teamPct >= 60 ? "bg-yellow-400" : "bg-gray-400"}`}
            style={{ width: `${teamPct}%` }}
          />
        </div>
      </div>

      {/* Email */}
      <p className="flex items-center gap-1.5 text-sm font-mono text-blue-700">
        <span>&#9993;</span>{contact.email}
        {contact.email_verified === "valid" ? (
          <span className="text-xs font-sans text-green-600 font-semibold ml-1">&#10003; vérifié</span>
        ) : (
          <span className="text-xs font-sans text-orange-500 ml-1">(estimé)</span>
        )}
      </p>

      {/* LinkedIn */}
      <a
        href={linkedinHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A66C2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004182] transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
        {linkedinLabel}
      </a>

      {/* Raisonnement */}
      <p className="text-xs text-gray-600 dark:text-gray-400 italic border-l-2 border-indigo-200 pl-2 leading-relaxed">
        {contact.reasoning}
      </p>
    </div>
  );
}

function EmailFormatBadge({ fmt }: { fmt: ContactEmailFormat }) {
  const pct = Math.round(fmt.confidence * 100);
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
      <p>
        <span className="font-medium text-gray-700 dark:text-gray-300">Format email : </span>
        <span className="font-mono">{fmt.pattern}</span>
        <span className="ml-2 text-gray-400">(confiance {pct}%)</span>
      </p>
      {fmt.examples.length > 0 && (
        <p className="font-mono text-gray-400">ex: {fmt.examples[0]}</p>
      )}
    </div>
  );
}

type AttachmentSource = "none" | "file" | "app";

function EmailBlock({
  email,
  index,
  providerToken,
  userEmail,
  improvedCvText,
}: {
  email: DraftedEmail;
  index: number;
  providerToken?: string | null;
  userEmail?: string;
  improvedCvText?: string;
}) {
  const [toEmail, setToEmail] = useState(email.contact_email);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachSource, setAttachSource] = useState<AttachmentSource>("none");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function copyAll() {
    const full = `A : ${toEmail}\nObjet : ${subject}\n\n${body}`;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend() {
    if (!providerToken || !userEmail) return;
    setSendStatus("sending");
    setSendError(null);

    try {
      // Preparer la piece jointe si selectionnee
      let attachment: import("@/lib/gmail").EmailAttachment | undefined;

      if (attachSource === "file" && attachFile) {
        const buf = await attachFile.arrayBuffer();
        attachment = { filename: attachFile.name, mimeType: attachFile.type || "application/pdf", data: buf };
      } else if (attachSource === "app" && improvedCvText) {
        // Generer le PDF du CV ameliore via le backend
        const blob = await cvPreviewToPDF(improvedCvText);
        const buf = await blob.arrayBuffer();
        attachment = { filename: "cv_ameliore.pdf", mimeType: "application/pdf", data: buf };
      }

      const { sendGmailEmail } = await import("@/lib/gmail");
      const result = await sendGmailEmail(providerToken, userEmail, toEmail, subject, body, attachment);
      if (result.success) {
        setSendStatus("sent");
      } else {
        setSendError(result.error ?? "Erreur inconnue");
        setSendStatus("error");
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
      setSendStatus("error");
    }
  }

  const attachLabel = attachSource === "none"
    ? "Aucune piece jointe"
    : attachSource === "file"
    ? (attachFile ? attachFile.name : "Aucun fichier")
    : "CV ameliore (PDF)";

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-indigo-900 dark:text-indigo-200">{email.contact_name}</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">{email.contact_title}</p>
        </div>
        <div className="flex items-center gap-2">
          {providerToken && userEmail && (
            <button
              onClick={handleSend}
              disabled={sendStatus === "sending" || sendStatus === "sent"}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-60 ${
                sendStatus === "sent"
                  ? "bg-green-600"
                  : sendStatus === "error"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {sendStatus === "sending" ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Envoi...
                </span>
              ) : sendStatus === "sent" ? "Envoye !" : sendStatus === "error" ? "Reessayer" : "Envoyer via Gmail"}
            </button>
          )}
          <button
            onClick={copyAll}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-all"
          >
            {copied ? "Copie !" : "Copier"}
          </button>
        </div>
      </div>
      {sendError && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-1.5">{sendError}</p>
      )}

      <div className="space-y-2">
        {/* Destinataire editable */}
        <div>
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">A</p>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            className="w-full rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 dark:focus:ring-indigo-800"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Objet</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 dark:focus:ring-indigo-800"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Corps</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 leading-relaxed outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-y"
          />
        </div>

        {/* Piece jointe */}
        {providerToken && userEmail && (
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Piece jointe</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setAttachSource("none"); setAttachFile(null); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  attachSource === "none"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                }`}
              >
                Aucune
              </button>
              <button
                type="button"
                onClick={() => { setAttachSource("file"); fileRef.current?.click(); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  attachSource === "file"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                }`}
              >
                {attachSource === "file" && attachFile ? attachFile.name : "Choisir un fichier"}
              </button>
              {improvedCvText && (
                <button
                  type="button"
                  onClick={() => { setAttachSource("app"); setAttachFile(null); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    attachSource === "app"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  CV ameliore de l&apos;app
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) { setAttachFile(f); setAttachSource("file"); }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ContactSection({
  jobContent,
  jobTitle,
  company,
  cvText,
  language,
  userEmail,
  providerToken,
  improvedCvText,
  initialContacts,
  initialEmails,
  onContactsFound,
  onEmailsDrafted,
}: {
  jobContent: string;
  jobTitle: string;
  company: string;
  cvText: string;
  language: LangCode;
  userEmail?: string;
  providerToken?: string | null;
  improvedCvText?: string;
  initialContacts?: FindContactsResponse | null;
  initialEmails?: DraftedEmail[] | null;
  onContactsFound?: (data: FindContactsResponse) => void;
  onEmailsDrafted?: (emails: DraftedEmail[]) => void;
}) {
  const [result, setResult] = useState<FindContactsResponse | null>(initialContacts ?? null);
  const [emails, setEmails] = useState<DraftedEmail[] | null>(initialEmails ?? null);
  const [findStatus, setFindStatus] = useState<GenerateStatus>(initialContacts ? "done" : "idle");
  const [draftStatus, setDraftStatus] = useState<GenerateStatus>(initialEmails ? "done" : "idle");
  const [findError, setFindError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const findAbort = useRef<AbortController | null>(null);
  const draftAbort = useRef<AbortController | null>(null);

  async function handleFindContacts() {
    if (findStatus === "loading") { findAbort.current?.abort(); return; }
    findAbort.current = new AbortController();
    setFindStatus("loading");
    setFindError(null);
    setResult(null);
    setEmails(null);
    try {
      const res = await findContacts(jobContent, jobTitle, company, userEmail, findAbort.current.signal);
      setResult(res);
      setFindStatus("done");
      onContactsFound?.(res);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setFindStatus("idle"); return; }
      setFindError(err instanceof Error ? err.message : "Erreur de recherche.");
      setFindStatus("error");
    }
  }

  async function handleDraftEmails() {
    if (draftStatus === "loading") { draftAbort.current?.abort(); return; }
    if (!result?.contacts.length) return;
    draftAbort.current = new AbortController();
    setDraftStatus("loading");
    setDraftError(null);
    try {
      const drafted = await draftEmails(cvText, jobTitle, company, result.contacts, language, jobContent, draftAbort.current.signal);
      setEmails(drafted);
      setDraftStatus("done");
      onEmailsDrafted?.(drafted);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setDraftStatus("idle"); return; }
      setDraftError(err instanceof Error ? err.message : "Erreur de rédaction.");
      setDraftStatus("error");
    }
  }

  const isSearching = findStatus === "loading";
  const contacts = result?.contacts ?? null;

  return (
    <div className="space-y-5">
      {/* Bouton de recherche — unique */}
      <button
        onClick={handleFindContacts}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700"
      >
        {isSearching ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Arreter la recherche
          </span>
        ) : contacts !== null ? "Relancer la recherche" : "Trouver les contacts pertinents"}
      </button>
      <ProgressTracker steps={CONTACTS_STEPS} active={isSearching} />
      {findError && <p className="text-sm text-red-600 text-center">{findError}</p>}

      {/* Résultats */}
      {result !== null && (
        <div className="space-y-4">
          {/* En-tête équipe + stratégie */}
          {(result.team_name || result.search_strategy) && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 space-y-1">
              {result.team_name && (
                <p className="text-xs font-medium text-indigo-800">
                  Equipe ciblée : <span className="font-semibold">{result.team_name}</span>
                  {result.position && <span className="text-indigo-600"> — {result.position}</span>}
                </p>
              )}
              {result.search_strategy && (
                <p className="text-xs text-indigo-600 italic">{result.search_strategy}</p>
              )}
            </div>
          )}

          {/* Format email */}
          {result.email_format && <EmailFormatBadge fmt={result.email_format} />}

          {/* Cartes contacts */}
          {contacts !== null && (
            contacts.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                Aucun contact réel trouvé automatiquement. Recherche manuelle sur LinkedIn recommandée.
              </p>
            ) : (
              <div className="grid gap-3">
                {contacts.map((c, i) => <ContactCard key={i} contact={c} />)}
              </div>
            )
          )}

          {/* Message si recherche incomplète */}
          {result.message && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {result.message}
            </p>
          )}

          <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
            &#9888; Les emails sont estimés (format déduit, non vérifié). Vérifie sur LinkedIn avant d&apos;envoyer.
          </p>

          {/* Bouton rédiger emails */}
          {contacts !== null && contacts.length > 0 && (
            <button
              onClick={handleDraftEmails}
              className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700"
            >
              {draftStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Arreter la redaction
                </span>
              ) : emails ? "Regenerer les emails" : "Rediger les emails personnalises"}
            </button>
          )}
          {draftError && <p className="text-sm text-red-600 text-center">{draftError}</p>}
        </div>
      )}

      {/* Blocs emails éditables */}
      {emails && (
        <div className="space-y-4">
          {emails.map((email, i) => (
            <EmailBlock key={i} email={email} index={i} providerToken={providerToken} userEmail={userEmail} improvedCvText={improvedCvText} />
          ))}
          <p className="text-xs text-gray-400 text-center">
            Modifie chaque email si besoin, puis clique &quot;Copier l&apos;email&quot; pour le coller dans ta messagerie.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Lettre de motivation ----------

function CoverLetterSection({
  cvText,
  jobContent,
  jobTitle,
  company,
  language,
  initialText,
  onTextGenerated,
}: {
  cvText: string;
  jobContent: string;
  jobTitle: string;
  company: string;
  language: LangCode;
  initialText?: string | null;
  onTextGenerated?: (text: string) => void;
}) {
  const [letterText, setLetterText] = useState(initialText ?? "");
  const [genStatus, setGenStatus] = useState<GenerateStatus>(initialText ? "done" : "idle");
  const [pdfStatus, setPdfStatus] = useState<GenerateStatus>("idle");
  const [docxStatus, setDocxStatus] = useState<GenerateStatus>("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const genAbort = useRef<AbortController | null>(null);
  const pdfAbort = useRef<AbortController | null>(null);
  const docxAbort = useRef<AbortController | null>(null);

  async function handleGenerate() {
    if (genStatus === "loading") { genAbort.current?.abort(); return; }
    genAbort.current = new AbortController();
    setGenStatus("loading");
    setGenError(null);
    setPdfPreviewUrl(null);
    try {
      const text = await generateCoverLetter(cvText, jobContent, jobTitle, company, language, genAbort.current.signal);
      setLetterText(text);
      setGenStatus("done");
      onTextGenerated?.(text);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setGenStatus("idle"); return; }
      setGenError(err instanceof Error ? err.message : "Erreur de generation.");
      setGenStatus("error");
    }
  }

  async function handlePreviewPDF() {
    if (pdfStatus === "loading") { pdfAbort.current?.abort(); return; }
    pdfAbort.current = new AbortController();
    setPdfStatus("loading");
    setPdfError(null);
    try {
      const blob = await coverLetterToPDF(letterText, pdfAbort.current.signal);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setPdfStatus("idle"); return; }
      setPdfError(err instanceof Error ? err.message : "Erreur preview PDF.");
      setPdfStatus("error");
    }
  }

  async function handleDownloadPDF() {
    if (pdfStatus === "loading") { pdfAbort.current?.abort(); return; }
    pdfAbort.current = new AbortController();
    setPdfStatus("loading");
    setPdfError(null);
    try {
      const blob = await coverLetterToPDF(letterText, pdfAbort.current.signal);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lettre_motivation.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setPdfStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setPdfStatus("idle"); return; }
      setPdfError(err instanceof Error ? err.message : "Erreur PDF.");
      setPdfStatus("error");
    }
  }

  async function handleDownloadDocx() {
    if (docxStatus === "loading") { docxAbort.current?.abort(); return; }
    docxAbort.current = new AbortController();
    setDocxStatus("loading");
    try {
      const blob = await coverLetterToDocx(letterText, docxAbort.current.signal);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lettre_motivation.docx";
      a.click();
      URL.revokeObjectURL(url);
      setDocxStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setDocxStatus("idle"); return; }
      setDocxStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Bouton de generation */}
      {genStatus !== "done" && (
        <button
          onClick={handleGenerate}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700"
        >
          {genStatus === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Arreter la generation
            </span>
          ) : "Generer la lettre de motivation"}
        </button>
      )}

      {genError && (
        <p className="text-center text-sm text-red-600">{genError}</p>
      )}

      {/* Textarea editable */}
      {genStatus === "done" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Modifie librement la lettre avant de la telecharger.
            </p>
            <button
              onClick={handleGenerate}
              className="text-xs text-indigo-600 underline hover:text-indigo-800"
            >
              Regenerer
            </button>
          </div>

          <textarea
            value={letterText}
            onChange={(e) => { setLetterText(e.target.value); setPdfPreviewUrl(null); }}
            rows={20}
            spellCheck
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-4 font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y"
          />

          <div className="space-y-2">
            {/* Preview PDF */}
            <button
              onClick={handlePreviewPDF}
              disabled={!letterText.trim() && pdfStatus !== "loading"}
              className="w-full rounded-xl border border-indigo-300 bg-indigo-50 px-6 py-3 font-medium text-indigo-700 transition-all hover:bg-indigo-100 disabled:opacity-50"
            >
              {pdfStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Arreter le chargement
                </span>
              ) : "Previsualiser le PDF"}
            </button>

            {/* Iframe preview */}
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-[700px] rounded-xl border border-gray-200 dark:border-gray-700"
                title="Preview lettre de motivation PDF"
              />
            )}

            {/* Download PDF + DOCX */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={!letterText.trim()}
                className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition-all hover:bg-green-700 disabled:opacity-50"
              >
                Telecharger PDF
              </button>
              <button
                onClick={handleDownloadDocx}
                disabled={docxStatus === "loading" || !letterText.trim()}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {docxStatus === "loading" ? "..." : docxStatus === "done" ? "DOCX telecharge !" : "Telecharger Word"}
              </button>
            </div>
            {pdfError && <p className="text-center text-xs text-red-600">{pdfError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Résultat de l'analyse ----------

type ResultTab = "resultats" | "cv" | "lettre" | "contacts";

const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: "resultats", label: "Resultats" },
  { id: "cv", label: "CV ameliore" },
  { id: "lettre", label: "Lettre de motivation" },
  { id: "contacts", label: "Contacts" },
];

function MatchResult({
  data,
  cvText,
  jobContent,
  userEmail,
  providerToken,
  initialCvText,
  initialCoverLetter,
  initialContacts,
  initialEmails,
  onSave,
}: {
  data: MatchAnalysisResponse;
  cvText: string;
  jobContent: string;
  userEmail?: string;
  providerToken?: string | null;
  initialCvText?: string | null;
  initialCoverLetter?: string | null;
  initialContacts?: FindContactsResponse | null;
  initialEmails?: DraftedEmail[] | null;
  onSave?: (fields: Record<string, unknown>) => void;
}) {
  const [language, setLanguage] = useState<LangCode>("fr");
  const [activeTab, setActiveTab] = useState<ResultTab>("resultats");
  const [generatedCvText, setGeneratedCvText] = useState<string>(initialCvText ?? "");
  const scoreColor =
    data.score_current >= 7
      ? "text-green-600"
      : data.score_current >= 4
      ? "text-orange-500"
      : "text-red-500";

  return (
    <div className="mt-6 space-y-0">
      {/* En-tete poste */}
      <div className="pb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.job_title}</h2>
        <p className="text-gray-500 dark:text-gray-400">{data.company}</p>
      </div>

      {/* Scores — toujours visibles */}
      <div className="flex gap-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-4">
        <ScoreGauge score={data.score_current} label="Ton CV aujourd'hui" color={scoreColor} />
        <div className="flex items-center text-2xl text-gray-300">&rarr;</div>
        <ScoreGauge score={data.score_potential} label="Apres ameliorations" color="text-green-600" />
      </div>

      {/* Sous-onglets */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 -mx-1 px-1 pb-1 pt-2">
        <div className="flex rounded-xl bg-gray-200 dark:bg-gray-800 p-1 gap-1">
          {RESULT_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-all ${
                activeTab === t.id
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu des sous-onglets */}
      <div className="pt-4">
        {/* --- Onglet Resultats --- */}
        {activeTab === "resultats" && (
          <div className="space-y-6">
            <p className="rounded-xl bg-blue-50 dark:bg-blue-900/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 leading-relaxed">{data.summary}</p>

            {data.strengths.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Ce qui colle deja</h3>
                <ul className="space-y-1">
                  {data.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="mt-0.5 text-green-500">&#10003;</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.improvements.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Ameliorations a faire</h3>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Clique &quot;Copier&quot; pour copier une suggestion et l&apos;appliquer toi-meme dans ton CV original.
                </p>
                <div className="space-y-4">
                  {data.improvements.map((item, i) => (
                    <ImprovementCard key={i} item={item} />
                  ))}
                </div>
              </div>
            )}

            {data.suggested_project && (
              <div>
                <h3 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Projet recommande pour ce poste</h3>
                <SuggestedProjectCard project={data.suggested_project} />
              </div>
            )}
          </div>
        )}

        {/* --- Onglet CV ameliore --- */}
        {activeTab === "cv" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200">CV ameliore</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  L&apos;IA reecrit ton CV avec les ameliorations. Modifie-le avant de telecharger.
                </p>
              </div>
              <LanguagePicker value={language} onChange={setLanguage} />
            </div>
            <CVPreviewSection
              cvText={cvText}
              jobContent={jobContent}
              jobTitle={data.job_title}
              improvements={data.improvements}
              suggestedProject={data.suggested_project}
              language={language}
              initialText={initialCvText}
              onTextGenerated={(text) => { setGeneratedCvText(text); onSave?.({ generated_cv_text: text }); }}
            />
          </div>
        )}

        {/* --- Onglet Lettre de motivation --- */}
        {activeTab === "lettre" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200">Lettre de motivation</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Generee sur mesure a partir de ton CV et de l&apos;offre. Modifiable avant telechargement.
                </p>
              </div>
              <LanguagePicker value={language} onChange={setLanguage} />
            </div>
            <CoverLetterSection
              cvText={cvText}
              jobContent={jobContent}
              jobTitle={data.job_title}
              company={data.company}
              language={language}
              initialText={initialCoverLetter}
              onTextGenerated={(text) => onSave?.({ cover_letter_text: text })}
            />
          </div>
        )}

        {/* --- Onglet Contacts --- */}
        {activeTab === "contacts" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 dark:text-gray-200">Contacts pertinents & emails</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                3 personnes cles a approcher — ni trop hauts places, ni hors sujet.
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Langue des emails</p>
              <LanguagePicker value={language} onChange={setLanguage} />
            </div>
            <ContactSection
              jobContent={jobContent}
              jobTitle={data.job_title}
              company={data.company}
              cvText={cvText}
              language={language}
              userEmail={userEmail}
              providerToken={providerToken}
              improvedCvText={generatedCvText || undefined}
              initialContacts={initialContacts}
              initialEmails={initialEmails}
              onContactsFound={(contacts) => onSave?.({ contacts_data: contacts })}
              onEmailsDrafted={(emails) => onSave?.({ drafted_emails: emails })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Preparation entretien (multi-etapes) ----------

const PRIORITY_COLORS: Record<string, string> = {
  critique: "bg-red-100 text-red-700 border-red-200",
  important: "bg-orange-100 text-orange-700 border-orange-200",
  bonus: "bg-green-100 text-green-700 border-green-200",
};
const LEVEL_LABELS: Record<string, string> = {
  debutant: "Debutant",
  intermediaire: "Intermediaire",
  avance: "Avance",
};
const DIFFICULTY_COLORS: Record<string, string> = {
  facile: "bg-green-100 text-green-700",
  moyen: "bg-orange-100 text-orange-700",
  difficile: "bg-red-100 text-red-700",
};
const CATEGORY_LABELS: Record<string, string> = {
  fit: "Fit / Motivation",
  technique: "Technique",
  cas_pratique: "Cas pratique",
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function FlashCardItem({ card, index }: { card: FlashCard; index: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped(!flipped)}
      className={`text-left w-full rounded-lg border-2 p-3 transition-all duration-200 ${
        flipped
          ? "border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/30"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-200 dark:hover:border-purple-700"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-100 dark:bg-purple-900/50 text-[10px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.q}</p>
          {flipped && (
            <p className="mt-2 text-sm text-purple-700 dark:text-purple-300 leading-relaxed border-t border-purple-200 dark:border-purple-700 pt-2">
              {card.a}
            </p>
          )}
          {!flipped && (
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 italic">Clique pour voir la reponse</p>
          )}
        </div>
      </div>
    </button>
  );
}

function StudyTopicCard({
  topic,
  onExpand,
  detail,
  loadingDetail,
}: {
  topic: StudyTopicSummary;
  onExpand: () => void;
  detail: TopicDetailResponse | null;
  loadingDetail: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const prioClass = PRIORITY_COLORS[topic.priority] ?? PRIORITY_COLORS.important;
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${prioClass}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${prioClass}`}>
              {topic.priority}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Niveau actuel : {LEVEL_LABELS[topic.current_level] ?? topic.current_level}
            </span>
          </div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">{topic.topic}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{topic.why}</p>
        </div>
        <div className="flex items-center gap-1 ml-2 mt-1">
          {detail && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="shrink-0 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              title={collapsed ? "Afficher" : "Masquer"}
            >
              {collapsed ? "+" : "-"}
            </button>
          )}
          {!detail && (
            <button
              onClick={onExpand}
              disabled={loadingDetail}
              className="shrink-0 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-all"
            >
              {loadingDetail ? <Spinner /> : "Approfondir"}
            </button>
          )}
        </div>
      </div>

      {detail && !collapsed && (
        <div className="space-y-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          {/* Resume */}
          {detail.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300 italic bg-white/60 dark:bg-gray-800/60 rounded-lg px-3 py-2">
              {detail.summary}
            </p>
          )}

          {/* Concepts cles */}
          {detail.key_concepts && detail.key_concepts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                Concepts cles
              </h4>
              <div className="space-y-2">
                {detail.key_concepts.map((c: KeyConcept, i: number) => (
                  <div key={i} className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
                    <p className="font-semibold text-sm text-blue-700 dark:text-blue-400">{c.name}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{c.explanation}</p>
                    {c.interview_tip && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 border-l-2 border-amber-400">
                        En entretien : {c.interview_tip}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Erreurs courantes */}
          {detail.common_mistakes && detail.common_mistakes.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                Erreurs courantes
              </h4>
              <div className="space-y-1.5">
                {detail.common_mistakes.map((m: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900/40">
                    <span className="text-red-500 shrink-0 mt-0.5 text-xs">&#10007;</span>
                    <p className="text-red-800 dark:text-red-300">{m}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flashcards Q/R */}
          {detail.quick_recap && detail.quick_recap.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                Revision rapide
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.quick_recap.map((card: FlashCard, i: number) => (
                  <FlashCardItem key={i} card={card} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Fallback texte libre (ancienne version ou si summary vide) */}
          {detail.what_to_study && (!detail.key_concepts || detail.key_concepts.length === 0) && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Ce qu&apos;il faut savoir
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{detail.what_to_study}</p>
            </div>
          )}

          {/* Ressources */}
          {detail.resources && detail.resources.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                Ressources
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.resources.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all group">
                    <span className="text-lg shrink-0 mt-0.5">
                      {r.type === "video" ? "\uD83C\uDFA5" : r.type === "cours" ? "\uD83C\uDF93" : r.type === "exercice" ? "\u270D\uFE0F" : "\uD83D\uDCDA"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:underline truncate">{r.title}</p>
                      {r.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{r.description}</p>}
                      <span className="inline-block mt-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {r.type}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, index }: { q: InterviewQuestion; index: number }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const diffClass = DIFFICULTY_COLORS[q.difficulty] ?? DIFFICULTY_COLORS.moyen;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">
          {index + 1}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {CATEGORY_LABELS[q.category] ?? q.category}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffClass}`}>
              {q.difficulty}
            </span>
          </div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{q.question}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 italic pl-10">{q.tips}</p>
      {q.sample_answer && (
        <div className="pl-10">
          <button onClick={() => setShowAnswer(!showAnswer)}
            className="text-xs text-indigo-600 hover:underline">
            {showAnswer ? "Masquer la reponse" : "Voir un exemple de reponse"}
          </button>
          {showAnswer && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 leading-relaxed">
              {q.sample_answer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Composant d'evaluation d'une reponse ----------

const VERDICT_STYLES: Record<string, string> = {
  excellent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  bon: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  moyen: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  insuffisant: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
};

function EvaluationDisplay({ evaluation, question }: { evaluation: AnswerEvaluation; question?: string }) {
  const [showImproved, setShowImproved] = useState(false);
  const verdictClass = VERDICT_STYLES[evaluation.verdict] ?? VERDICT_STYLES.moyen;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      {/* Score + verdict */}
      <div className="flex items-center gap-3">
        <div className={`text-2xl font-bold ${
          evaluation.score >= 8 ? "text-green-600" : evaluation.score >= 6 ? "text-blue-600" : evaluation.score >= 4 ? "text-orange-500" : "text-red-500"
        }`}>
          {evaluation.score}<span className="text-sm text-gray-400">/10</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${verdictClass}`}>
          {evaluation.verdict}
        </span>
      </div>
      {/* Points forts */}
      {evaluation.strengths.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">Points forts</p>
          <ul className="space-y-1">
            {evaluation.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-green-500 shrink-0 mt-0.5">&#10003;</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Axes d'amelioration */}
      {evaluation.weaknesses.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">A ameliorer</p>
          <ul className="space-y-1">
            {evaluation.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-orange-500 shrink-0 mt-0.5">&#9679;</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Reponse amelioree */}
      {evaluation.improved_answer && (
        <div>
          <button onClick={() => setShowImproved(!showImproved)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            {showImproved ? "Masquer la reponse ideale" : "Voir une reponse ideale"}
          </button>
          {showImproved && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 leading-relaxed border border-indigo-100 dark:border-indigo-800">
              {evaluation.improved_answer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ---------- Mode Entrainement ----------

const EVAL_STEPS: ProgressStep[] = [
  { label: "Analyse de la reponse", duration: 4 },
  { label: "Evaluation", duration: 6 },
];

function TrainingMode({
  questions,
  cvText,
  jobContent,
  jobTitle,
}: {
  questions: InterviewQuestion[];
  cvText: string;
  jobContent: string;
  jobTitle: string;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evalStatus, setEvalStatus] = useState<GenerateStatus>("idle");
  const [evalResult, setEvalResult] = useState<AnswerEvaluation | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ q: InterviewQuestion; answer: string; eval: AnswerEvaluation }[]>([]);
  const evalAbort = useRef<AbortController | null>(null);

  const q = questions[currentIdx];
  const diffClass = DIFFICULTY_COLORS[q.difficulty] ?? DIFFICULTY_COLORS.moyen;

  async function handleSubmitAnswer() {
    if (!answer.trim()) return;
    if (evalStatus === "loading") { evalAbort.current?.abort(); return; }
    evalAbort.current = new AbortController();
    setEvalStatus("loading");
    setEvalError(null);
    setEvalResult(null);
    try {
      const evaluation = await evaluateSingleAnswer(
        { question: q.question, category: q.category, difficulty: q.difficulty, candidate_answer: answer.trim() },
        jobTitle, cvText, jobContent, evalAbort.current.signal,
      );
      setEvalResult(evaluation);
      setEvalStatus("done");
      setHistory(prev => [...prev, { q, answer: answer.trim(), eval: evaluation }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setEvalStatus("idle"); return; }
      setEvalError(err instanceof Error ? err.message : "Erreur d'evaluation.");
      setEvalStatus("error");
    }
  }

  function handleNext() {
    setAnswer("");
    setEvalResult(null);
    setEvalStatus("idle");
    setEvalError(null);
    setCurrentIdx(prev => Math.min(prev + 1, questions.length - 1));
  }

  const isLast = currentIdx >= questions.length - 1;
  const answeredCount = history.length;
  const avgScore = answeredCount > 0 ? (history.reduce((s, h) => s + h.eval.score, 0) / answeredCount) : 0;

  return (
    <div className="space-y-4">
      {/* Progression */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Question {currentIdx + 1} / {questions.length}
        </p>
        {answeredCount > 0 && (
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Score moyen : <span className={avgScore >= 7 ? "text-green-600" : avgScore >= 5 ? "text-orange-500" : "text-red-500"}>{avgScore.toFixed(1)}/10</span>
          </p>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${((currentIdx + (evalResult ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      {/* Question */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">
            {currentIdx + 1}
          </span>
          <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {CATEGORY_LABELS[q.category] ?? q.category}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffClass}`}>
            {q.difficulty}
          </span>
        </div>
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{q.question}</p>
      </div>

      {/* Zone de reponse */}
      {!evalResult && (
        <div className="space-y-3">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Ecris ta reponse ici..."
            className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-800"
            disabled={evalStatus === "loading"}
          />
          <button
            onClick={handleSubmitAnswer}
            disabled={!answer.trim() && evalStatus !== "loading"}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {evalStatus === "loading" ? (
              <span className="flex items-center justify-center gap-2"><Spinner />Evaluation en cours...</span>
            ) : "Soumettre ma reponse"}
          </button>
          <ProgressTracker steps={EVAL_STEPS} active={evalStatus === "loading"} />
          {evalError && <p className="text-sm text-red-600">{evalError}</p>}
        </div>
      )}

      {/* Resultat de l'evaluation */}
      {evalResult && (
        <div className="space-y-3">
          <EvaluationDisplay evaluation={evalResult} />
          {!isLast ? (
            <button onClick={handleNext}
              className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-all hover:bg-indigo-700">
              Question suivante
            </button>
          ) : (
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-center">
              <p className="text-lg font-bold text-green-800 dark:text-green-300">Entrainement termine !</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Score moyen : {avgScore.toFixed(1)}/10 sur {answeredCount} questions
              </p>
            </div>
          )}
        </div>
      )}

      {/* Historique des reponses evaluees */}
      {history.length > 0 && evalResult && (
        <details className="mt-4">
          <summary className="text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-600">
            Voir mes {history.length} reponses precedentes
          </summary>
          <div className="space-y-3 mt-3">
            {history.map((h, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Q{i + 1}. {h.q.question}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">Ta reponse : {h.answer.slice(0, 150)}{h.answer.length > 150 ? "..." : ""}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${h.eval.score >= 7 ? "text-green-600" : h.eval.score >= 5 ? "text-orange-500" : "text-red-500"}`}>
                    {h.eval.score}/10
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium border ${VERDICT_STYLES[h.eval.verdict] ?? VERDICT_STYLES.moyen}`}>
                    {h.eval.verdict}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}


// ---------- Mode Vrai Entretien ----------

const TIMER_DURATIONS: Record<string, number> = {
  facile: 90,
  moyen: 120,
  difficile: 180,
};

function RealInterviewMode({
  questions,
  cvText,
  jobContent,
  jobTitle,
}: {
  questions: InterviewQuestion[];
  cvText: string;
  jobContent: string;
  jobTitle: string;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [timeTaken, setTimeTaken] = useState<number[]>(() => questions.map(() => 0));
  const [phase, setPhase] = useState<"countdown" | "answering" | "overtime" | "finished" | "evaluating" | "results">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(0);
  const [batchResult, setBatchResult] = useState<EvaluateBatchResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const evalAbort = useRef<AbortController | null>(null);

  const q = questions[currentIdx];
  const maxTime = TIMER_DURATIONS[q.difficulty] ?? 120;
  const diffClass = DIFFICULTY_COLORS[q.difficulty] ?? DIFFICULTY_COLORS.moyen;

  // Countdown 3-2-1
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("answering");
      setTimer(0);
      return;
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  // Timer principal
  useEffect(() => {
    if (phase !== "answering" && phase !== "overtime") return;
    timerRef.current = setInterval(() => {
      setTimer(t => {
        const next = t + 1;
        if (next >= maxTime && phase === "answering") {
          setPhase("overtime");
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, maxTime]);

  function handleNext() {
    // Sauvegarder le temps pris
    setTimeTaken(prev => { const n = [...prev]; n[currentIdx] = timer; return n; });

    if (currentIdx >= questions.length - 1) {
      setPhase("finished");
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Passer a la question suivante
    setCurrentIdx(prev => prev + 1);
    setCountdown(3);
    setPhase("countdown");
    setTimer(0);
  }

  async function handleEvaluate() {
    setPhase("evaluating");
    evalAbort.current = new AbortController();
    setEvalError(null);
    try {
      const answersToEval: AnswerToEvaluate[] = questions.map((q, i) => ({
        question: q.question,
        category: q.category,
        difficulty: q.difficulty,
        candidate_answer: answers[i] || "(pas de reponse)",
        time_taken: timeTaken[i],
      }));
      const result = await evaluateBatchAnswers(answersToEval, jobTitle, cvText, jobContent, evalAbort.current.signal);
      setBatchResult(result);
      setPhase("results");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setPhase("finished"); return; }
      setEvalError(err instanceof Error ? err.message : "Erreur d'evaluation.");
      setPhase("finished");
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const remaining = Math.max(0, maxTime - timer);
  const pctRemaining = Math.max(0, (remaining / maxTime) * 100);

  // Phase : countdown
  if (phase === "countdown") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Question {currentIdx + 1} / {questions.length}</p>
        <div className="text-8xl font-black text-indigo-600 dark:text-indigo-400 animate-pulse">
          {countdown}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Prepare-toi...</p>
      </div>
    );
  }

  // Phase : answering / overtime
  if (phase === "answering" || phase === "overtime") {
    return (
      <div className="space-y-4">
        {/* Barre de progression globale */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Question {currentIdx + 1} / {questions.length}
          </p>
          <div className="flex items-center gap-2">
            {questions.map((_, i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${
                i < currentIdx ? "bg-indigo-500" : i === currentIdx ? "bg-indigo-400 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
              }`} />
            ))}
          </div>
        </div>

        {/* Timer */}
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                phase === "overtime" ? "bg-red-500 animate-pulse" : remaining <= 15 ? "bg-orange-500" : "bg-green-500"
              }`}
              style={{ width: `${phase === "overtime" ? 100 : pctRemaining}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono font-bold ${
              phase === "overtime" ? "text-red-600 dark:text-red-400" : remaining <= 15 ? "text-orange-600" : "text-gray-500"
            }`}>
              {phase === "overtime" ? `+${formatTime(timer - maxTime)}` : formatTime(remaining)}
            </span>
            <span className="text-xs text-gray-400">{formatTime(maxTime)} allouees</span>
          </div>
        </div>

        {/* Message overtime */}
        {phase === "overtime" && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-center">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Temps ecoule ! Donne vite ta reponse.</p>
          </div>
        )}

        {/* Question */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">
              {currentIdx + 1}
            </span>
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {CATEGORY_LABELS[q.category] ?? q.category}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffClass}`}>
              {q.difficulty}
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{q.question}</p>
        </div>

        {/* Zone de reponse */}
        <textarea
          value={answers[currentIdx]}
          onChange={(e) => setAnswers(prev => { const n = [...prev]; n[currentIdx] = e.target.value; return n; })}
          rows={5}
          placeholder="Ecris ta reponse..."
          autoFocus
          className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-800"
        />

        <button onClick={handleNext}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-all hover:bg-indigo-700">
          {currentIdx >= questions.length - 1 ? "Terminer l'entretien" : "Question suivante"}
        </button>
      </div>
    );
  }

  // Phase : finished (avant evaluation)
  if (phase === "finished") {
    const answeredCount = answers.filter(a => a.trim()).length;
    return (
      <div className="space-y-4 py-8">
        <div className="text-center space-y-2">
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">Entretien termine</p>
          <p className="text-gray-500 dark:text-gray-400">
            {answeredCount} / {questions.length} questions repondues
          </p>
        </div>
        <button onClick={handleEvaluate}
          className="w-full rounded-xl bg-purple-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-purple-700">
          Obtenir mon evaluation
        </button>
        {evalError && <p className="text-sm text-red-600 text-center">{evalError}</p>}
      </div>
    );
  }

  // Phase : evaluating
  if (phase === "evaluating") {
    return (
      <div className="space-y-4 py-8">
        <div className="text-center space-y-2">
          <Spinner />
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Evaluation en cours...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">L&apos;IA analyse tes {questions.length} reponses</p>
        </div>
        <ProgressTracker steps={[
          { label: "Lecture des reponses", duration: 6 },
          { label: "Evaluation individuelle", duration: 20 },
          { label: "Bilan global", duration: 10 },
        ]} active={true} />
      </div>
    );
  }

  // Phase : results
  if (phase === "results" && batchResult) {
    const overallClass = batchResult.overall_score >= 7 ? "text-green-600" : batchResult.overall_score >= 5 ? "text-orange-500" : "text-red-500";
    return (
      <div className="space-y-6">
        {/* Bilan global */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-800 p-6 text-center space-y-3">
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Score global</p>
          <p className={`text-5xl font-black ${overallClass}`}>
            {batchResult.overall_score}<span className="text-2xl text-gray-400">/10</span>
          </p>
          <span className={`inline-block rounded-full px-4 py-1 text-sm font-semibold border ${VERDICT_STYLES[batchResult.overall_verdict] ?? VERDICT_STYLES.moyen}`}>
            {batchResult.overall_verdict}
          </span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 max-w-lg mx-auto leading-relaxed">{batchResult.summary}</p>
        </div>

        {/* Detail par question */}
        <div className="space-y-4">
          <h4 className="font-bold text-gray-800 dark:text-gray-200">Detail par question</h4>
          {questions.map((q, i) => {
            const ev = batchResult.evaluations[i];
            if (!ev) return null;
            return (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{q.question}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">
                      Ta reponse : {(answers[i] || "(vide)").slice(0, 100)}{answers[i]?.length > 100 ? "..." : ""}
                      {timeTaken[i] > 0 && <span className="ml-2 text-gray-400">({formatTime(timeTaken[i])})</span>}
                    </p>
                  </div>
                </div>
                <EvaluationDisplay evaluation={ev} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}


// ---------- Mode Entretien Audio ----------

type AudioPhase = "ready" | "warmup" | "ai-speaking" | "listening" | "acknowledging" | "finished" | "evaluating" | "results";

const LANG_LOCALE: Record<string, string> = {
  fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE", pt: "pt-PT",
};

const WARMUP_PHRASES: Record<string, string> = {
  fr: "Bonjour ! Es-tu pret a commencer l'entretien ? Quand tu es pret, clique sur le bouton pour demarrer.",
  en: "Hello! Are you ready to start the interview? When you're ready, click the button to begin.",
  es: "Hola! Estas listo para comenzar la entrevista? Cuando estes listo, haz clic en el boton para empezar.",
  de: "Hallo! Bist du bereit fuer das Interview? Wenn du bereit bist, klicke auf den Button um zu starten.",
  pt: "Ola! Estas pronto para comecar a entrevista? Quando estiveres pronto, clica no botao para comecar.",
};

const END_PHRASES: Record<string, string> = {
  fr: "Merci, c'est la fin de l'entretien. Voyons tes resultats.",
  en: "Thank you, the interview is over. Let's see your results.",
  es: "Gracias, la entrevista ha terminado. Veamos tus resultados.",
  de: "Danke, das Interview ist vorbei. Schauen wir uns deine Ergebnisse an.",
  pt: "Obrigado, a entrevista terminou. Vamos ver os teus resultados.",
};

const ACK_PHRASES_BY_LANG: Record<string, string[]> = {
  fr: ["Tres bien, question suivante.", "D'accord, passons a la suite.", "Merci pour ta reponse.", "Bien note, continuons.", "OK, voyons la question suivante."],
  en: ["Very well, next question.", "Alright, let's move on.", "Thank you for your answer.", "Noted, let's continue.", "OK, next question."],
  es: ["Muy bien, siguiente pregunta.", "De acuerdo, continuemos.", "Gracias por tu respuesta.", "Anotado, sigamos.", "OK, siguiente pregunta."],
  de: ["Sehr gut, naechste Frage.", "In Ordnung, weiter gehts.", "Danke fuer deine Antwort.", "Notiert, machen wir weiter.", "OK, naechste Frage."],
  pt: ["Muito bem, proxima pergunta.", "Certo, vamos continuar.", "Obrigado pela tua resposta.", "Anotado, continuemos.", "OK, proxima pergunta."],
};

function AudioInterviewMode({
  questions,
  cvText,
  jobContent,
  jobTitle,
  lang = "fr",
}: {
  questions: InterviewQuestion[];
  cvText: string;
  jobContent: string;
  jobTitle: string;
  lang?: string;
}) {
  const [phase, setPhase] = useState<AudioPhase>("ready");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeTaken, setTimeTaken] = useState<number[]>([]);
  const [transcript, setTranscript] = useState("");
  const [batchResult, setBatchResult] = useState<EvaluateBatchResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [micGranted, setMicGranted] = useState(false);
  const [micChecked, setMicChecked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const recognitionRef = useRef<ReturnType<typeof Object> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);
  const listeningRef = useRef(false);
  const evalAbort = useRef<AbortController | null>(null);
  const ttsAbort = useRef<AbortController | null>(null);
  // Ref pour stocker le transcript courant (evite les closures stale)
  const transcriptRef = useRef("");
  // Ref pour detecter l'activite audio du micro
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Sync transcriptRef avec le state
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // Verifier support navigateur
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setBrowserSupported(false);
  }, []);

  // Cleanup au demontage
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      listeningRef.current = false;
      recognitionRef.current?.stop?.();
      audioRef.current?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      evalAbort.current?.abort();
      ttsAbort.current?.abort();
    };
  }, []);

  // Demander l'acces au micro
  const [micError, setMicError] = useState<string | null>(null);

  async function requestMicAccess() {
    setMicError(null);
    setMicChecked(false);

    // Verifier que l'API est disponible
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError("Ton navigateur ne supporte pas l'acces au micro. Utilise Chrome ou Edge, et assure-toi d'etre en HTTPS ou localhost.");
      setMicGranted(false);
      setMicChecked(true);
      return;
    }

    try {
      // Verifier d'abord l'etat de la permission
      if (navigator.permissions) {
        try {
          const permStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (permStatus.state === "denied") {
            setMicError("L'acces au micro est bloque. Clique sur l'icone cadenas dans la barre d'adresse de ton navigateur, autorise le micro, puis clique Reessayer.");
            setMicGranted(false);
            setMicChecked(true);
            return;
          }
        } catch { /* permissions.query pas supporte pour 'microphone' sur certains navigateurs */ }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicGranted(true);
      setMicChecked(true);
      micStreamRef.current = stream;
      // Configurer l'analyseur audio pour detecter quand l'utilisateur parle
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
    } catch (err) {
      setMicGranted(false);
      setMicChecked(true);
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setMicError("Tu as refuse l'acces au micro. Clique sur l'icone cadenas dans la barre d'adresse, autorise le micro, puis clique Reessayer.");
        } else if (err.name === "NotFoundError") {
          setMicError("Aucun micro detecte sur ton appareil. Branche un micro ou un casque avec micro, puis clique Reessayer.");
        } else {
          setMicError(`Erreur micro : ${err.message}`);
        }
      } else {
        setMicError("Impossible d'acceder au micro. Verifie les parametres de ton navigateur.");
      }
    }
  }

  // Demander l'acces au micro des le montage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestMicAccess(); }, []);

  // Boucle d'animation pour detecter si l'utilisateur parle (volume micro)
  function startVoiceDetection() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      if (!listeningRef.current) { setIsSpeaking(false); return; }
      analyser!.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;
      setIsSpeaking(avg > 15);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopVoiceDetection() {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setIsSpeaking(false);
  }

  // --- TTS : lire un texte a voix haute ---
  async function speakText(text: string): Promise<void> {
    ttsAbort.current = new AbortController();
    const blob = await fetchTTS(text, "nova", ttsAbort.current.signal);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Erreur lecture audio")); };
      audio.play().catch(reject);
    });
  }

  // --- Demarrer l'entretien (phase warmup : "es-tu pret ?") ---
  async function startInterview() {
    stoppedRef.current = false;
    setCurrentIdx(0);
    setAnswers([]);
    setTimeTaken([]);
    setBatchResult(null);
    setEvalError(null);
    setPhase("warmup");

    // Resume audio context si suspendu (politique navigateur)
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }

    try {
      await speakText(WARMUP_PHRASES[lang] ?? WARMUP_PHRASES.fr);
    } catch {
      // Fallback silencieux
    }
  }

  // --- Lancer les questions apres confirmation ---
  async function confirmReady() {
    if (stoppedRef.current) return;
    await askQuestion(0);
  }

  // --- Poser une question via TTS ---
  async function askQuestion(idx: number) {
    if (stoppedRef.current) return;
    setTranscript("");
    transcriptRef.current = "";

    if (ttsEnabled) {
      setPhase("ai-speaking");
      try {
        await speakText(questions[idx].question);
        if (stoppedRef.current) return;
        startListening();
      } catch {
        // Fallback : si TTS echoue, passer directement a l'ecoute
        if (!stoppedRef.current) startListening();
      }
    } else {
      // Mode sans voix : passer directement a l'ecoute
      startListening();
    }
  }

  // --- Couper la voix de l'IA et repondre immediatement ---
  function skipToAnswer() {
    audioRef.current?.pause();
    ttsAbort.current?.abort();
    if (!stoppedRef.current) startListening();
  }

  // --- Commencer l'ecoute micro ---
  function startListening() {
    setPhase("listening");
    setListenSeconds(0);
    setTranscript("");
    transcriptRef.current = "";
    startTimeRef.current = Date.now();
    listeningRef.current = true;

    // Timer d'affichage
    timerRef.current = setInterval(() => {
      setListenSeconds(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Demarrer la detection de voix (icone micro animee)
    startVoiceDetection();

    // Web Speech API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = LANG_LOCALE[lang] ?? "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);
      transcriptRef.current = text;
    };

    // Redemarrer si l'API coupe apres un silence
    recognition.onend = () => {
      if (listeningRef.current) {
        try { recognition.start(); } catch { /* deja en cours */ }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        console.error("Micro non autorise — verifier les permissions du navigateur");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        console.warn("SpeechRecognition error:", e.error);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  // --- Arreter l'ecoute ---
  function stopListening() {
    listeningRef.current = false;
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceDetection();
  }

  // --- Question suivante (enchainement immediat) ---
  async function nextQuestion() {
    stopListening();
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const currentTranscript = transcriptRef.current;

    setAnswers(prev => [...prev, currentTranscript]);
    setTimeTaken(prev => [...prev, elapsed]);
    setTranscript("");
    transcriptRef.current = "";

    const nextIdx = currentIdx + 1;
    if (nextIdx >= questions.length) {
      setCurrentIdx(nextIdx);
      setPhase("finished");
    } else {
      setCurrentIdx(nextIdx);
      if (!stoppedRef.current) await askQuestion(nextIdx);
    }
  }

  // --- Arreter l'entretien ---
  function stopInterview() {
    stoppedRef.current = true;
    stopListening();
    audioRef.current?.pause();
    ttsAbort.current?.abort();

    // Sauvegarder la reponse en cours si on ecoutait
    if (phase === "listening" && transcriptRef.current.trim()) {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setAnswers(prev => [...prev, transcriptRef.current]);
      setTimeTaken(prev => [...prev, elapsed]);
    }
    setPhase("finished");
  }

  // --- Evaluer toutes les reponses ---
  async function handleEvaluate() {
    if (answers.length === 0) return;
    evalAbort.current = new AbortController();
    setPhase("evaluating");
    setEvalError(null);

    try {
      const toEvaluate: AnswerToEvaluate[] = answers.map((a, i) => ({
        question: questions[i].question,
        category: questions[i].category,
        difficulty: questions[i].difficulty,
        candidate_answer: a,
        time_taken: timeTaken[i],
      }));
      const result = await evaluateBatchAnswers(toEvaluate, jobTitle, cvText, jobContent, evalAbort.current.signal);
      setBatchResult(result);
      setPhase("results");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setEvalError(err instanceof Error ? err.message : "Erreur d'evaluation.");
      setPhase("finished");
    }
  }

  function formatTime(s: number): string {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  // --- Navigateur non supporte ---
  if (!browserSupported) {
    return (
      <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-6 text-center space-y-2">
        <p className="text-orange-700 dark:text-orange-300 font-semibold">Navigateur non compatible</p>
        <p className="text-sm text-orange-600 dark:text-orange-400">
          L&apos;entretien audio necessite Chrome ou Edge. Firefox et Safari ne supportent pas la reconnaissance vocale.
        </p>
      </div>
    );
  }

  // --- Phase : Ready ---
  if (phase === "ready") {
    return (
      <div className="text-center space-y-6 py-8">
        <div className="mx-auto h-24 w-24 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <svg className="h-12 w-12 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Entretien audio</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
            L&apos;IA va te poser {questions.length} questions a voix haute. Reponds oralement — ta voix sera analysee en temps reel.
          </p>
        </div>
        <div className="space-y-1 text-xs text-gray-400 dark:text-gray-500">
          {micGranted ? (
            <p className="text-green-500 dark:text-green-400 font-medium">Micro detecte et autorise</p>
          ) : micChecked ? (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-left space-y-2 max-w-md mx-auto">
              <p className="text-red-700 dark:text-red-300 font-semibold text-sm">Micro non detecte ou acces refuse</p>
              <p className="text-red-600 dark:text-red-400 text-xs">
                {micError ?? "Verifie que ton micro est branche et autorise l'acces dans les parametres de ton navigateur."}
              </p>
              <button
                onClick={requestMicAccess}
                className="rounded-lg bg-red-100 dark:bg-red-900/50 px-4 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors"
              >
                Reessayer
              </button>
            </div>
          ) : (
            <p className="text-orange-500 dark:text-orange-400 font-medium">Autorise l&apos;acces au micro quand le navigateur le demande</p>
          )}
          <p>Chrome ou Edge recommande</p>
        </div>
        {/* Toggle lecture vocale */}
        <label className="flex items-center justify-center gap-3 cursor-pointer">
          <span className="text-sm text-gray-600 dark:text-gray-400">L&apos;IA lit les questions a voix haute</span>
          <button
            type="button"
            role="switch"
            aria-checked={ttsEnabled}
            onClick={() => setTtsEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
              ttsEnabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
              ttsEnabled ? "translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </label>
        <button
          onClick={startInterview}
          disabled={!micGranted}
          className={`rounded-xl px-8 py-4 text-lg font-semibold text-white transition-all ${
            micGranted
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
          }`}
        >
          Commencer l&apos;entretien
        </button>
      </div>
    );
  }

  // --- Phase : Warmup (IA demande si pret) ---
  if (phase === "warmup") {
    return (
      <div className="text-center space-y-6 py-8">
        <div className="mx-auto relative h-24 w-24">
          <div className="absolute inset-0 rounded-full bg-indigo-400/30 animate-ping" />
          <div className="relative h-24 w-24 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <svg className="h-10 w-10 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.889 16H2a1 1 0 01-1-1V9a1 1 0 011-1h3.889l5.294-4.332a.5.5 0 01.817.387v15.89a.5.5 0 01-.817.387L5.89 16z" />
              <path d="M16 9a4 4 0 010 6M19 5a8.5 8.5 0 010 14" strokeWidth={2} stroke="currentColor" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Preparation en cours...</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">L&apos;intervieweur va te parler, ecoute bien.</p>
        </div>
        <button
          onClick={confirmReady}
          className="rounded-xl bg-green-600 px-8 py-4 text-lg font-semibold text-white hover:bg-green-700 transition-all"
        >
          Je suis pret, on commence !
        </button>
        <button onClick={() => { stoppedRef.current = true; setPhase("ready"); }}
          className="block mx-auto text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          Annuler
        </button>
      </div>
    );
  }

  // --- Phase : Acknowledging (acquiescement IA entre questions) ---
  if (phase === "acknowledging") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Question {Math.min(currentIdx + 1, questions.length)} / {questions.length}
          </p>
          <button onClick={stopInterview}
            className="rounded-lg bg-red-100 dark:bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
            Arreter l&apos;entretien
          </button>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(currentIdx / questions.length) * 100}%` }} />
        </div>
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 animate-pulse">
            L&apos;intervieweur prend note...
          </p>
        </div>
      </div>
    );
  }

  // --- Phase : AI Speaking ---
  if (phase === "ai-speaking") {
    return (
      <div className="space-y-6">
        {/* Header + stop */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Question {currentIdx + 1} / {questions.length}
          </p>
          <button onClick={stopInterview}
            className="rounded-lg bg-red-100 dark:bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
            Arreter l&apos;entretien
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(currentIdx / questions.length) * 100}%` }} />
        </div>
        {/* Animation */}
        <div className="text-center space-y-6 py-6">
          <div className="mx-auto relative h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-indigo-400/30 animate-ping" />
            <div className="relative h-24 w-24 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <svg className="h-10 w-10 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.889 16H2a1 1 0 01-1-1V9a1 1 0 011-1h3.889l5.294-4.332a.5.5 0 01.817.387v15.89a.5.5 0 01-.817.387L5.89 16z" />
                <path d="M16 9a4 4 0 010 6M19 5a8.5 8.5 0 010 14" strokeWidth={2} stroke="currentColor" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 animate-pulse">
            L&apos;intervieweur parle...
          </p>
        </div>
        {/* Question texte */}
        <div className="mx-auto max-w-lg rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">{currentIdx + 1}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[questions[currentIdx].difficulty] ?? ""}`}>
              {questions[currentIdx].difficulty}
            </span>
          </div>
          <p className="text-gray-800 dark:text-gray-200">{questions[currentIdx].question}</p>
        </div>
        {/* Bouton repondre tout de suite */}
        <button
          onClick={skipToAnswer}
          className="w-full rounded-xl bg-green-600 px-6 py-3.5 font-semibold text-white hover:bg-green-700 transition-all"
        >
          Je connais la reponse, repondre maintenant
        </button>
      </div>
    );
  }

  // --- Phase : Listening ---
  if (phase === "listening") {
    return (
      <div className="space-y-6">
        {/* Header + stop */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Question {currentIdx + 1} / {questions.length}
          </p>
          <button onClick={stopInterview}
            className="rounded-lg bg-red-100 dark:bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
            Arreter l&apos;entretien
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(currentIdx / questions.length) * 100}%` }} />
        </div>
        {/* Question rappel */}
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">{currentIdx + 1}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[questions[currentIdx].difficulty] ?? ""}`}>
                {questions[currentIdx].difficulty}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{formatTime(listenSeconds)}</span>
            </div>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{questions[currentIdx].question}</p>
        </div>
        {/* Micro animation — s'illumine quand l'utilisateur parle */}
        <div className="text-center">
          <div className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center transition-all duration-200 ${
            isSpeaking
              ? "bg-red-500 dark:bg-red-600 shadow-lg shadow-red-500/40 scale-110"
              : "bg-red-100 dark:bg-red-900/40 scale-100"
          }`}>
            <svg className={`h-10 w-10 transition-colors duration-200 ${
              isSpeaking ? "text-white" : "text-red-600 dark:text-red-400"
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className={`text-xs mt-2 font-medium transition-colors duration-200 ${
            isSpeaking
              ? "text-red-600 dark:text-red-400"
              : "text-gray-400 dark:text-gray-500"
          }`}>
            {isSpeaking ? "Parle, je t'ecoute..." : "En attente de ta voix..."}
          </p>
          {/* Indicateur discret que la reconnaissance fonctionne */}
          {transcript.trim() && (
            <p className="text-xs text-green-500 dark:text-green-400 mt-1 font-medium">
              Reponse captee ({transcript.trim().split(/\s+/).length} mots)
            </p>
          )}
        </div>
        {/* Bouton suivant */}
        <button
          onClick={nextQuestion}
          disabled={!transcript.trim() && listenSeconds < 10}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {currentIdx + 1 >= questions.length ? "Terminer l'entretien" : "Question suivante"}
        </button>
        {listenSeconds >= 10 && !transcript.trim() && (
          <button
            onClick={nextQuestion}
            className="w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer mt-1"
          >
            Passer cette question
          </button>
        )}
      </div>
    );
  }

  // --- Phase : Finished ---
  if (phase === "finished") {
    return (
      <div className="text-center space-y-6 py-8">
        <div className="mx-auto h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
          <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Entretien termine</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {answers.length} question{answers.length > 1 ? "s" : ""} repondue{answers.length > 1 ? "s" : ""} sur {questions.length}
          </p>
        </div>
        {evalError && <p className="text-sm text-red-600">{evalError}</p>}
        {answers.length > 0 && (
          <button
            onClick={handleEvaluate}
            className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white hover:bg-indigo-700 transition-all"
          >
            Obtenir mon evaluation
          </button>
        )}
      </div>
    );
  }

  // --- Phase : Evaluating ---
  if (phase === "evaluating") {
    return (
      <div className="space-y-4 py-8">
        <div className="text-center space-y-2">
          <Spinner />
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Evaluation en cours...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">L&apos;IA analyse tes {answers.length} reponses</p>
        </div>
        <ProgressTracker steps={[
          { label: "Lecture des reponses", duration: 6 },
          { label: "Evaluation individuelle", duration: 20 },
          { label: "Bilan global", duration: 10 },
        ]} active={true} />
      </div>
    );
  }

  // --- Phase : Results ---
  if (phase === "results" && batchResult) {
    const overallClass = batchResult.overall_score >= 7 ? "text-green-600" : batchResult.overall_score >= 5 ? "text-orange-500" : "text-red-500";
    return (
      <div className="space-y-6">
        {/* Bilan global */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-800 p-6 text-center space-y-3">
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Score global</p>
          <p className={`text-5xl font-black ${overallClass}`}>
            {batchResult.overall_score}<span className="text-2xl text-gray-400">/10</span>
          </p>
          <span className={`inline-block rounded-full px-4 py-1 text-sm font-semibold border ${VERDICT_STYLES[batchResult.overall_verdict] ?? VERDICT_STYLES.moyen}`}>
            {batchResult.overall_verdict}
          </span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 max-w-lg mx-auto leading-relaxed">{batchResult.summary}</p>
        </div>

        {/* Detail par question */}
        <div className="space-y-4">
          <h4 className="font-bold text-gray-800 dark:text-gray-200">Detail par question</h4>
          {questions.slice(0, answers.length).map((q, i) => {
            const ev = batchResult.evaluations[i];
            if (!ev) return null;
            return (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{q.question}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">
                      Ta reponse : {(answers[i] || "(vide)").slice(0, 150)}{answers[i]?.length > 150 ? "..." : ""}
                      {timeTaken[i] > 0 && <span className="ml-2 text-gray-400">({formatTime(timeTaken[i])})</span>}
                    </p>
                  </div>
                </div>
                <EvaluationDisplay evaluation={ev} />
              </div>
            );
          })}
        </div>

        {/* Recommencer */}
        <button
          onClick={() => { setPhase("ready"); setCurrentIdx(0); setAnswers([]); setTimeTaken([]); setBatchResult(null); }}
          className="w-full rounded-xl border border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Recommencer l&apos;entretien audio
        </button>
      </div>
    );
  }

  return null;
}


type InterviewSource = "manual" | "current" | "history";
type InterviewPath = "prepare" | "practice" | null;
type QuestionMode = "training" | "real" | "audio" | null;

function InterviewPrepForm({
  currentCvText,
  currentJobContent,
  currentJobTitle,
  currentCompany,
  onUpdateCandidature,
  loadedInterviewOverview,
  loadedInterviewTopicDetails,
  loadedInterviewQuestions,
  resultKey,
  lang,
}: {
  currentCvText?: string;
  currentJobContent?: string;
  currentJobTitle?: string;
  currentCompany?: string;
  onUpdateCandidature?: (fields: Record<string, unknown>) => void;
  loadedInterviewOverview?: InterviewOverviewResponse | null;
  loadedInterviewTopicDetails?: Record<string, TopicDetailResponse> | null;
  loadedInterviewQuestions?: InterviewQuestion[] | null;
  resultKey?: number;
  lang?: string;
}) {
  const { user } = useAuth();
  const hasCurrent = !!(currentCvText && currentJobContent);

  // Source de donnees
  const [source, setSource] = useState<InterviewSource>(hasCurrent ? "current" : "manual");
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);

  // Donnees du formulaire
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState(hasCurrent ? currentCvText! : "");
  const [jobContent, setJobContent] = useState(hasCurrent ? currentJobContent! : "");
  const [extraSkills, setExtraSkills] = useState("");
  const [sourceLabel, setSourceLabel] = useState(
    hasCurrent && currentJobTitle ? `${currentJobTitle}${currentCompany ? ` @ ${currentCompany}` : ""}` : ""
  );

  // Choix du parcours : preparer ou s'entrainer
  const [interviewPath, setInterviewPath] = useState<InterviewPath>(null);

  // Sync quand la candidature en cours change
  useEffect(() => {
    if (hasCurrent && source === "current") {
      setCvText(currentCvText!);
      setJobContent(currentJobContent!);
      setSourceLabel(`${currentJobTitle || "Poste"}${currentCompany ? ` @ ${currentCompany}` : ""}`);
    }
  }, [currentCvText, currentJobContent, currentJobTitle, currentCompany]);

  // Restaurer les données d'entretien chargées depuis l'historique
  useEffect(() => {
    // Reset d'abord pour éviter les données stale
    setOverview(null);
    setOverviewStatus("idle");
    setTopicDetails({});
    setQuestions(null);
    setQuestionsStatus("idle");
    setQuestionMode(null);
    setInterviewPath(null);

    if (loadedInterviewOverview) {
      setOverview(loadedInterviewOverview);
      setOverviewStatus("success");
      setSource("current");
      setInterviewPath("prepare");
    }
    if (loadedInterviewTopicDetails) {
      setTopicDetails(loadedInterviewTopicDetails);
    }
    if (loadedInterviewQuestions) {
      setQuestions(loadedInterviewQuestions);
      setQuestionsStatus("done");
      if (!loadedInterviewOverview) setInterviewPath("practice");
    }
  }, [resultKey]);

  function handleSelectSource(s: InterviewSource) {
    setSource(s);
    // Reset resultats
    setOverview(null);
    setOverviewStatus("idle");
    setTopicDetails({});
    setQuestions(null);
    setQuestionsStatus("idle");
    setQuestionMode(null);
    setInterviewPath(null);

    if (s === "current" && hasCurrent) {
      setCvText(currentCvText!);
      setJobContent(currentJobContent!);
      setCvFile(null);
      setSourceLabel(`${currentJobTitle || "Poste"}${currentCompany ? ` @ ${currentCompany}` : ""}`);
    } else if (s === "history") {
      setShowHistoryPicker(true);
    } else {
      setCvText("");
      setJobContent("");
      setCvFile(null);
      setSourceLabel("");
    }
  }

  function handleHistorySelect(data: LoadedCandidature) {
    setCvText(data.cvText);
    setJobContent(data.jobContent);
    setCvFile(null);
    setSourceLabel(`${data.result.job_title}${data.result.company ? ` @ ${data.result.company}` : ""}`);
    setSource("history");
    setShowHistoryPicker(false);
  }

  // Etape 1 : overview
  const [overviewStatus, setOverviewStatus] = useState<Status>("idle");
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overview, setOverview] = useState<InterviewOverviewResponse | null>(null);

  // Etape 2 : details par sujet
  const [topicDetails, setTopicDetails] = useState<Record<string, TopicDetailResponse>>({});
  const [topicLoading, setTopicLoading] = useState<string | null>(null);
  const [topicError, setTopicError] = useState<string | null>(null);

  // Etape 3 : questions
  const [questionsStatus, setQuestionsStatus] = useState<GenerateStatus>("idle");
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[] | null>(null);
  const [questionMode, setQuestionMode] = useState<QuestionMode>(null);
  const [questionTotal, setQuestionTotal] = useState<number>(10);
  const [distributionMode, setDistributionMode] = useState<"auto" | "manual">("auto");
  const [distFit, setDistFit] = useState(3);
  const [distCv, setDistCv] = useState(2);
  const [distTechnique, setDistTechnique] = useState(3);
  const [distCasPratique, setDistCasPratique] = useState(2);

  // Abort controllers
  const overviewAbort = useRef<AbortController | null>(null);
  const topicAbort = useRef<AbortController | null>(null);
  const questionsAbort = useRef<AbortController | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isReady = source === "manual"
    ? cvFile !== null && jobContent.trim().length >= 50
    : cvText.length > 0 && jobContent.trim().length >= 50;

  async function handleOverview(e: React.FormEvent) {
    e.preventDefault();
    if (overviewStatus === "loading") { overviewAbort.current?.abort(); return; }
    if (!isReady) return;
    overviewAbort.current = new AbortController();
    setOverviewStatus("loading");
    setOverviewError(null);
    setOverview(null);
    setTopicDetails({});
    setQuestions(null);
    setQuestionsStatus("idle");
    setQuestionMode(null);
    try {
      let text = cvText;
      if (!text && cvFile) {
        const cvData = await uploadCV(cvFile, overviewAbort.current.signal);
        text = cvData.full_text;
        setCvText(text);
      }
      const data = await interviewOverview(text, jobContent.trim(), extraSkills.trim(), overviewAbort.current.signal);
      setOverview(data);
      setOverviewStatus("success");
      onUpdateCandidature?.({ interview_overview: data });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setOverviewStatus("idle"); return; }
      setOverviewError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setOverviewStatus("error");
    }
  }

  async function handleExpandTopic(topicName: string) {
    if (topicDetails[topicName]) return;
    if (topicLoading === topicName) { topicAbort.current?.abort(); return; }
    if (topicLoading) return;
    topicAbort.current = new AbortController();
    setTopicLoading(topicName);
    setTopicError(null);
    try {
      const detail = await interviewTopicDetail(cvText, jobContent.trim(), topicName, topicAbort.current.signal);
      setTopicDetails((prev) => {
        const updated = { ...prev, [topicName]: detail };
        onUpdateCandidature?.({ interview_topic_details: updated });
        return updated;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { /* silent */ }
      else setTopicError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setTopicLoading(null);
    }
  }

  async function handleQuestions() {
    if (questionsStatus === "loading") { questionsAbort.current?.abort(); return; }
    questionsAbort.current = new AbortController();
    setQuestionsStatus("loading");
    setQuestionsError(null);
    try {
      // Upload CV si necessaire (mode manuel, pas encore de texte)
      let text = cvText;
      if (!text && cvFile) {
        const cvData = await uploadCV(cvFile, questionsAbort.current.signal);
        text = cvData.full_text;
        setCvText(text);
      }
      const dist = distributionMode === "manual"
        ? { fit: distFit, cv: distCv, technique: distTechnique, cas_pratique: distCasPratique }
        : null;
      const data = await interviewQuestions(text, jobContent.trim(), extraSkills.trim(), questionsAbort.current.signal, questionTotal, dist);
      setQuestions(data.questions);
      setQuestionsStatus("done");
      onUpdateCandidature?.({ interview_questions: data.questions });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setQuestionsStatus("idle"); return; }
      setQuestionsError(err instanceof Error ? err.message : "Erreur de generation.");
      setQuestionsStatus("error");
    }
  }

  return (
    <div className="space-y-8">
      {/* Selecteur de source */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Source des donnees</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {hasCurrent && (
            <button
              type="button"
              onClick={() => handleSelectSource("current")}
              className={`rounded-xl border-2 px-3 py-3 text-left text-sm transition-all ${
                source === "current"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
              }`}
            >
              <p className={`font-semibold ${source === "current" ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>
                Analyse en cours
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {currentJobTitle}{currentCompany ? ` @ ${currentCompany}` : ""}
              </p>
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={() => handleSelectSource("history")}
              className={`rounded-xl border-2 px-3 py-3 text-left text-sm transition-all ${
                source === "history"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
              }`}
            >
              <p className={`font-semibold ${source === "history" ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>
                Depuis l&apos;historique
              </p>
              {source === "history" && sourceLabel ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{sourceLabel}</p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Charger une ancienne candidature</p>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSelectSource("manual")}
            className={`rounded-xl border-2 px-3 py-3 text-left text-sm transition-all ${
              source === "manual"
                ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
            }`}
          >
            <p className={`font-semibold ${source === "manual" ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>
              Importer manuellement
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">CV + offre a coller</p>
          </button>
        </div>

        {/* Indicateur de source selectionnee (non-manual) */}
        {source !== "manual" && sourceLabel && (
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 flex items-center gap-3">
            <span className="text-green-600 text-lg">&#10003;</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">CV et offre charges</p>
              <p className="text-xs text-green-600 dark:text-green-400 truncate">{sourceLabel}</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal historique */}
      {showHistoryPicker && (
        <HistoryPanel
          onClose={() => setShowHistoryPicker(false)}
          onSelect={handleHistorySelect}
        />
      )}

      {/* Formulaire manuel (CV + offre) */}
      {source === "manual" && (
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Ton CV <span className="text-red-500">*</span>
            </label>
            <div onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                cvFile ? "border-green-400 bg-green-50" : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 hover:border-blue-400 hover:bg-blue-50"
              }`}>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => { setCvFile(e.target.files?.[0] ?? null); setCvText(""); }} />
              {cvFile ? (
                <>
                  <span className="text-3xl">&#10003;</span>
                  <p className="mt-2 font-medium text-green-700">{cvFile.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{(cvFile.size / 1024).toFixed(0)} Ko</p>
                </>
              ) : (
                <>
                  <span className="text-3xl">&#128196;</span>
                  <p className="mt-2 font-medium text-gray-600 dark:text-gray-400">Glisse ton CV ici ou clique pour choisir</p>
                  <p className="text-xs text-gray-400">PDF uniquement, max 5 Mo</p>
                </>
              )}
            </div>
          </div>

          {/* Offre */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Texte de l&apos;offre <span className="text-red-500">*</span>
            </label>
            <textarea value={jobContent} onChange={(e) => setJobContent(e.target.value)} rows={6}
              placeholder="Colle ici le contenu complet de l'offre d'emploi..."
              className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800" />
            <p className="mt-1 text-right text-xs text-gray-400">
              {jobContent.trim().length} caracteres
              {jobContent.trim().length > 0 && jobContent.trim().length < 50 && (
                <span className="ml-1 text-orange-500">(minimum 50)</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Extra skills — toujours visible */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Competences supplementaires <span className="text-gray-400">(optionnel)</span>
        </label>
        <textarea value={extraSkills} onChange={(e) => setExtraSkills(e.target.value)} rows={3}
          placeholder="Ce que tu sais faire mais qui n'est pas dans ton CV (ex: j'ai fait un projet perso en Python, je connais les bases de la valorisation DCF...)"
          className="w-full resize-y rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800" />
      </div>

      {/* Choix du parcours — visible quand les donnees sont pretes et aucun parcours selectionne */}
      {isReady && !interviewPath && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Que veux-tu faire ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setInterviewPath("prepare")}
              className="rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-600 p-5 text-left transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">&#128214;</span>
                <p className="font-bold text-gray-900 dark:text-gray-100">Approfondir les notions</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Evaluation de ton niveau, plan de revision structure avec ressources, concepts cles et points a maitriser pour le poste.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setInterviewPath("practice")}
              className="rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 p-5 text-left transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">&#127919;</span>
                <p className="font-bold text-gray-900 dark:text-gray-100">Preparer un entretien en direct</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Entraine-toi avec des questions d&apos;entretien : mode ecrit, simulation chronometree ou entretien audio face a l&apos;IA.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ===== PARCOURS PREPARER ===== */}
      {interviewPath === "prepare" && (
        <div className="space-y-6">
          {/* Bouton lancer l'evaluation */}
          {overviewStatus !== "success" && (
            <form onSubmit={handleOverview} className="space-y-4">
              <button type="submit" disabled={!isReady && overviewStatus !== "loading"}
                className="w-full rounded-xl bg-purple-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">
                {overviewStatus === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Arreter l&apos;evaluation
                  </span>
                ) : "Preparer mon entretien"}
              </button>
              <ProgressTracker steps={INTERVIEW_OVERVIEW_STEPS} active={overviewStatus === "loading"} />
            </form>
          )}

          {overviewStatus === "error" && overviewError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-400">
              <strong>Erreur :</strong> {overviewError}
            </div>
          )}

          {/* Resultats : niveau + plan de revision */}
          {overviewStatus === "success" && overview && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{overview.job_title}</h2>
                <p className="text-gray-500 dark:text-gray-400">{overview.company}</p>
              </div>

              <div className="rounded-xl bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 px-4 py-3">
                <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-1">Ton niveau pour ce poste</h3>
                <p className="text-sm text-purple-800 dark:text-purple-300 leading-relaxed">{overview.candidate_level}</p>
              </div>

              {/* Plan de revision */}
              {overview.study_plan.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-gray-800 dark:text-gray-200">Plan de revision</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Clique sur &quot;Approfondir&quot; pour voir les details et ressources d&apos;un sujet.</p>
                  {topicError && <p className="text-sm text-red-600">{topicError}</p>}
                  <div className="space-y-3">
                    {overview.study_plan.map((t, i) => (
                      <StudyTopicCard
                        key={i}
                        topic={t}
                        onExpand={() => handleExpandTopic(t.topic)}
                        detail={topicDetails[t.topic] ?? null}
                        loadingDetail={topicLoading === t.topic}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Relancer + passer aux questions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => handleOverview(e)}
                  className="flex-1 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                >
                  Relancer l&apos;evaluation
                </button>
                <button
                  type="button"
                  onClick={() => setInterviewPath("practice")}
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-all"
                >
                  Passer aux questions
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== PARCOURS S'ENTRAINER ===== */}
      {interviewPath === "practice" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 dark:text-gray-200">Questions d&apos;entretien</h3>
            {/* Lien retour vers la preparation */}
            {overviewStatus !== "success" && (
              <button
                type="button"
                onClick={() => setInterviewPath("prepare")}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
              >
                Preparer d&apos;abord
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Genere des questions fit, techniques et cas pratiques specifiques a ce poste.
          </p>

          {/* Selecteur de mode */}
          {questionsStatus !== "done" && questionsStatus !== "loading" && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Choisis ton mode</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setQuestionMode("training")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    questionMode === "training"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">&#128218;</span>
                    <p className={`font-semibold ${questionMode === "training" ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"}`}>
                      Entrainement
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Reponds a chaque question a ton rythme. L&apos;IA evalue ta reponse immediatement apres.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionMode("real")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    questionMode === "real"
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">&#127919;</span>
                    <p className={`font-semibold ${questionMode === "real" ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>
                      Vrai entretien
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Questions une par une avec timer. Correction globale a la fin, comme un vrai entretien.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionMode("audio")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    questionMode === "audio"
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">&#127908;</span>
                    <p className={`font-semibold ${questionMode === "audio" ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-300"}`}>
                      Entretien audio
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    L&apos;IA pose les questions a voix haute. Reponds oralement avec ton micro.
                  </p>
                </button>
              </div>

              {/* Configuration du nombre et de la repartition */}
              <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Nombre de questions</p>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setQuestionTotal(n);
                        if (distributionMode === "manual") {
                          const ratio = n / questionTotal;
                          const newFit = Math.round(distFit * ratio);
                          const newCv = Math.round(distCv * ratio);
                          const newTech = Math.round(distTechnique * ratio);
                          const newCas = n - newFit - newCv - newTech;
                          setDistFit(Math.max(0, newFit));
                          setDistCv(Math.max(0, newCv));
                          setDistTechnique(Math.max(0, newTech));
                          setDistCasPratique(Math.max(0, newCas));
                        }
                      }}
                      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                        questionTotal === n
                          ? "bg-indigo-600 text-white"
                          : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-indigo-400"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider pt-2">Repartition</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDistributionMode("auto")}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                      distributionMode === "auto"
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-indigo-400"
                    }`}
                  >
                    IA decide
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionMode("manual")}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                      distributionMode === "manual"
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-indigo-400"
                    }`}
                  >
                    Personnaliser
                  </button>
                </div>

                {distributionMode === "manual" && (
                  <div className="space-y-2 pt-1">
                    {([
                      { label: "Fit", value: distFit, set: setDistFit, color: "text-blue-600 dark:text-blue-400" },
                      { label: "CV", value: distCv, set: setDistCv, color: "text-emerald-600 dark:text-emerald-400" },
                      { label: "Technique", value: distTechnique, set: setDistTechnique, color: "text-orange-600 dark:text-orange-400" },
                      { label: "Cas pratique", value: distCasPratique, set: setDistCasPratique, color: "text-purple-600 dark:text-purple-400" },
                    ] as const).map(({ label, value, set, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className={`text-sm font-medium w-24 ${color}`}>{label}</span>
                        <input
                          type="range"
                          min={0}
                          max={questionTotal}
                          value={value}
                          onChange={(e) => set(Number(e.target.value))}
                          className="flex-1 h-2 rounded-lg appearance-none bg-gray-300 dark:bg-gray-600 accent-indigo-600"
                        />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-6 text-right">{value}</span>
                      </div>
                    ))}
                    <p className={`text-xs font-medium text-right ${
                      distFit + distCv + distTechnique + distCasPratique === questionTotal
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500"
                    }`}>
                      Total : {distFit + distCv + distTechnique + distCasPratique} / {questionTotal}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleQuestions}
                disabled={!questionMode || (distributionMode === "manual" && distFit + distCv + distTechnique + distCasPratique !== questionTotal)}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generer {questionTotal} questions d&apos;entretien
              </button>
            </div>
          )}

          {/* Loading */}
          {questionsStatus === "loading" && (
            <div className="space-y-3">
              <button
                onClick={handleQuestions}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700"
              >
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Arreter la generation
                </span>
              </button>
              <ProgressTracker steps={INTERVIEW_QUESTIONS_STEPS} active={true} />
            </div>
          )}
          {questionsError && <p className="text-sm text-red-600">{questionsError}</p>}

          {/* Questions generees */}
          {questions && questions.length > 0 && questionsStatus === "done" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {questions.filter(q => q.category === "fit").length} fit,{" "}
                  {questions.filter(q => q.category === "cv").length} CV,{" "}
                  {questions.filter(q => q.category === "technique").length} techniques,{" "}
                  {questions.filter(q => q.category === "cas_pratique").length} cas pratiques
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  questionMode === "training"
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                    : questionMode === "audio"
                      ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                      : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                }`}>
                  {questionMode === "training" ? "Entrainement" : questionMode === "audio" ? "Entretien audio" : "Vrai entretien"}
                </span>
              </div>

              {/* Mode entrainement */}
              {questionMode === "training" && (
                <TrainingMode
                  questions={questions}
                  cvText={cvText}
                  jobContent={jobContent.trim()}
                  jobTitle={overview?.job_title ?? ""}
                />
              )}

              {/* Mode vrai entretien */}
              {questionMode === "real" && (
                <RealInterviewMode
                  questions={questions}
                  cvText={cvText}
                  jobContent={jobContent.trim()}
                  jobTitle={overview?.job_title ?? ""}
                />
              )}

              {/* Mode entretien audio */}
              {questionMode === "audio" && (
                <AudioInterviewMode
                  questions={questions}
                  cvText={cvText}
                  jobContent={jobContent.trim()}
                  jobTitle={overview?.job_title ?? ""}
                  lang={lang}
                />
              )}

              {/* Bouton re-generer */}
              <button
                onClick={() => { setQuestions(null); setQuestionsStatus("idle"); setQuestionMode(null); }}
                className="w-full rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 px-6 py-3 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
              >
                Recommencer avec de nouvelles questions
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bouton retour au choix — visible quand un parcours est actif */}
      {interviewPath && overviewStatus !== "loading" && questionsStatus !== "loading" && (
        <button
          type="button"
          onClick={() => {
            setInterviewPath(null);
            setQuestions(null);
            setQuestionsStatus("idle");
            setQuestionMode(null);
          }}
          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
        >
          Changer de parcours
        </button>
      )}
    </div>
  );
}

// ---------- Formulaire principal ----------

export default function AnalyzerForm({
  loadedCandidature,
  onCandidatureLoaded,
  loadedContactSearch,
  onContactSearchLoaded,
}: {
  loadedCandidature?: LoadedCandidature | null;
  onCandidatureLoaded?: () => void;
  loadedContactSearch?: LoadedContactSearch | null;
  onContactSearchLoaded?: () => void;
}) {
  const { user, loading: authLoading, signInWithGoogle, providerToken } = useAuth();
  const [tab, setTab] = useState<AppTab>("candidature");
  const [cvInputMode, setCvInputMode] = useState<CVInputMode>("upload");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState<string>("");
  const [cvFromBuilder, setCvFromBuilder] = useState(false); // true si profil vient du formulaire
  const [jobContent, setJobContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchAnalysisResponse | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [appLang, setAppLang] = useState<LangCode>("fr");
  const [contactsLang, setContactsLang] = useState<LangCode>("fr");
  const [contactsUploading, setContactsUploading] = useState(false);
  const [candidatureId, setCandidatureId] = useState<string | null>(null);
  const candidatureIdRef = useRef<string | null>(null);
  // Contenu genere charge depuis l'historique (persiste apres que loadedCandidature soit null)
  const [loadedGenCv, setLoadedGenCv] = useState<string | null>(null);
  const [loadedCoverLetter, setLoadedCoverLetter] = useState<string | null>(null);
  const [loadedContacts, setLoadedContacts] = useState<FindContactsResponse | null>(null);
  const [loadedEmails, setLoadedEmails] = useState<DraftedEmail[] | null>(null);
  const [loadedInterviewOverview, setLoadedInterviewOverview] = useState<InterviewOverviewResponse | null>(null);
  const [loadedInterviewTopicDetails, setLoadedInterviewTopicDetails] = useState<Record<string, TopicDetailResponse> | null>(null);
  const [loadedInterviewQuestions, setLoadedInterviewQuestions] = useState<InterviewQuestion[] | null>(null);
  const [contactSearchId, setContactSearchId] = useState<string | null>(null);
  const contactSearchIdRef = useRef<string | null>(null);
  const [showLoadedContacts, setShowLoadedContacts] = useState(false); // true quand on charge une recherche contacts depuis l'historique
  const [resultKey, setResultKey] = useState(0); // Force remount de MatchResult quand on charge une candidature
  const [jobUrl, setJobUrl] = useState("");
  const [importStatus, setImportStatus] = useState<GenerateStatus>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitAbort = useRef<AbortController | null>(null);
  const importAbort = useRef<AbortController | null>(null);

  // Restaurer une candidature depuis l'historique
  useEffect(() => {
    if (!loadedCandidature) return;
    setCandidatureId(loadedCandidature.id); candidatureIdRef.current = loadedCandidature.id;
    setCvText(loadedCandidature.cvText);
    setJobContent(loadedCandidature.jobContent);
    setResult(loadedCandidature.result);
    setStatus("success");
    setCvFile(null);
    setCvFromBuilder(false);
    setError(null);
    setShowContacts(false);
    setTab("candidature");
    // Stocker le contenu genere en state local AVANT de notifier le parent (qui va nullifier loadedCandidature)
    setLoadedGenCv(loadedCandidature.generatedCvText ?? null);
    setLoadedCoverLetter(loadedCandidature.coverLetterText ?? null);
    setLoadedContacts(loadedCandidature.contactsData as FindContactsResponse | null ?? null);
    setLoadedEmails(loadedCandidature.draftedEmails as DraftedEmail[] | null ?? null);
    setLoadedInterviewOverview(loadedCandidature.interviewOverview ?? null);
    setLoadedInterviewTopicDetails(loadedCandidature.interviewTopicDetails ?? null);
    setLoadedInterviewQuestions(loadedCandidature.interviewQuestions ?? null);
    setResultKey((k) => k + 1);
    setShowLoadedContacts(false);
    onCandidatureLoaded?.();
  }, [loadedCandidature]);

  // Restaurer une recherche de contacts depuis l'historique
  useEffect(() => {
    if (!loadedContactSearch) return;
    // Reset l'etat precedent
    setResult(null);
    setStatus("idle");
    setError(null);
    setCandidatureId(null); candidatureIdRef.current = null;
    setCvFile(null);
    setCvText("");
    setCvFromBuilder(false);
    // Charger les donnees de la recherche contacts
    setJobContent(loadedContactSearch.jobContent);
    setLoadedContacts(loadedContactSearch.contactsData);
    setLoadedEmails(loadedContactSearch.draftedEmails);
    setContactSearchId(loadedContactSearch.id); contactSearchIdRef.current = loadedContactSearch.id;
    setShowLoadedContacts(true);
    setShowContacts(false);
    setTab("candidature");
    onContactSearchLoaded?.();
  }, [loadedContactSearch]);

  // Callback quand le formulaire CV est valide
  function handleBuilderComplete(text: string) {
    setCvText(text);
    setCvFromBuilder(true);
  }

  const hasCvReady = cvInputMode === "upload" ? cvFile !== null : (cvFromBuilder && cvText.length > 0);
  const isValid = hasCvReady && jobContent.trim().length >= 50;
  const canSearchContacts = jobContent.trim().length >= 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") { submitAbort.current?.abort(); return; }
    if (!isValid) return;

    submitAbort.current = new AbortController();
    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      let textForAnalysis = cvText;

      // Mode upload : extraire le texte du PDF
      if (cvInputMode === "upload" && cvFile) {
        const cvData = await uploadCV(cvFile, submitAbort.current.signal);
        textForAnalysis = cvData.full_text;
        setCvText(textForAnalysis);
      }
      // Mode builder : cvText est deja rempli via handleBuilderComplete

      const matchData = await analyzeMatch(textForAnalysis, jobContent.trim(), user?.email ?? undefined, submitAbort.current.signal);
      setResult(matchData);
      setStatus("success");

      // Sauvegarde automatique dans Supabase (capture l'ID pour updates ulterieurs)
      if (user) {
        supabase.from("candidatures").insert({
          user_id: user.id,
          cv_text: textForAnalysis,
          job_content: jobContent.trim(),
          job_title: matchData.job_title,
          company: matchData.company,
          score_current: matchData.score_current,
          score_potential: matchData.score_potential,
          strengths: matchData.strengths,
          improvements: matchData.improvements,
          summary: matchData.summary,
          suggested_project: matchData.suggested_project,
        }).select("id").single().then(({ data: saved, error: saveErr }) => {
          if (saveErr) console.warn("Sauvegarde candidature echouee:", saveErr.message);
          else {
            console.log("Candidature sauvegardee:", saved.id);
            setCandidatureId(saved.id); candidatureIdRef.current = saved.id;
          }
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setStatus("idle"); return; }
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus("error");
    }
  }

  // Mise a jour partielle de la candidature dans Supabase (utilise ref pour eviter les closures stalles)
  function updateCandidature(fields: Record<string, unknown>) {
    const id = candidatureIdRef.current;
    if (!id) { console.warn("updateCandidature: pas d'ID, sauvegarde ignoree"); return; }
    supabase.from("candidatures").update(fields).eq("id", id)
      .then(({ error: err }) => {
        if (err) console.warn("Mise a jour candidature echouee:", err.message);
        else console.log("Candidature mise a jour:", Object.keys(fields).join(", "));
      });
  }

  // Sauvegarde d'une recherche de contacts dans la table contact_searches
  function saveContactSearch(contacts: FindContactsResponse) {
    if (!user) return;
    supabase.from("contact_searches").insert({
      user_id: user.id,
      job_content: jobContent.trim(),
      job_title: contacts.position || "",
      company: contacts.company_name || "",
      contacts_data: contacts,
    }).select("id").single().then(({ data: saved, error: saveErr }) => {
      if (saveErr) console.warn("Sauvegarde recherche contacts echouee:", saveErr.message);
      else {
        console.log("Recherche contacts sauvegardee:", saved.id);
        setContactSearchId(saved.id); contactSearchIdRef.current = saved.id;
      }
    });
  }

  // Mise a jour partielle d'une recherche contacts (ex: emails rediges)
  function updateContactSearch(fields: Record<string, unknown>) {
    const id = contactSearchIdRef.current;
    if (!id) { console.warn("updateContactSearch: pas d'ID, sauvegarde ignoree"); return; }
    supabase.from("contact_searches").update(fields).eq("id", id)
      .then(({ error: err }) => {
        if (err) console.warn("Mise a jour recherche contacts echouee:", err.message);
        else console.log("Recherche contacts mise a jour:", Object.keys(fields).join(", "));
      });
  }

  function handleReset() {
    setCvFile(null);
    setCvText("");
    setCvFromBuilder(false);
    setCvInputMode("upload");
    setJobContent("");
    setStatus("idle");
    setError(null);
    setResult(null);
    setShowContacts(false);
    setCandidatureId(null); candidatureIdRef.current = null;
    setLoadedGenCv(null);
    setLoadedCoverLetter(null);
    setLoadedContacts(null);
    setLoadedEmails(null);
    setLoadedInterviewOverview(null);
    setLoadedInterviewTopicDetails(null);
    setLoadedInterviewQuestions(null);
    setContactSearchId(null); contactSearchIdRef.current = null;
    setShowLoadedContacts(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleShowContacts() {
    // Upload le CV si fichier fourni mais pas encore uploadé (nécessaire pour les emails)
    if (cvFile && !cvText) {
      setContactsUploading(true);
      try {
        const cvData = await uploadCV(cvFile);
        setCvText(cvData.full_text);
      } catch {
        // Pas bloquant — les contacts marchent sans CV, juste les emails seront limités
      }
      setContactsUploading(false);
    }
    setShowContacts(true);
  }

  async function handleImportJob() {
    if (importStatus === "loading") { importAbort.current?.abort(); return; }
    if (!jobUrl.trim()) return;
    importAbort.current = new AbortController();
    setImportStatus("loading");
    setImportError(null);
    try {
      const res = await importJobFromURL(jobUrl.trim(), importAbort.current.signal);
      setJobContent(res.text);
      setImportStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setImportStatus("idle"); return; }
      setImportError(err instanceof Error ? err.message : "Erreur d'import.");
      setImportStatus("error");
    }
  }

  // Note : la gate d'authentification + contrôle d'accès est gérée par AccessGate dans page.tsx
  // AnalyzerForm est toujours rendu avec un user connecté et approuvé.

  return (
    <div className="space-y-8">
      {/* Onglets */}
      <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
        <button
          type="button"
          onClick={() => setTab("candidature")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            tab === "candidature"
              ? "bg-white dark:bg-gray-800 text-blue-700 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Candidature
        </button>
        <button
          type="button"
          onClick={() => setTab("entretien")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            tab === "entretien"
              ? "bg-white dark:bg-gray-800 text-purple-700 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Entretien
        </button>
        <button
          type="button"
          onClick={() => setTab("dashboard")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            tab === "dashboard"
              ? "bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Suivi
        </button>
      </div>

      {/* Les 3 onglets sont toujours montés, on masque avec CSS */}
      <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
        <DashboardPanel />
      </div>

      <div style={{ display: tab === "entretien" ? "block" : "none" }}>
        <InterviewPrepForm
          currentCvText={cvText}
          currentJobContent={jobContent}
          currentJobTitle={result?.job_title}
          currentCompany={result?.company}
          onUpdateCandidature={updateCandidature}
          loadedInterviewOverview={loadedInterviewOverview}
          loadedInterviewTopicDetails={loadedInterviewTopicDetails}
          loadedInterviewQuestions={loadedInterviewQuestions}
          resultKey={resultKey}
          lang={appLang}
        />
      </div>

      <div style={{ display: tab === "candidature" ? "block" : "none" }}>
          {/* Formulaire masque apres analyse reussie */}
          <form onSubmit={handleSubmit} className="space-y-6" style={{ display: status === "success" && result ? "none" : undefined }}>
            {/* Toggle mode CV */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Ton CV <span className="text-red-500">*</span>
              </label>
              <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 mb-3">
                <button
                  type="button"
                  onClick={() => { setCvInputMode("upload"); setCvFromBuilder(false); setCvText(""); }}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                    cvInputMode === "upload"
                      ? "bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                  }`}
                >
                  Importer mon CV (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => { setCvInputMode("builder"); setCvFile(null); setCvText(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                    cvInputMode === "builder"
                      ? "bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                  }`}
                >
                  Creer mon CV de zero
                </button>
              </div>

              {/* Mode upload */}
              {cvInputMode === "upload" && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                    cvFile ? "border-green-400 bg-green-50" : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 hover:border-blue-400 hover:bg-blue-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      setCvFile(e.target.files?.[0] ?? null);
                      setCvText("");
                    }}
                  />
                  {cvFile ? (
                    <>
                      <span className="text-3xl">&#10003;</span>
                      <p className="mt-2 font-medium text-green-700">{cvFile.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{(cvFile.size / 1024).toFixed(0)} Ko — cliquer pour changer</p>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">&#128196;</span>
                      <p className="mt-2 font-medium text-gray-600 dark:text-gray-400">Glisse ton CV ici ou clique pour choisir</p>
                      <p className="text-xs text-gray-400">PDF uniquement, max 5 Mo</p>
                    </>
                  )}
                </div>
              )}

              {/* Mode builder */}
              {cvInputMode === "builder" && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                  {cvFromBuilder ? (
                    <div className="flex items-center gap-3">
                      <span className="text-green-600 text-2xl">&#10003;</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-green-700 dark:text-green-400">Profil enregistre</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{cvText.split("\n")[0]}</p>
                      </div>
                      <button type="button" onClick={() => { setCvFromBuilder(false); setCvText(""); }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <CVBuilderForm onComplete={handleBuilderComplete} />
                  )}
                </div>
              )}
            </div>

            {/* Offre d'emploi */}
            <div>
              <label htmlFor="job-content" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Offre d&apos;emploi <span className="text-red-500">*</span>
              </label>

              {/* Import par URL */}
              <div className="mb-1 flex gap-2">
                <input
                  type="url"
                  value={jobUrl}
                  onChange={(e) => { setJobUrl(e.target.value); setImportError(null); setImportStatus("idle"); }}
                  placeholder="Lien de l'offre (bouton Partager > Copier le lien)"
                  className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800"
                />
                <button
                  type="button"
                  onClick={handleImportJob}
                  disabled={!jobUrl.trim() && importStatus !== "loading"}
                  className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importStatus === "loading" ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Arreter
                    </span>
                  ) : "Importer"}
                </button>
              </div>
              <p className="mb-2 text-[11px] text-gray-400 dark:text-gray-500">
                Sur LinkedIn, utilise le bouton <span className="font-medium text-gray-500 dark:text-gray-400">Partager</span> de l&apos;offre puis <span className="font-medium text-gray-500 dark:text-gray-400">Copier le lien</span> (pas l&apos;URL de la barre du navigateur si tu es connecte).
              </p>
              {importError && <p className="mb-2 text-xs text-red-600">{importError}</p>}
              {importStatus === "done" && <p className="mb-2 text-xs text-green-600">Offre importee avec succes ! Verifie le texte ci-dessous.</p>}

              <div className="relative flex items-center gap-3 mb-3">
                <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500">ou colle le texte directement</span>
                <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
              </div>

              <textarea
                id="job-content"
                value={jobContent}
                onChange={(e) => setJobContent(e.target.value)}
                rows={8}
                placeholder="Colle ici le contenu complet de l'offre d'emploi..."
                className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {jobContent.trim().length} caracteres
                {jobContent.trim().length > 0 && jobContent.trim().length < 50 && (
                  <span className="ml-1 text-orange-500">(minimum 50)</span>
                )}
              </p>
            </div>

            {/* Boutons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={!isValid && status !== "loading"}
                className="rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Arreter l&apos;analyse
                  </span>
                ) : cvInputMode === "builder" ? "Analyser mon profil" : "Analyser mon CV"}
              </button>
              <button
                type="button"
                onClick={handleShowContacts}
                disabled={!canSearchContacts || contactsUploading}
                className="rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contactsUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Chargement...
                  </span>
                ) : "Trouver les contacts"}
              </button>
            </div>
          </form>

          {/* Progression + skeleton pendant le chargement */}
          {status === "loading" && (
            <div className="mt-6 space-y-4">
              <ProgressTracker
                steps={cvInputMode === "upload" ? ANALYSIS_STEPS_UPLOAD : ANALYSIS_STEPS_TEXT}
                active={true}
              />
              <AnalysisSkeleton />
            </div>
          )}

          {/* Erreur */}
          {status === "error" && error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-400">
              <strong>Erreur :</strong> {error}
            </div>
          )}

          {/* Contacts standalone (sans analyse) */}
          {showContacts && !result && (
            <div className="mt-6 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 p-6 space-y-4">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200">Contacts pertinents & emails</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  3 personnes cles a approcher — ni trop hauts places, ni hors sujet.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Langue des emails</p>
                <LanguagePicker value={contactsLang} onChange={setContactsLang} />
              </div>
              <ContactSection
                jobContent={jobContent}
                jobTitle={""}
                company={""}
                cvText={cvText}
                language={contactsLang}
                userEmail={user?.email ?? undefined}
                providerToken={providerToken}
                onContactsFound={(contacts) => saveContactSearch(contacts)}
                onEmailsDrafted={(emails) => updateContactSearch({ drafted_emails: emails })}
              />
            </div>
          )}

          {/* Contacts charges depuis l'historique (sans analyse CV) */}
          {showLoadedContacts && !result && loadedContacts && (
            <div className="mt-6 space-y-4">
              <button
                onClick={handleReset}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 transition-all hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                + Demarrer une nouvelle candidature
              </button>
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 p-6 space-y-4">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200">Contacts pertinents & emails</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Recherche chargee depuis l&apos;historique
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Langue des emails</p>
                  <LanguagePicker value={contactsLang} onChange={setContactsLang} />
                </div>
                <ContactSection
                  jobContent={jobContent}
                  jobTitle={loadedContacts.position || ""}
                  company={loadedContacts.company_name || ""}
                  cvText={cvText}
                  language={contactsLang}
                  userEmail={user?.email ?? undefined}
                  providerToken={providerToken}
                  initialContacts={loadedContacts}
                  initialEmails={loadedEmails}
                  onEmailsDrafted={(emails) => updateContactSearch({ drafted_emails: emails })}
                />
              </div>
            </div>
          )}

          {/* Resultats */}
          {status === "success" && result && (
            <>
              <button
                onClick={handleReset}
                className="mt-6 w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 transition-all hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                + Demarrer une nouvelle candidature
              </button>
              <MatchResult
                key={resultKey}
                data={result}
                cvText={cvText}
                jobContent={jobContent}
                userEmail={user?.email ?? undefined}
                providerToken={providerToken}
                initialCvText={loadedGenCv}
                initialCoverLetter={loadedCoverLetter}
                initialContacts={loadedContacts}
                initialEmails={loadedEmails}
                onSave={updateCandidature}
              />
            </>
          )}
      </div>
    </div>
  );
}
