"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Pill,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { OdontogrammeFiche } from "@/components/patients/OdontogrammeFiche";
import type { ToothId, ToothStatus } from "@/components/dentition/DentalChart";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { formatPhoneNumber, toTitleCase } from "@/utils/formatters";
import { RoleGate } from "@/components/auth/RoleGate";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

/**
 * Fiche patient — vue principale (layout 2 colonnes).
 *
 * Design calqué sur la référence `oryx-fiche-patient-v2.html` mais adapté
 * à la palette Oryx (`--ds-*`), aux fonts (Sora, DM Mono) et aux composants
 * existants (Sidebar + topbar globale fournis par le layout dashboard).
 *
 * Cette vue est purement présentationnelle ; toute la logique métier reste
 * dans la page parente (`app/(dashboard)/patients/[id]/page.tsx`).
 */

export type AlerteSeverite = "danger" | "warning" | "info";

export interface PatientFicheAlerte {
  id: string;
  severite: AlerteSeverite;
  titre: string;
  description?: string;
  icon?: "allergy" | "pill" | "shield" | "warning";
}

export interface PatientFicheTimelineItem {
  id: string;
  date: string;
  acteLabel: string;
  note?: string;
  categorie: "Soins" | "Chirurgie" | "Orthopédie" | "Endodontie" | "Autres" | "Absente";
  praticien?: string;
  montant?: number;
  statut?: "paye" | "attente" | "partiel";
  toothNumber?: number;
  /** Membre ayant enregistré ou modifié l’acte (traçabilité). */
  actor?: {
    userId: string;
    displayName: string;
    role: string;
  };
}

export interface PatientFicheProchainRdv {
  jour: string;
  mois: string;
  acte: string;
  detail: string;
}

export interface PatientFicheData {
  patient: {
    id: string;
    prenom: string;
    nom: string;
    genre?: string;
    age?: number;
    dateNaissance?: string;
    profession?: string;
    adresse?: string;
    telephone?: string;
    telephoneSecondaire?: string;
    email?: string;
    groupeSanguin?: string;
    mutuelle?: string;
    premiereVisite?: string;
    derniereVisite?: string;
    publicId?: string;
  };
  statut: {
    actif: boolean;
    label: string;
  };
  alertes: PatientFicheAlerte[];
  stats: {
    consultations: number;
    /** Toujours défini : "—", "0%" ou "X%". */
    presence: string;
    /** Infobulle uniquement quand `presence === "—"` (aucun RDV). */
    presenceTooltip?: string;
    totalDA: string;
  };
  prochainRdv?: PatientFicheProchainRdv;
  dentsStatus: Record<ToothId, ToothStatus>;
  watchedTeeth?: Set<number>;
  timeline: PatientFicheTimelineItem[];
}

export interface PatientFicheHandlers {
  onEditPatient: () => void;
  onOpenOrdonnance: () => void;
  onNewAppointment: () => void;
  onDeletePatient: () => void;
  onToothClick: (tooth: ToothId) => void;
  onAddActe: () => void;
  onEditAlertes?: () => void;
}

interface Props {
  data: PatientFicheData;
  handlers: PatientFicheHandlers;
  /**
   * Bloc additionnel (onglets, modales, etc.) affiché sous la fiche.
   * Permet de conserver la compatibilité avec la logique existante
   * (radios, finances, historique détaillé) sans la dupliquer.
   */
  footer?: ReactNode;
}

function initials(prenom: string, nom: string) {
  const f = prenom?.trim()?.[0] ?? "";
  const s = nom?.trim()?.[0] ?? "";
  return `${f}${s}`.toUpperCase() || "?";
}

function formatLongDate(iso?: string) {
  if (!iso) return "—";
  const trimmed = iso.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatBirth(iso?: string) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const CATEGORY_CONFIG: Record<
  PatientFicheTimelineItem["categorie"],
  { dotStyle: string; tagClasses: string; label: string }
> = {
  Soins: {
    dotStyle: "bg-[var(--ds-primary)]",
    tagClasses:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-border)]",
    label: "Soins",
  },
  Endodontie: {
    dotStyle: "bg-[var(--ds-primary)]",
    tagClasses:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-border)]",
    label: "Endodontie",
  },
  Chirurgie: {
    dotStyle: "bg-orange-500",
    tagClasses:
      "bg-orange-50 text-orange-700 border border-orange-200",
    label: "Chirurgie",
  },
  Orthopédie: {
    dotStyle: "bg-emerald-500",
    tagClasses:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    label: "Orthopédie",
  },
  Autres: {
    dotStyle: "bg-slate-400",
    tagClasses:
      "bg-slate-50 text-slate-600 border border-slate-200",
    label: "Autres",
  },
  Absente: {
    dotStyle: "bg-slate-400",
    tagClasses:
      "bg-slate-50 text-slate-500 border border-slate-200",
    label: "Absente",
  },
};

