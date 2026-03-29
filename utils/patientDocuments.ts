/**
 * Documents & imagerie par patient (localStorage `dental_patient_documents`).
 */

export const DENTAL_PATIENT_DOCUMENTS_KEY = "dental_patient_documents";

export const DOCUMENT_CATEGORIES = [
  "Imagerie",
  "Biologie",
  "Ordonnance",
  "Autre",
] as const;

export type PatientDocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type PatientDocument = {
  id: string;
  /** p.ex. cbct | panoramic | scanner3d | pdf | image */
  type: string;
  nom: string;
  /** ISO 8601 */
  date: string;
  /** data URL ou vide pour fiches démo sans fichier */
  url: string;
  categorie: PatientDocumentCategory;
};

type Store = Record<string, PatientDocument[]>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DENTAL_PATIENT_DOCUMENTS_KEY);
    if (raw == null || raw === "") return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return {};
    return data as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DENTAL_PATIENT_DOCUMENTS_KEY, JSON.stringify(store));
}

function parseDoc(raw: unknown): PatientDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.type !== "string") return null;
  if (typeof o.nom !== "string" || typeof o.date !== "string") return null;
  if (typeof o.url !== "string") return null;
  const cat = o.categorie;
  if (
    cat !== "Imagerie" &&
    cat !== "Biologie" &&
    cat !== "Ordonnance" &&
    cat !== "Autre"
  ) {
    return null;
  }
  return {
    id: o.id,
    type: o.type,
    nom: o.nom,
    date: o.date,
    url: o.url,
    categorie: cat,
  };
}

export function listDocumentsForPatient(patientId: string): PatientDocument[] {
  const store = readStore();
  const list = store[patientId];
  if (!Array.isArray(list)) return [];
  const out: PatientDocument[] = [];
  for (const item of list) {
    const d = parseDoc(item);
    if (d) out.push(d);
  }
  return out;
}

function defaultSeedDocuments(): PatientDocument[] {
  return [
    {
      id: "seed-panoramique",
      type: "panoramic",
      nom: "Panoramique de contrôle",
      date: "2026-03-12T10:00:00.000Z",
      url: "",
      categorie: "Imagerie",
    },
    {
      id: "seed-scanner",
      type: "scanner3d",
      nom: "Scanner 3D",
      date: "2026-04-01T10:00:00.000Z",
      url: "",
      categorie: "Imagerie",
    },
    {
      id: "seed-cbct",
      type: "cbct",
      nom: "CBCT",
      date: "2026-05-02T10:00:00.000Z",
      url: "",
      categorie: "Imagerie",
    },
  ];
}

/** Charge la liste ; si vide, initialise les 3 cartes démo (comportement actuel). */
export function ensurePatientDocumentsForPatient(
  patientId: string,
): PatientDocument[] {
  if (!patientId) return [];
  const store = readStore();
  const existing = store[patientId];
  if (Array.isArray(existing) && existing.length > 0) {
    const parsed = existing
      .map((x) => parseDoc(x))
      .filter((x): x is PatientDocument => x != null);
    if (parsed.length !== existing.length) {
      store[patientId] = parsed;
      writeStore(store);
    }
    if (parsed.length > 0) return parsed;
  }
  const seed = defaultSeedDocuments();
  store[patientId] = seed;
  writeStore(store);
  return seed;
}

export function saveDocumentsForPatient(
  patientId: string,
  docs: PatientDocument[],
) {
  if (!patientId) return;
  const store = readStore();
  store[patientId] = docs;
  writeStore(store);
}

export function addPatientDocument(
  patientId: string,
  partial: Omit<PatientDocument, "id">,
): PatientDocument {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const doc: PatientDocument = { id, ...partial };
  const store = readStore();
  const prev = store[patientId] ?? [];
  store[patientId] = [...prev, doc];
  writeStore(store);
  return doc;
}

/** Retire un document du stockage pour ce patient. Retourne false si introuvable. */
export function removePatientDocument(
  patientId: string,
  documentId: string,
): boolean {
  if (!patientId || !documentId) return false;
  const store = readStore();
  const rawList = store[patientId];
  if (!Array.isArray(rawList)) return false;
  const next = rawList.filter((item) => {
    const d = parseDoc(item);
    return d != null && d.id !== documentId;
  });
  if (next.length === rawList.length) return false;
  store[patientId] = next;
  writeStore(store);
  return true;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BYTES) {
      reject(new Error("Fichier trop volumineux (max 10 Mo)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("Lecture impossible."));
    };
    reader.onerror = () => reject(new Error("Lecture impossible."));
    reader.readAsDataURL(file);
  });
}

export function inferDroppedFileKind(file: File): "pdf" | "image" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "pdf";
}

export function defaultCategoryForDropped(
  kind: "pdf" | "image",
): PatientDocumentCategory {
  if (kind === "image") return "Imagerie";
  return "Autre";
}

export function isDocumentCategoryImagerie(c: PatientDocumentCategory): boolean {
  return c === "Imagerie";
}
