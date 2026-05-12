"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  ImageIcon,
  Plus,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import {
  createRadioAction,
  deleteRadioAction,
  getRadiosAction,
} from "@/app/actions/radios";
import {
  listRadiosForPatient,
  addRadioForPatient,
  removeRadioForPatient,
  TOOTH_SELECT_OPTIONS,
  RADIO_MAX_BYTES,
  isAcceptedRadioMime,
  toothLabel,
  type PatientRadio,
} from "@/utils/patientRadios";
import { replaceCabinetBlobFromServer } from "@/lib/client/cabinetBlob";
import { getCabinetSettingsAction } from "@/app/actions/cabinet-settings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > RADIO_MAX_BYTES) {
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

// ---------------------------------------------------------------------------
// Sous-composant : miniature
// ---------------------------------------------------------------------------

function RadioThumbnail({ radio }: { radio: PatientRadio }) {
  const isPdf =
    radio.mimeType === "application/pdf" ||
    radio.url.startsWith("data:application/pdf");

  if (isPdf) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--ds-primary-soft)]">
        <FileText className="h-8 w-8 text-[var(--ds-primary)]" />
        <span className="max-w-full truncate px-2 text-[10px] font-medium text-[var(--ds-text-muted)]">
          PDF
        </span>
      </div>
    );
  }

  if (!radio.url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--ds-primary-soft)]">
        <ImageIcon className="h-8 w-8 text-[var(--ds-primary-border)]" />
      </div>
    );
  }

  return (
    <img
      src={radio.url}
      alt={radio.fileName}
      className="h-full w-full object-cover"
    />
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  patientId: string;
  /** Appelé après chaque succès create/delete pour synchro éventuelle du parent. */
  onChanged?: () => void;
};

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function RadiologiesSection({ patientId, onChanged }: Props) {
  // ---- État liste ----
  const [radios, setRadios] = useState<PatientRadio[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- Filtre dent ----
  const [filterTooth, setFilterTooth] = useState<string>("__all__");

  // ---- Upload / formulaire ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    dataUrl: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [formDate, setFormDate] = useState(todayIso());
  const [formTooth, setFormTooth] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ---- Modales ----
  const [lightbox, setLightbox] = useState<PatientRadio | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientRadio | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ---- Toast ----
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement initial (depuis cabinetBlob local pour rapidité, puis serveur)
  // ---------------------------------------------------------------------------
  const loadFromServer = useCallback(async () => {
    setLoading(true);
    const res = await getRadiosAction(patientId);
    setLoading(false);
    if (!res.ok) {
      console.warn("[RadiologiesSection] getRadiosAction —", res.error);
      // Fallback: lecture du blob local
      setRadios(listRadiosForPatient(patientId));
      return;
    }
    // Mettre à jour aussi le blob local pour cohérence
    const cab = await getCabinetSettingsAction();
    if (cab.ok) replaceCabinetBlobFromServer(cab.data);
    setRadios(res.data);
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    // Initialisation rapide depuis le blob local
    setRadios(listRadiosForPatient(patientId));
    // Puis synchronisation serveur
    void loadFromServer();
  }, [patientId, loadFromServer]);

  // ---- Fermeture lightbox sur Escape ----
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // ---- Auto-hide toast ----
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Gestion fichier sélectionné
  // ---------------------------------------------------------------------------
  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    const mime = file.type || "";
    if (!isAcceptedRadioMime(mime)) {
      setFormError("Format non accepté. Utilisez JPG, PNG, WEBP ou PDF.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingFile({ dataUrl, mimeType: mime, fileName: file.name });
      setFormDate(todayIso());
      setFormTooth("");
      setFormNote("");
      setFormError(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Import impossible.");
    }
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      void handleFile(files[0]);
    },
    [handleFile],
  );

  // ---------------------------------------------------------------------------
  // Sauvegarde
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!pendingFile) return;
    setSaving(true);
    setFormError(null);
    const res = await createRadioAction(patientId, {
      url: pendingFile.dataUrl,
      mimeType: pendingFile.mimeType,
      fileName: pendingFile.fileName,
      date: formDate,
      tooth: formTooth || null,
      note: formNote || null,
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    // Mise à jour optimiste locale
    addRadioForPatient(patientId, {
      url: res.data.url,
      mimeType: res.data.mimeType,
      fileName: res.data.fileName,
      date: res.data.date,
      tooth: res.data.tooth,
      note: res.data.note,
    });
    setPendingFile(null);
    setFormDate(todayIso());
    setFormTooth("");
    setFormNote("");
    // Recharger depuis serveur pour cohérence
    const updated = await getRadiosAction(patientId);
    if (updated.ok) setRadios(updated.data);
    else setRadios(listRadiosForPatient(patientId));
    setToast({ type: "success", message: "Radio ajoutée" });
    onChanged?.();
  }, [pendingFile, patientId, formDate, formTooth, formNote, onChanged]);

  // ---------------------------------------------------------------------------
  // Suppression
  // ---------------------------------------------------------------------------
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    const res = await deleteRadioAction(patientId, pendingDelete.id);
    setDeleteLoading(false);
    if (!res.ok) {
      setToast({ type: "error", message: res.error });
      setPendingDelete(null);
      return;
    }
    removeRadioForPatient(patientId, pendingDelete.id);
    const updated = await getRadiosAction(patientId);
    if (updated.ok) setRadios(updated.data);
    else setRadios(listRadiosForPatient(patientId));
    setLightbox((prev) => (prev?.id === pendingDelete.id ? null : prev));
    setPendingDelete(null);
    setToast({ type: "success", message: "Radio supprimée" });
    onChanged?.();
  }, [pendingDelete, patientId, onChanged]);

  // ---------------------------------------------------------------------------
  // Filtrage
  // ---------------------------------------------------------------------------
  const filteredRadios = useMemo(() => {
    if (filterTooth === "__all__") return radios;
    if (filterTooth === "__none__")
      return radios.filter((r) => !r.tooth);
    return radios.filter((r) => r.tooth === filterTooth);
  }, [radios, filterTooth]);

  // Liste des dents présentes dans les radios (pour les options du filtre)
  const presentTeeth = useMemo(() => {
    const set = new Set<string>();
    for (const r of radios) {
      if (r.tooth) set.add(r.tooth);
    }
    return Array.from(set);
  }, [radios]);

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  return (
    <section className="relative flex flex-col gap-6">
      {/* Input fichier caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
          Radiologies
        </h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[color:var(--ds-primary-hover)]"
        >
          <Plus className="h-4 w-4" />
          Ajouter une radio
        </button>
      </div>

      {/* Zone drag & drop (si aucun fichier en attente) */}
      {!pendingFile && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Déposer une radio ou cliquer pour parcourir"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              fileInputRef.current?.click();
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
            dragOver
              ? "border-[var(--ds-primary)] bg-[var(--ds-primary-border)]/70"
              : "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/50 hover:border-[var(--ds-primary)]",
          ].join(" ")}
        >
          <UploadCloud className="h-8 w-8 text-[var(--ds-primary)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--ds-text)]">
              Glissez une radio ici ou cliquez pour parcourir
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              JPG, PNG, WEBP ou PDF — max 10 Mo
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] shadow-sm transition-colors hover:bg-[var(--ds-bg)]"
          >
            Parcourir
          </button>
        </div>
      )}

      {/* Formulaire d'ajout (si fichier en attente) */}
      {pendingFile && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--ds-primary-soft)]">
              {pendingFile.mimeType === "application/pdf" ? (
                <div className="flex h-full w-full items-center justify-center">
                  <FileText className="h-8 w-8 text-[var(--ds-primary)]" />
                </div>
              ) : (
                <img
                  src={pendingFile.dataUrl}
                  alt="aperçu"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--ds-text)]">
                {pendingFile.fileName}
              </p>
              <p className="text-xs text-[var(--ds-text-muted)]">
                {pendingFile.mimeType}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="rounded-lg p-1 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
              aria-label="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Champs */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--ds-text-muted)]">
                Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--ds-text-muted)]">
                Dent (optionnel)
              </label>
              <select
                value={formTooth}
                onChange={(e) => setFormTooth(e.target.value)}
                className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
              >
                {TOOTH_SELECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--ds-text-muted)]">
              Note / commentaire (optionnel)
            </label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              placeholder="Observations, résultats…"
              className="resize-none rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)] focus:ring-2 focus:ring-[var(--ds-primary)]/40"
            />
          </div>

          {formError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              disabled={saving}
              className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[color:var(--ds-primary-hover)] disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Filtre dent */}
      {radios.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--ds-text-muted)]">
            Filtrer :
          </span>
          <select
            value={filterTooth}
            onChange={(e) => setFilterTooth(e.target.value)}
            className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-1.5 text-xs text-[var(--ds-text)] outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
          >
            <option value="__all__">Toutes les radios ({radios.length})</option>
            {presentTeeth.map((t) => (
              <option key={t} value={t}>
                {toothLabel(t)}
              </option>
            ))}
            {radios.some((r) => !r.tooth) && (
              <option value="__none__">Non renseignées</option>
            )}
          </select>
        </div>
      )}

      {/* Grille */}
      {loading && radios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 py-10 text-center text-sm text-[var(--ds-text-muted)]">
          Chargement…
        </p>
      ) : filteredRadios.length === 0 && !pendingFile ? (
        <p className="rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 py-10 text-center text-sm text-[var(--ds-text-muted)]">
          {radios.length === 0
            ? "Aucune radiologie enregistrée."
            : "Aucune radio pour ce filtre."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {filteredRadios.map((radio) => (
            <div key={radio.id} className="group/card flex flex-col gap-2">
              <div className="relative aspect-video w-full">
                {/* Miniature cliquable */}
                <button
                  type="button"
                  onClick={() => setLightbox(radio)}
                  aria-label={`Voir ${radio.fileName} en plein écran`}
                  className="group/view relative aspect-video w-full overflow-hidden rounded-lg bg-[var(--ds-primary-border)] text-left outline-none ring-[var(--ds-primary-border)] transition-shadow focus-visible:ring-2"
                >
                  <RadioThumbnail radio={radio} />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-opacity group-hover/view:pointer-events-auto group-hover/view:opacity-90 group-focus-visible/view:pointer-events-auto group-focus-visible/view:opacity-90">
                    <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text)] shadow">
                      <ZoomIn className="h-3.5 w-3.5" />
                      Voir
                    </span>
                    {radio.url && (
                      <a
                        href={radio.url}
                        download={radio.fileName}
                        onClick={(e) => e.stopPropagation()}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text)] shadow"
                        aria-label="Télécharger"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </button>
                {/* Bouton supprimer */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDelete(radio);
                  }}
                  aria-label="Supprimer cette radio"
                  className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-surface)]/80 text-red-600 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-[var(--ds-surface)] focus-visible:opacity-100 group-hover/card:opacity-100"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              {/* Métadonnées */}
              <div>
                <p className="truncate text-xs font-medium text-[var(--ds-text)]">
                  {radio.fileName}
                </p>
                {radio.tooth && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-primary)]">
                    {toothLabel(radio.tooth)}
                  </p>
                )}
                {radio.note && (
                  <p className="line-clamp-2 text-[11px] text-[var(--ds-text-muted)]">
                    {radio.note}
                  </p>
                )}
                <p className="text-xs text-[var(--ds-text-muted)]">
                  {formatDate(radio.date)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Modale confirmation suppression ---- */}
      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-radio-title"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-radio-title"
              className="text-lg font-semibold text-[var(--ds-text)]"
            >
              Supprimer cette radio ?
            </h2>
            <p className="mt-2 line-clamp-2 text-sm text-[var(--ds-text-muted)]">
              {pendingDelete.fileName}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleteLoading}
                className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleteLoading}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deleteLoading ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- Lightbox plein écran ---- */}
      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu radio"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/95"
            aria-label="Fermer l'aperçu"
            onClick={() => setLightbox(null)}
          />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            {/* Barre supérieure */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 text-white backdrop-blur-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {lightbox.fileName}
                </p>
                <p className="text-xs text-white/60">
                  {lightbox.tooth ? toothLabel(lightbox.tooth) + " · " : ""}
                  {formatDate(lightbox.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lightbox.url && (
                  <a
                    href={lightbox.url}
                    download={lightbox.fileName}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
                  >
                    Télécharger
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            {/* Contenu */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              {!lightbox.url ? (
                <p className="rounded-xl bg-white/10 px-6 py-8 text-center text-sm text-white/90">
                  Aucun fichier associé.
                </p>
              ) : lightbox.mimeType === "application/pdf" ||
                lightbox.url.startsWith("data:application/pdf") ? (
                <iframe
                  title={lightbox.fileName}
                  src={lightbox.url}
                  className="h-[min(85vh,900px)] w-[min(96vw,720px)] rounded-lg bg-[var(--ds-surface)] shadow-xl"
                />
              ) : (
                <img
                  src={lightbox.url}
                  alt={lightbox.fileName}
                  className="max-h-[85vh] max-w-full object-contain shadow-xl"
                />
              )}
            </div>
            {/* Note */}
            {lightbox.note && (
              <div className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
                <p className="text-sm text-white/80">{lightbox.note}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ---- Toast ---- */}
      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-xl",
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600",
          ].join(" ")}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
