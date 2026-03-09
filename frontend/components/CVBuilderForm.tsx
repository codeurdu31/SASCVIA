"use client";

import { useState } from "react";

// ---------- Types ----------

interface Formation {
  school: string;
  degree: string;
  dates: string;
  details: string;
}

interface Experience {
  company: string;
  title: string;
  dates: string;
  description: string;
}

interface Project {
  title: string;
  description: string;
  technologies: string;
}

export interface CVFormData {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  headline: string;
  formations: Formation[];
  experiences: Experience[];
  projects: Project[];
  skills: string;
  languages: string;
  interests: string;
}

const EMPTY_FORMATION: Formation = { school: "", degree: "", dates: "", details: "" };
const EMPTY_EXPERIENCE: Experience = { company: "", title: "", dates: "", description: "" };
const EMPTY_PROJECT: Project = { title: "", description: "", technologies: "" };

// ---------- Convertir le formulaire en texte CV ----------

export function cvFormToText(data: CVFormData): string {
  const lines: string[] = [];

  // En-tete
  lines.push(data.fullName.toUpperCase());
  if (data.headline) lines.push(data.headline);
  const contact = [data.email, data.phone, data.city].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  lines.push("");

  // Formations
  const formations = data.formations.filter((f) => f.school || f.degree);
  if (formations.length > 0) {
    lines.push("FORMATION");
    for (const f of formations) {
      lines.push(`${f.degree}${f.school ? ` — ${f.school}` : ""}${f.dates ? ` (${f.dates})` : ""}`);
      if (f.details) lines.push(`  ${f.details}`);
    }
    lines.push("");
  }

  // Experiences
  const experiences = data.experiences.filter((e) => e.company || e.title);
  if (experiences.length > 0) {
    lines.push("EXPERIENCE");
    for (const e of experiences) {
      lines.push(`${e.title}${e.company ? ` — ${e.company}` : ""}${e.dates ? ` (${e.dates})` : ""}`);
      if (e.description) {
        for (const line of e.description.split("\n").filter(Boolean)) {
          lines.push(`  - ${line.replace(/^[-•]\s*/, "")}`);
        }
      }
    }
    lines.push("");
  }

  // Projets
  const projects = data.projects.filter((p) => p.title);
  if (projects.length > 0) {
    lines.push("PROJETS");
    for (const p of projects) {
      lines.push(`${p.title}${p.technologies ? ` [${p.technologies}]` : ""}`);
      if (p.description) lines.push(`  ${p.description}`);
    }
    lines.push("");
  }

  // Competences
  if (data.skills.trim()) {
    lines.push("COMPETENCES");
    lines.push(data.skills.trim());
    lines.push("");
  }

  // Langues
  if (data.languages.trim()) {
    lines.push("LANGUES");
    lines.push(data.languages.trim());
    lines.push("");
  }

  // Centres d'interet
  if (data.interests.trim()) {
    lines.push("CENTRES D'INTERET");
    lines.push(data.interests.trim());
  }

  return lines.join("\n").trim();
}

// ---------- Sous-composants ----------

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800 transition-colors";

const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

function SectionHeader({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
      <button
        type="button"
        onClick={onAdd}
        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
      >
        + {addLabel}
      </button>
    </div>
  );
}

// ---------- Composant principal ----------