const STATUT_PAIEMENT: Record<
  NonNullable<PatientFicheTimelineItem["statut"]>,
  { label: string; classes: string }
> = {
  paye: {
    label: "✓ Payé",
    classes:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-border)]",
  },
  attente: {
    label: "⏳ Solde restant",
    classes:
      "bg-[var(--ds-surface-2)] text-[var(--ds-text-muted)] border border-[var(--ds-primary-border)]",
  },
  partiel: {
    label: "Paiement partiel",
    classes:
      "bg-[var(--ds-bg)] text-[var(--ds-text)] border border-[var(--ds-primary-border)]",
  },
};

function AlerteIcon({ icon, severite }: { icon?: PatientFicheAlerte["icon"]; severite: AlerteSeverite }) {
  const base = "h-4 w-4 shrink-0";
  const color =
    severite === "danger"
      ? "text-[var(--ds-primary-hover)]"
      : severite === "warning"
        ? "text-[var(--ds-primary)]"
        : "text-[var(--ds-primary)]";
  switch (icon) {
    case "pill":
      return <Pill className={`${base} ${color}`} aria-hidden />;
    case "shield":
      return <ShieldAlert className={`${base} ${color}`} aria-hidden />;
    case "warning":
      return <AlertTriangle className={`${base} ${color}`} aria-hidden />;
    case "allergy":
    default:
      return <AlertTriangle className={`${base} ${color}`} aria-hidden />;
  }
}

