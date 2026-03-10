/**
 * Fonctions d'appel à l'API FastAPI backend.
 * Toutes les URLs passent par NEXT_PUBLIC_API_URL défini dans .env.local.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------- Types miroirs des schémas Pydantic ----------

export interface CVUploadResponse {
  filename: string;
  full_text: string;
  text_preview: string;
  char_count: number;
  success: boolean;
}

export interface CVImprovement {
  category: string;
  current: string;
  suggestion: string;
  key_actions: string[];
  keywords: string[];
  impact: string;
}

export interface SuggestedProject {
  title: string;
  description: string;
  bullet_points?: string[];
  tech_stack: string[];
  why_relevant: string;
  to_replace: string;
  duration: string;
}

export interface MatchAnalysisResponse {
  job_title: string;
  company: string;
  score_current: number;   // float au dixième (ex: 7.6)
  score_potential: number;  // float au dixième
  strengths: string[];
  improvements: CVImprovement[];
  summary: string;
  suggested_project: SuggestedProject | null;
}

export interface JobImportResponse {
  text: string;
  source: string;
}

// ---------- Appels API ----------

export async function importJobFromURL(url: string, signal?: AbortSignal): Promise<JobImportResponse> {
  const res = await fetch(`${API_BASE}/import-job/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'import de l'offre.");
  }

  return res.json() as Promise<JobImportResponse>;
}

export async function uploadCV(file: File, signal?: AbortSignal): Promise<CVUploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/upload-cv/`, {
    method: "POST",
    body: form,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'upload du CV.");
  }

  return res.json() as Promise<CVUploadResponse>;
}

export async function analyzeMatch(
  cvText: string,
  jobContent: string,
  userEmail?: string,
  signal?: AbortSignal
): Promise<MatchAnalysisResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEmail) headers["X-User-Email"] = userEmail;
  const res = await fetch(`${API_BASE}/analyze-match/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ cv_text: cvText, job_content: jobContent }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'analyse.");
  }

  return res.json() as Promise<MatchAnalysisResponse>;
}

export async function generateCV(
  cvText: string,
  jobTitle: string,
  improvements: CVImprovement[],
  suggestedProject: SuggestedProject | null
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-cv/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cv_text: cvText,
      job_title: jobTitle,
      improvements,
      suggested_project: suggestedProject,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du CV.");
  }

  return res.blob();
}

export interface CVPreviewResult {
  preview_text: string;
  change_percentage: number;
}

export async function generateCVPreview(
  cvText: string,
  jobTitle: string,
  improvements: CVImprovement[],
  suggestedProject: SuggestedProject | null,
  language: string = "fr",
  signal?: AbortSignal
): Promise<CVPreviewResult> {
  const res = await fetch(`${API_BASE}/generate-cv/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cv_text: cvText,
      job_title: jobTitle,
      improvements,
      suggested_project: suggestedProject,
      language,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du CV.");
  }

  return res.json() as Promise<CVPreviewResult>;
}

export async function cvPreviewToPDF(content: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-cv/pdf-from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du PDF.");
  }

  return res.blob();
}

export async function generateCoverLetter(
  cvText: string,
  jobContent: string,
  jobTitle: string,
  company: string,
  language: string = "fr",
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${API_BASE}/cover-letter/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cv_text: cvText,
      job_content: jobContent,
      job_title: jobTitle,
      company,
      language,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération de la lettre.");
  }

  const data = await res.json();
  return data.content as string;
}

// ---------- Contacts & emails de networking ----------

export interface ContactEmailFormat {
  pattern: string;
  confidence: number;
  examples: string[];
}

export interface ContactProfile {
  rank: number;
  name: string;
  title: string;
  email: string;
  linkedin_url: string | null;
  linkedin_search_url: string;
  reasoning: string;
  priority_level: "high" | "medium" | "low";
  seniority: "junior" | "mid" | "senior" | "lead" | "manager" | "director";
  team_match: number;
  search_circle: 1 | 2 | 3;
  is_estimated: boolean;
  email_verified: "valid" | "invalid" | "unknown" | null;
  source: string;
}

export interface FindContactsResponse {
  company_name: string;
  team_name: string;
  position: string;
  email_format: ContactEmailFormat | null;
  contacts: ContactProfile[];
  email_domain: string;
  email_pattern: string;
  search_strategy: string;
  message: string | null;
}

export interface DraftedEmail {
  contact_name: string;
  contact_email: string;
  contact_title: string;
  subject: string;
  body: string;
}

export async function findContacts(
  jobContent: string,
  jobTitle: string,
  company: string,
  userEmail?: string,
  signal?: AbortSignal
): Promise<FindContactsResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEmail) headers["X-User-Email"] = userEmail;
  const res = await fetch(`${API_BASE}/contacts/find`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job_content: jobContent, job_title: jobTitle, company }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la recherche de contacts.");
  }
  return res.json() as Promise<FindContactsResponse>;
}

export async function draftEmails(
  cvText: string,
  jobTitle: string,
  company: string,
  contacts: ContactProfile[],
  language: string = "fr",
  jobContent: string = "",
  signal?: AbortSignal
): Promise<DraftedEmail[]> {
  const res = await fetch(`${API_BASE}/contacts/draft-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cv_text: cvText, job_title: jobTitle, company, contacts, language, job_content: jobContent }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la rédaction des emails.");
  }
  const data = await res.json();
  return data.emails as DraftedEmail[];
}

// ---------- Préparation entretien (multi-étapes) ----------

// Étape 1 : vue d'ensemble
export interface StudyTopicSummary {
  topic: string;
  priority: "critique" | "important" | "bonus";
  current_level: "debutant" | "intermediaire" | "avance";
  why: string;
}

export interface InterviewOverviewResponse {
  job_title: string;
  company: string;
  candidate_level: string;
  study_plan: StudyTopicSummary[];
}

// Étape 2 : détails d'un sujet
export interface StudyResource {
  title: string;
  url: string;
  type: "article" | "video" | "cours" | "exercice";
  description: string;
}

export interface KeyConcept {
  name: string;
  explanation: string;
  interview_tip: string;
}

export interface FlashCard {
  q: string;
  a: string;
}

export interface TopicDetailResponse {
  topic: string;
  summary: string;
  key_concepts: KeyConcept[];
  common_mistakes: string[];
  quick_recap: FlashCard[];
  what_to_study: string;
  resources: StudyResource[];
}

// Étape 3 : questions
export interface InterviewQuestion {
  question: string;
  category: "fit" | "cv" | "technique" | "cas_pratique";
  difficulty: "facile" | "moyen" | "difficile";
  tips: string;
  sample_answer: string;
}

export interface QuestionDistribution {
  fit: number;
  cv: number;
  technique: number;
  cas_pratique: number;
}

export interface QuestionsResponse {
  questions: InterviewQuestion[];
}

export async function interviewOverview(
  cvText: string,
  jobContent: string,
  extraSkills: string = "",
  signal?: AbortSignal
): Promise<InterviewOverviewResponse> {
  const res = await fetch(`${API_BASE}/interview/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cv_text: cvText, job_content: jobContent, extra_skills: extraSkills }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'évaluation.");
  }
  return res.json() as Promise<InterviewOverviewResponse>;
}

export async function interviewTopicDetail(
  cvText: string,
  jobContent: string,
  topic: string,
  signal?: AbortSignal
): Promise<TopicDetailResponse> {
  const res = await fetch(`${API_BASE}/interview/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cv_text: cvText, job_content: jobContent, topic }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors du chargement du sujet.");
  }
  return res.json() as Promise<TopicDetailResponse>;
}

export async function interviewQuestions(
  cvText: string,
  jobContent: string,
  extraSkills: string = "",
  signal?: AbortSignal,
  total: number = 10,
  distribution?: QuestionDistribution | null,
): Promise<QuestionsResponse> {
  const payload: Record<string, unknown> = {
    cv_text: cvText,
    job_content: jobContent,
    extra_skills: extraSkills,
    total,
  };
  if (distribution) payload.distribution = distribution;
  const res = await fetch(`${API_BASE}/interview/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération des questions.");
  }
  return res.json() as Promise<QuestionsResponse>;
}

// TTS : synthèse vocale via OpenAI
export async function fetchTTS(text: string, voice: string = "nova", signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/interview/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur TTS.");
  }
  return res.blob();
}

// Étape 4 : évaluation des réponses
export interface AnswerToEvaluate {
  question: string;
  category: string;
  difficulty: string;
  candidate_answer: string;
  time_taken?: number;
}

export interface AnswerEvaluation {
  score: number;
  strengths: string[];
  weaknesses: string[];
  improved_answer: string;
  verdict: "excellent" | "bon" | "moyen" | "insuffisant";
}

export interface EvaluateBatchResult {
  evaluations: AnswerEvaluation[];
  overall_score: number;
  overall_verdict: string;
  summary: string;
}

export async function evaluateSingleAnswer(
  answer: AnswerToEvaluate,
  jobTitle: string = "",
  cvText: string = "",
  jobContent: string = "",
  signal?: AbortSignal
): Promise<AnswerEvaluation> {
  const res = await fetch(`${API_BASE}/interview/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, job_title: jobTitle, cv_text: cvText, job_content: jobContent }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'évaluation.");
  }
  const data = await res.json();
  return data.evaluation as AnswerEvaluation;
}

export async function evaluateBatchAnswers(
  answers: AnswerToEvaluate[],
  jobTitle: string = "",
  cvText: string = "",
  jobContent: string = "",
  signal?: AbortSignal
): Promise<EvaluateBatchResult> {
  const res = await fetch(`${API_BASE}/interview/evaluate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, job_title: jobTitle, cv_text: cvText, job_content: jobContent }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de l'évaluation.");
  }
  return res.json() as Promise<EvaluateBatchResult>;
}

export async function cvPreviewToDocx(content: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-cv/docx-from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du DOCX.");
  }

  return res.blob();
}

export async function coverLetterToDocx(content: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/cover-letter/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du DOCX.");
  }

  return res.blob();
}

// ---------- Templates CV ----------

export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  sectors: string[];
  preview_color: string;
}

export interface TemplatesResponse {
  available: boolean;
  templates: CVTemplate[];
}

export async function getCVTemplates(): Promise<TemplatesResponse> {
  const res = await fetch(`${API_BASE}/generate-cv/templates`);
  return res.json() as Promise<TemplatesResponse>;
}

export async function suggestTemplate(jobTitle: string, jobContent: string): Promise<string> {
  const params = new URLSearchParams({ job_title: jobTitle, job_content: jobContent });
  const res = await fetch(`${API_BASE}/generate-cv/templates/suggest?${params}`);
  const data = await res.json();
  return data.suggested as string;
}

export async function cvPreviewToTemplatePDF(content: string, template: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-cv/pdf-from-template?template=${encodeURIComponent(template)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la generation du PDF template.");
  }

  return res.blob();
}

export async function cvPreviewToTemplateHTML(content: string, template: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_BASE}/generate-cv/html-from-template?template=${encodeURIComponent(template)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la generation du HTML template.");
  }

  return res.text();
}

// ---------- Access Control ----------

export interface AccessStatus {
  status: "approved" | "pending" | "denied" | "unknown";
  role: "admin" | "user";
  quota_limit: number;
}

export interface PendingUser {
  email: string;
  name: string;
  avatar_url: string;
  status: string;
  role: string;
  quota_limit: number;
  requested_at: string;
}

export async function getAccessStatus(userEmail: string): Promise<AccessStatus> {
  const res = await fetch(`${API_BASE}/access/status`, {
    headers: { "X-User-Email": userEmail },
  });
  return res.json() as Promise<AccessStatus>;
}

export async function requestAccess(
  userEmail: string,
  name: string,
  avatarUrl: string = ""
): Promise<AccessStatus> {
  const res = await fetch(`${API_BASE}/access/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": userEmail,
    },
    body: JSON.stringify({ name, avatar_url: avatarUrl }),
  });
  return res.json() as Promise<AccessStatus>;
}

export async function getPendingUsers(adminEmail: string): Promise<PendingUser[]> {
  const res = await fetch(`${API_BASE}/access/pending`, {
    headers: { "X-User-Email": adminEmail },
  });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json() as Promise<PendingUser[]>;
}

export async function decideAccess(
  adminEmail: string,
  targetEmail: string,
  decision: "approved" | "denied",
  quotaLimit: number = 20
): Promise<void> {
  const res = await fetch(`${API_BASE}/access/decide`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": adminEmail,
    },
    body: JSON.stringify({ email: targetEmail, decision, quota_limit: quotaLimit }),
  });
  if (!res.ok) throw new Error("Erreur lors de la décision");
}

// ---------- Quota ----------

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
}

export async function getQuota(userEmail?: string): Promise<QuotaInfo> {
  const headers: Record<string, string> = {};
  if (userEmail) headers["X-User-Email"] = userEmail;
  const res = await fetch(`${API_BASE}/quota/`, { headers });
  return res.json() as Promise<QuotaInfo>;
}

export async function coverLetterToPDF(content: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/cover-letter/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Erreur lors de la génération du PDF.");
  }

  return res.blob();
}
