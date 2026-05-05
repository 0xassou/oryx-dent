"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { useState } from "react";

export type Sexe = "F" | "M" | "autre";

export interface AddPatientPayload {
  nom: string;
  prenom: string;
  sexe: Sexe;
  dateNaissance: string;
  telephone: string;
  email: string;
  adresse: string;
  allergies: string;
  antecedents: {
    diabete: boolean;
    hta: boolean;
    problemesCardiaques: boolean;
    enceinte: boolean;
  };
  traitementsEnCours: string;
}

interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: AddPatientPayload) => void;
}

const inputBase =
  "mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-subtle)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20";

const inputError =
  "mt-1.5 w-full rounded-xl border border-red-400 bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-subtle)] focus:border-red-500 focus:ring-2 focus:ring-red-400/20";

const labelBase = "block text-sm font-medium text-[var(--ds-text)]";

const sectionTitle =
  "text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]";

const checkboxBase =
  "h-4 w-4 rounded-lg border border-[var(--ds-primary-border)] text-[color:var(--ds-primary)] transition-colors focus:ring-2 focus:ring-[color:var(--ds-primary)]/20 focus:ring-offset-0";

type FormErrors = {
  nom?: string;
  prenom?: string;
  telephone?: string;
};

export function AddPatientModal({ open, onClose, onSave }: AddPatientModalProps) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [sexe, setSexe] = useState<Sexe>("autre");
  const [dateNaissance, setDateNaissance] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [allergies, setAllergies] = useState("");
  const [diabete, setDiabete] = useState(false);
  const [hta, setHta] = useState(false);
  const [problemesCardiaques, setProblemesCardiaques] = useState(false);
  const [enceinte, setEnceinte] = useState(false);
  const [traitementsEnCours, setTraitementsEnCours] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const nomRef = useRef<HTMLInputElement>(null);
  const prenomRef = useRef<HTMLInputElement>(null);
  const telephoneRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!prenom.trim()) e.prenom = "Le prénom est obligatoire.";
    if (!nom.trim()) e.nom = "Le nom est obligatoire.";
    if (!telephone.trim()) e.telephone = "Le numéro de téléphone est obligatoire.";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      if (errs.prenom) prenomRef.current?.focus();
      else if (errs.nom) nomRef.current?.focus();
      else if (errs.telephone) telephoneRef.current?.focus();
      return;
    }

    const payload: AddPatientPayload = {
      nom: nom.trim(),
      prenom: prenom.trim(),
      sexe,
      dateNaissance: dateNaissance.trim(),
      telephone: telephone.trim(),
      email: email.trim(),
      adresse: adresse.trim(),
      allergies: allergies.trim(),
      antecedents: { diabete, hta, problemesCardiaques, enceinte },
      traitementsEnCours: traitementsEnCours.trim(),
    };
    onSave(payload);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ds-text)_30%,transparent)] p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-patient-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/98 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--ds-primary-border)] px-6 py-4">
          <div>
            <h2
              id="add-patient-title"
              className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]"
            >
              Nouveau patient
            </h2>
            <p className="mt-0.5 text-sm text-[var(--ds-text-muted)]">
              Identité, contact et anamnèse
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          id="add-patient-form"
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-8">
              {/* Section 1 - Identité */}
              <section>
                <h3 className={sectionTitle}>Identité</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelBase} htmlFor="add-patient-prenom">
                      Prénom
                    </label>
                    <input
                      ref={prenomRef}
                      id="add-patient-prenom"
                      type="text"
                      name="prenom"
                      autoComplete="given-name"
                      value={prenom}
                      onChange={(e) => {
                        setPrenom(e.target.value);
                        if (errors.prenom) setErrors((prev) => ({ ...prev, prenom: undefined }));
                      }}
                      className={errors.prenom ? inputError : inputBase}
                      placeholder="Ex. Marie…"
                      aria-describedby={errors.prenom ? "error-prenom" : undefined}
                      aria-invalid={!!errors.prenom}
                    />
                    {errors.prenom && (
                      <p id="error-prenom" className="mt-1 text-xs text-red-500">
                        {errors.prenom}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelBase} htmlFor="add-patient-nom">
                      Nom
                    </label>
                    <input
                      ref={nomRef}
                      id="add-patient-nom"
                      type="text"
                      name="nom"
                      autoComplete="family-name"
                      value={nom}
                      onChange={(e) => {
                        setNom(e.target.value);
                        if (errors.nom) setErrors((prev) => ({ ...prev, nom: undefined }));
                      }}
                      className={errors.nom ? inputError : inputBase}
                      placeholder="Ex. Dupont…"
                      aria-describedby={errors.nom ? "error-nom" : undefined}
                      aria-invalid={!!errors.nom}
                    />
                    {errors.nom && (
                      <p id="error-nom" className="mt-1 text-xs text-red-500">
                        {errors.nom}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelBase} htmlFor="add-patient-sexe">
                      Sexe
                    </label>
                    <select
                      id="add-patient-sexe"
                      name="sexe"
                      value={sexe}
                      onChange={(e) => setSexe(e.target.value as Sexe)}
                      className={inputBase}
                    >
                      <option value="F">Femme</option>
                      <option value="M">Homme</option>
                      <option value="autre">Non précisé</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelBase} htmlFor="add-patient-dob">
                      Date de naissance
                    </label>
                    <input
                      id="add-patient-dob"
                      type="date"
                      name="dateNaissance"
                      autoComplete="bday"
                      value={dateNaissance}
                      onChange={(e) => setDateNaissance(e.target.value)}
                      className={inputBase}
                    />
                  </div>
                </div>
              </section>

              {/* Section 2 - Contact */}
              <section>
                <h3 className={sectionTitle}>Contact</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelBase} htmlFor="add-patient-tel">
                      Téléphone
                    </label>
                    <input
                      ref={telephoneRef}
                      id="add-patient-tel"
                      type="tel"
                      name="telephone"
                      autoComplete="tel"
                      inputMode="tel"
                      value={telephone}
                      onChange={(e) => {
                        setTelephone(e.target.value);
                        if (errors.telephone) setErrors((prev) => ({ ...prev, telephone: undefined }));
                      }}
                      className={errors.telephone ? inputError : inputBase}
                      placeholder="Ex. 06 12 34 56 78…"
                      aria-describedby={errors.telephone ? "error-telephone" : undefined}
                      aria-invalid={!!errors.telephone}
                    />
                    {errors.telephone && (
                      <p id="error-telephone" className="mt-1 text-xs text-red-500">
                        {errors.telephone}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelBase} htmlFor="add-patient-email">
                      Email
                    </label>
                    <input
                      id="add-patient-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      spellCheck={false}
                      autoCorrect="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputBase}
                      placeholder="Ex. marie.dupont@email.fr…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelBase} htmlFor="add-patient-adresse">
                      Adresse
                    </label>
                    <textarea
                      id="add-patient-adresse"
                      name="adresse"
                      autoComplete="street-address"
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      rows={3}
                      className={`${inputBase} resize-y min-h-[80px]`}
                      placeholder="Adresse postale complète…"
                    />
                  </div>
                </div>
              </section>

              {/* Section 3 - Dossier médical (Anamnèse) */}
              <section>
                <h3 className={sectionTitle}>Dossier médical (Anamnèse)</h3>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={labelBase} htmlFor="add-patient-allergies">
                      Allergies connues
                    </label>
                    <input
                      id="add-patient-allergies"
                      type="text"
                      name="allergies"
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className={inputBase}
                      placeholder="Ex. Pénicilline, latex…"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-[var(--ds-text)]">
                      Antécédents
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={diabete}
                          onChange={(e) => setDiabete(e.target.checked)}
                          className={checkboxBase}
                        />
                        <span className="text-sm text-[var(--ds-text)]">Diabète</span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hta}
                          onChange={(e) => setHta(e.target.checked)}
                          className={checkboxBase}
                        />
                        <span className="text-sm text-[var(--ds-text)]">
                          Hypertension (HTA)
                        </span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={problemesCardiaques}
                          onChange={(e) =>
                            setProblemesCardiaques(e.target.checked)
                          }
                          className={checkboxBase}
                        />
                        <span className="text-sm text-[var(--ds-text)]">
                          Problèmes cardiaques
                        </span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={enceinte}
                          onChange={(e) => setEnceinte(e.target.checked)}
                          className={checkboxBase}
                        />
                        <span className="text-sm text-[var(--ds-text)]">Enceinte</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label
                      className={labelBase}
                      htmlFor="add-patient-traitements"
                    >
                      Traitements en cours
                    </label>
                    <textarea
                      id="add-patient-traitements"
                      name="traitementsEnCours"
                      value={traitementsEnCours}
                      onChange={(e) => setTraitementsEnCours(e.target.value)}
                      rows={2}
                      className={`${inputBase} resize-y min-h-[60px]`}
                      placeholder="Médicaments ou traitements en cours…"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--ds-primary-border)] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-[var(--ds-bg)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