function SubTopbar({
  prenom,
  nom,
  onEdit,
  onOrdonnance,
  onNewAppointment,
  onDelete,
}: {
  prenom: string;
  nom: string;
  onEdit: () => void;
  onOrdonnance: () => void;
  onNewAppointment: () => void;
  onDelete: () => void;
}) {
  const ghost =
    "inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3.5 py-2 text-[13px] font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]";
  const danger =
    "inline-flex items-center justify-center rounded-xl border border-red-200 bg-[var(--ds-surface)] px-3 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50";
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Fil d'Ariane"
        className="flex items-center gap-1.5 text-[13px] text-[var(--ds-text-muted)]"
      >
        <Link href="/patients" className="transition-colors hover:text-[var(--ds-text)]">
          Patients
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[var(--ds-text-muted)]/60" aria-hidden />
        <span className="font-semibold text-[var(--ds-text)]">
          {`${prenom} ${nom}`.trim() || "Patient"}
        </span>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className={ghost}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Modifier
        </button>
        <RoleGate role={["admin", "praticien"]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOrdonnance();
            }}
            className={ghost}
          >
            📄 Ordonnance
          </button>
        </RoleGate>
        <PrimaryButton
          type="button"
          onClick={onNewAppointment}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nouveau RDV
        </PrimaryButton>
        <button type="button" onClick={onDelete} aria-label="Supprimer" className={danger}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function PatientHero({
  data,
}: {
  data: PatientFicheData;
}) {
  const { patient, statut } = data;
  const fullName = toTitleCase(`${patient.prenom} ${patient.nom}`.trim()) || "Patient";
  const avatar = initials(patient.prenom, patient.nom);
  const birth = formatBirth(patient.dateNaissance);

  return (
    <section
      className={`relative z-0 overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] border-l-4 ${statut.actif ? "border-l-emerald-500" : "border-l-slate-300"}`}
      style={{ isolation: "isolate" }}
    >
      {/* Spacer pour maintenir le positionnement de l'avatar flottant */}
      <div className="h-8" />

      {/* Corps — l'avatar est positionné en absolu pour rester confiné à la card. */}
      <div className="relative px-5 pb-5 pt-10">
        <div
          className="absolute left-5 top-0 z-[1] flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[var(--ds-surface)] bg-[var(--ds-primary)] text-[var(--ds-bg)] shadow-md"
          aria-hidden
        >
          <span className="text-xl font-bold tracking-tight">{avatar}</span>
        </div>

        <div className="flex justify-end">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              statut.actif
                ? "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-border)]"
                : "bg-[var(--ds-surface-2)] text-[var(--ds-text-muted)] border border-[var(--ds-primary-border)]",
            ].join(" ")}
          >
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                statut.actif ? "bg-[var(--ds-primary)]" : "bg-[var(--ds-text-subtle)]",
              ].join(" ")}
              aria-hidden
            />
            {statut.label}
          </span>
        </div>

        <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-[var(--ds-text)]">
          {fullName}
        </h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--ds-text-muted)]">
          {patient.genre ? <span>{patient.genre}</span> : null}
          {patient.age && patient.age > 0 ? (
            <>
              <span aria-hidden className="text-[var(--ds-primary-border)]">·</span>
              <span>{patient.age} ans</span>
            </>
          ) : null}
          {birth ? (
            <>
              <span aria-hidden className="text-[var(--ds-primary-border)]">·</span>
              <span>Né·e le {birth}</span>
            </>
          ) : null}
        </div>

        {patient.publicId ? (
          <div className="mt-1.5 font-mono text-[10px] tracking-wider text-[var(--ds-text-muted)]/80">
            ID : {patient.publicId}
          </div>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
              Groupe sanguin
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium text-[var(--ds-text)]">
              {patient.groupeSanguin && patient.groupeSanguin !== "—"
                ? patient.groupeSanguin
                : <span className="text-[12px] font-normal text-[var(--ds-text-muted)]">+ Compléter</span>}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
              Mutuelle
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium text-[var(--ds-text)]">
              {patient.mutuelle && patient.mutuelle !== "—"
                ? patient.mutuelle
                : <span className="text-[12px] font-normal text-[var(--ds-text-muted)]">+ Compléter</span>}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
              1ère visite
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium text-[var(--ds-text)]">
              {formatLongDate(patient.premiereVisite)}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
              Dernière visite
            </dt>
            <dd className="mt-0.5 text-[13px] font-medium text-[var(--ds-text)]">
              {formatLongDate(patient.derniereVisite)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function ContactRow({
  icon,
  value,
  subtitle,
}: {
  icon: ReactNode;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--ds-primary-border)] py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-[var(--ds-text)]">{value}</p>
        <p className="text-[11px] text-[var(--ds-text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function CoordonneesCard({ patient }: { patient: PatientFicheData["patient"] }) {
  const tel = patient.telephone?.trim() ? formatPhoneNumber(patient.telephone) : "—";
  const tel2 = patient.telephoneSecondaire?.trim()
    ? formatPhoneNumber(patient.telephoneSecondaire)
    : "—";
  const email = patient.email?.trim() || "—";
  const adresse = patient.adresse?.trim() || "—";

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]">
      <header className="flex items-center justify-between border-b border-[var(--ds-primary-border)] px-5 py-3.5">
        <h2 className="font-serif text-[15px] font-semibold tracking-tight text-[var(--ds-text)]">
          Coordonnées
        </h2>
      </header>
      <div className="px-5 py-3">
        <ContactRow icon={<Phone className="h-3.5 w-3.5" />} value={tel} subtitle="Mobile principal" />
        <ContactRow
          icon={<Phone className="h-3.5 w-3.5" />}
          value={tel2}
          subtitle="Secondaire / domicile"
        />
        <ContactRow icon={<Mail className="h-3.5 w-3.5" />} value={email} subtitle="Email" />
        <ContactRow icon={<MapPin className="h-3.5 w-3.5" />} value={adresse} subtitle="Adresse complète" />
      </div>
    </section>
  );
}