export default function CVBuilderForm({
  onComplete,
}: {
  onComplete: (text: string) => void;
}) {
  const [data, setData] = useState<CVFormData>({
    fullName: "",
    email: "",
    phone: "",
    city: "",
    headline: "",
    formations: [{ ...EMPTY_FORMATION }],
    experiences: [{ ...EMPTY_EXPERIENCE }],
    projects: [{ ...EMPTY_PROJECT }],
    skills: "",
    languages: "",
    interests: "",
  });

  function update<K extends keyof CVFormData>(key: K, value: CVFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function updateFormation(index: number, field: keyof Formation, value: string) {
    const copy = [...data.formations];
    copy[index] = { ...copy[index], [field]: value };
    update("formations", copy);
  }

  function updateExperience(index: number, field: keyof Experience, value: string) {
    const copy = [...data.experiences];
    copy[index] = { ...copy[index], [field]: value };
    update("experiences", copy);
  }

  function updateProject(index: number, field: keyof Project, value: string) {
    const copy = [...data.projects];
    copy[index] = { ...copy[index], [field]: value };
    update("projects", copy);
  }

  function removeItem<T>(list: T[], index: number): T[] {
    return list.filter((_, i) => i !== index);
  }

  // Validation : au moins un nom + une section remplie
  const hasContent =
    data.fullName.trim().length > 0 &&
    (data.formations.some((f) => f.school || f.degree) ||
      data.experiences.some((e) => e.company || e.title) ||
      data.projects.some((p) => p.title) ||
      data.skills.trim().length > 0);

  function handleValidate() {
    if (!hasContent) return;
    const text = cvFormToText(data);
    onComplete(text);
  }

  return (
    <div className="space-y-5">
      {/* Informations personnelles */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Informations personnelles</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nom complet <span className="text-red-500">*</span></label>
            <input type="text" value={data.fullName} onChange={(e) => update("fullName", e.target.value)}
              placeholder="Jean Dupont" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Titre / Headline</label>
            <input type="text" value={data.headline} onChange={(e) => update("headline", e.target.value)}
              placeholder="Etudiant en finance — Recherche stage 6 mois" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={data.email} onChange={(e) => update("email", e.target.value)}
              placeholder="jean.dupont@email.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Telephone</label>
            <input type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)}
              placeholder="06 12 34 56 78" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Ville</label>
            <input type="text" value={data.city} onChange={(e) => update("city", e.target.value)}
              placeholder="Paris, France" className={inputClass} />
          </div>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Formations */}
      <div className="space-y-3">
        <SectionHeader title="Formation" onAdd={() => update("formations", [...data.formations, { ...EMPTY_FORMATION }])} addLabel="Ajouter" />
        {data.formations.map((f, i) => (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 relative">
            {data.formations.length > 1 && (
              <button type="button" onClick={() => update("formations", removeItem(data.formations, i))}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs">&#10005;</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Ecole / Universite</label>
                <input type="text" value={f.school} onChange={(e) => updateFormation(i, "school", e.target.value)}
                  placeholder="ESILV Paris" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Diplome</label>
                <input type="text" value={f.degree} onChange={(e) => updateFormation(i, "degree", e.target.value)}
                  placeholder="Master Ingenieur Finance" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Dates</label>
                <input type="text" value={f.dates} onChange={(e) => updateFormation(i, "dates", e.target.value)}
                  placeholder="2022 - 2027" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Details (optionnel)</label>
                <input type="text" value={f.details} onChange={(e) => updateFormation(i, "details", e.target.value)}
                  placeholder="Specialisation Data Science, GPA 3.8" className={inputClass} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Experiences */}
      <div className="space-y-3">
        <SectionHeader title="Experiences" onAdd={() => update("experiences", [...data.experiences, { ...EMPTY_EXPERIENCE }])} addLabel="Ajouter" />
        {data.experiences.map((e, i) => (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 relative">
            {data.experiences.length > 1 && (
              <button type="button" onClick={() => update("experiences", removeItem(data.experiences, i))}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs">&#10005;</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Entreprise</label>
                <input type="text" value={e.company} onChange={(e) => updateExperience(i, "company", e.target.value)}
                  placeholder="BNP Paribas" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Poste</label>
                <input type="text" value={e.title} onChange={(e) => updateExperience(i, "title", e.target.value)}
                  placeholder="Stagiaire Analyste Risque" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Dates</label>
                <input type="text" value={e.dates} onChange={(e) => updateExperience(i, "dates", e.target.value)}
                  placeholder="Juin 2025 - Decembre 2025" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description (1 point par ligne)</label>
              <textarea value={e.description} onChange={(ev) => updateExperience(i, "description", ev.target.value)} rows={3}
                placeholder={"Analyse des risques de credit sur un portefeuille de 200M\nDeveloppement d'un dashboard Power BI pour le reporting"}
                className={inputClass + " resize-y"} />
            </div>
          </div>
        ))}
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Projets */}
      <div className="space-y-3">
        <SectionHeader title="Projets" onAdd={() => update("projects", [...data.projects, { ...EMPTY_PROJECT }])} addLabel="Ajouter" />
        {data.projects.map((p, i) => (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 relative">
            {data.projects.length > 1 && (
              <button type="button" onClick={() => update("projects", removeItem(data.projects, i))}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs">&#10005;</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Titre du projet</label>
                <input type="text" value={p.title} onChange={(e) => updateProject(i, "title", e.target.value)}
                  placeholder="App de scoring credit avec ML" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Technologies</label>
                <input type="text" value={p.technologies} onChange={(e) => updateProject(i, "technologies", e.target.value)}
                  placeholder="Python, scikit-learn, FastAPI" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea value={p.description} onChange={(ev) => updateProject(i, "description", ev.target.value)} rows={2}
                placeholder="Modele de prediction de defaut de paiement entraine sur 50k lignes, deploye en API REST"
                className={inputClass + " resize-y"} />
            </div>
          </div>
        ))}
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Competences + Langues + Interets */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Competences & autres</p>
        <div>
          <label className={labelClass}>Competences</label>
          <textarea value={data.skills} onChange={(e) => update("skills", e.target.value)} rows={2}
            placeholder={"Python, SQL, Excel VBA, Power BI, R, Git\nAnalyse financiere, Valorisation DCF, Gestion de portefeuille"}
            className={inputClass + " resize-y"} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Langues</label>
            <input type="text" value={data.languages} onChange={(e) => update("languages", e.target.value)}
              placeholder="Francais (natif), Anglais (C1), Espagnol (B1)" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Centres d&apos;interet (optionnel)</label>
            <input type="text" value={data.interests} onChange={(e) => update("interests", e.target.value)}
              placeholder="Trading, Tennis, Voyages" className={inputClass} />
          </div>
        </div>
      </div>

      {/* Bouton valider */}
      <button
        type="button"
        onClick={handleValidate}
        disabled={!hasContent}
        className="w-full rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Valider mon profil
      </button>
    </div>
  );
}