function AlertesCard({
  alertes,
  onEdit,
}: {
  alertes: PatientFicheAlerte[];
  onEdit?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]">
      <header className="flex items-center justify-between border-b border-[var(--ds-primary-border)] px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-serif text-[15px] font-semibold tracking-tight text-[var(--ds-text)]">
          <AlertTriangle className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden />
          Alertes médicales
        </h2>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-[12px] font-medium text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-primary)]"
          >
            Modifier
          </button>
        ) : null}
      </header>
      <div className="space-y-2 px-5 py-4">
        {alertes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-3 py-4 text-center text-[12.5px] text-[var(--ds-text-muted)]">
            Aucune alerte renseignée.
          </p>
        ) : (
          alertes.map((a) => {
            const palette =
              a.severite === "danger"
                ? "border-[var(--ds-border-strong)] bg-[var(--ds-surface-2)]"
                : a.severite === "warning"
                  ? "border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/90"
                  : "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/60";
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${palette}`}
              >
                <AlerteIcon icon={a.icon} severite={a.severite} />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--ds-text)]">{a.titre}</p>
                  {a.description ? (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--ds-text-muted)]">
                      {a.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function StatsCard({
  stats,
  rdv,
  patientId,
}: {
  stats: PatientFicheData["stats"];
  rdv?: PatientFicheProchainRdv;
  patientId: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      <div className="overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]">
        <div className="grid grid-cols-3 divide-x divide-[var(--ds-primary-border)]">
          <div className="px-4 py-3 text-center">
            <div className="font-serif text-[22px] font-bold tracking-tight text-[var(--ds-text)]">
              {stats.consultations}
            </div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-[var(--ds-text-muted)]">
              Consultations
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <div
              className={[
                "font-serif text-[22px] font-bold tracking-tight",
                stats.presenceTooltip
                  ? "cursor-help text-[var(--ds-text-muted)]"
                  : stats.presence === "—" || stats.presence === "0%"
                    ? "text-[var(--ds-text-muted)]"
                    : "text-[var(--ds-primary)]",
              ].join(" ")}
              title={stats.presenceTooltip ?? undefined}
            >
              {(!stats.presence || stats.presence === "—") ? "Aucun RDV" : stats.presence}
            </div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-[var(--ds-text-muted)]">
              Présence
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="font-serif text-[22px] font-bold tracking-tight text-[var(--ds-text)]">
              {stats.totalDA}
            </div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-[var(--ds-text-muted)]">
              Total (DA)
            </div>
          </div>
        </div>
      </div>

      {rdv ? (
        <div
          className="relative mt-4 flex items-center gap-4 overflow-hidden rounded-xl border border-[var(--ds-primary-border)] px-4 py-3.5"
          style={{
            background:
              "linear-gradient(135deg, var(--ds-surface-2) 0%, color-mix(in srgb, var(--ds-primary) 32%, var(--ds-surface)) 100%)",
          }}
        >
          <Calendar
            className="pointer-events-none absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--ds-text-subtle)] opacity-30"
            aria-hidden
          />
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[var(--ds-primary)]">
            <span className="font-serif text-[18px] leading-none text-[var(--ds-bg)]">{rdv.jour}</span>
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ds-bg)]/70">
              {rdv.mois}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-[var(--ds-text)]">{rdv.acte}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--ds-text-muted)]">{rdv.detail}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-4 py-3 text-center text-[12px] text-[var(--ds-text-muted)]">
          Aucun rendez-vous programmé.
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          href={`/planning?patient=${encodeURIComponent(patientId)}`}
          className="text-xs font-medium text-[var(--ds-primary)] hover:underline"
        >
          Voir tous les RDV
        </Link>
      </div>
    </section>
  );
}

function OdontogrammeCard({
  dents,
  watchedTeeth,
  presentCount,
  totalCount,
  onToothClick,
}: {
  dents: Record<ToothId, ToothStatus>;
  watchedTeeth?: Set<number>;
  presentCount: number;
  totalCount: number;
  onToothClick: (t: ToothId) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]">
      <header className="flex items-center justify-between border-b border-[var(--ds-primary-border)] px-5 py-3.5">
        <h2 className="font-serif text-[15px] font-semibold tracking-tight text-[var(--ds-text)]">
          Odontogramme
        </h2>
        <div className="text-right">
          <div className="text-sm font-bold text-[var(--ds-primary)]">
            {presentCount} dents présentes
          </div>
          {presentCount < totalCount ? (
            <div className="text-xs font-normal text-[var(--ds-text-muted)]">
              sur {totalCount}
            </div>
          ) : null}
        </div>
      </header>
      <div className="px-4 py-3">
        <OdontogrammeFiche
          value={dents}
          watchedTeeth={watchedTeeth}
          onToothClick={onToothClick}
        />
      </div>
    </section>
  );
}

/**
 * Rendu timeline réutilisable (dots colorés par catégorie, cards avec tags,
 * statut paiement, note clinique, praticien + montant).
 *
 * Exporté pour être réutilisé ailleurs (onglet *Historique* de la fiche
 * patient) avec les mêmes données afin d'éviter toute duplication.
 */
export interface PatientSoinsTimelineProps {
  items: PatientFicheTimelineItem[];
  emptyLabel?: string;
}

export function PatientSoinsTimeline({
  items,
  emptyLabel = "Aucun acte enregistré pour ce patient.",
}: PatientSoinsTimelineProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-4 py-8 text-center text-[13px] text-[var(--ds-text-muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="relative pl-5">
      <div
        className="pointer-events-none absolute bottom-0 left-[9px] top-2 w-0.5 rounded-full bg-slate-200"
        aria-hidden
      />
      <ul className="space-y-4">
        {items.map((it, idx) => {
          const cfg = CATEGORY_CONFIG[it.categorie] ?? CATEGORY_CONFIG.Autres;
          const pay = it.statut ? STATUT_PAIEMENT[it.statut] : null;
          const dateLabel = formatLongDate(it.date);
          return (
            <li
              key={it.id}
              className="oryx-fade-up relative"
              style={{ animationDelay: `${Math.min(idx, 6) * 60}ms` }}
            >
              <span
                className={[
                  "absolute left-[-16px] top-2 h-2.5 w-2.5 rounded-full border-2 border-[var(--ds-surface)] ring-1 ring-[var(--ds-primary-border)]",
                  cfg.dotStyle,
                ].join(" ")}
                aria-hidden
              />
              <article className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-3.5 shadow-[0_1px_2px_0_var(--ds-border)] transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    {it.actor ? (
                      <MemberAvatar
                        userId={it.actor.userId}
                        displayName={it.actor.displayName}
                        role={it.actor.role}
                        sizePx={32}
                        className="mt-0.5"
                      />
                    ) : null}
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-[var(--ds-text)]">
                      {it.acteLabel}
                      {it.toothNumber ? (
                        <span className="ml-2 font-mono text-[11px] font-medium text-[var(--ds-text-muted)]">
                          · Dent {it.toothNumber}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] tracking-wider text-[var(--ds-text-muted)]">
                      {dateLabel}
                    </p>
                  </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {/* Badge Consultation pour les items provenant de la salle d'attente */}
                    {it.id.startsWith("consultation-") ? (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Consultation
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${cfg.tagClasses}`}
                      >
                        {cfg.label}
                      </span>
                    )}
                    {pay ? (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${pay.classes}`}
                      >
                        {pay.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                {it.note ? (
                  <p className="mt-2 border-t border-[var(--ds-primary-border)] pt-2 text-[12px] leading-relaxed text-[var(--ds-text-muted)]">
                    {it.note}
                  </p>
                ) : null}
                {it.praticien || typeof it.montant === "number" ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[var(--ds-text-muted)]">
                      {it.praticien ?? ""}
                    </span>
                    {typeof it.montant === "number" ? (
                      <span className="font-mono text-[12.5px] font-semibold text-[var(--ds-text)]">
                        {new Intl.NumberFormat("fr-FR").format(it.montant)} DA
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PatientFicheView({ data, handlers, footer }: Props) {
  const {
    patient,
    statut,
    alertes,
    stats,
    prochainRdv,
    dentsStatus,
    watchedTeeth,
    timeline,
  } = data;

  const totalCount = useMemo(() => Object.keys(dentsStatus).length, [dentsStatus]);
  const presentCount = useMemo(() => {
    let c = 0;
    for (const st of Object.values(dentsStatus)) {
      // Dents manquantes/extraites = "absente" (valeur utilisée par l’odontogramme)
      if (st === "absente") continue;
      c += 1;
    }
    return c;
  }, [dentsStatus]);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <SubTopbar
        prenom={patient.prenom}
        nom={patient.nom}
        onEdit={handlers.onEditPatient}
        onOrdonnance={handlers.onOpenOrdonnance}
        onNewAppointment={handlers.onNewAppointment}
        onDelete={handlers.onDeletePatient}
      />

      <div className="grid grid-cols-[340px_1fr] items-start gap-6">
        <aside className="flex min-w-0 flex-col gap-6">
          <PatientHero
            data={{
              patient,
              statut,
              alertes,
              stats,
              dentsStatus,
              timeline,
              watchedTeeth,
              prochainRdv,
            }}
          />
          <CoordonneesCard patient={patient} />
          <AlertesCard alertes={alertes} onEdit={handlers.onEditAlertes} />
        </aside>

        <section className="flex min-w-0 flex-col gap-6">
          <StatsCard stats={stats} rdv={prochainRdv} patientId={patient.id} />
          <OdontogrammeCard
            dents={dentsStatus}
            watchedTeeth={watchedTeeth}
            presentCount={presentCount}
            totalCount={totalCount}
            onToothClick={handlers.onToothClick}
          />
        </section>
      </div>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </div>
  );
}
