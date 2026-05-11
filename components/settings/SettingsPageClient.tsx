"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  FlaskConical,
  HardDrive,
  Settings,
  Tags,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";
import { BackupsSettingsSection } from "@/components/settings/BackupsSettingsSection";
import { ActesTarifsSection } from "@/components/settings/ActesTarifsSection";
import { LabsPartnersSection } from "@/components/settings/LabsPartnersSection";
import { TeamSection } from "@/components/settings/TeamSection";
import {
  THEMES,
  applyTheme,
  getStoredTheme,
  type Theme,
} from "@/utils/theme";
import {
  getCabinetSettingsAction,
  replaceCabinetSettingsAction,
} from "@/app/actions/cabinet-settings";
import { replaceCabinetBlobFromServer } from "@/lib/client/cabinetBlob";

/** Champ : label au-dessus (liste verticale). */
const fieldRow =
  "flex w-full min-w-0 flex-col gap-2 mb-4 last:mb-0";

/** Même chose dans une grille : pas de mb (l’espace vient de gap-6). */
const fieldRowGrid = "flex w-full min-w-0 flex-col gap-2";

const labelClass = "text-sm font-medium text-[var(--ds-text)]";

const labelClassMuted = "text-sm font-medium text-[var(--ds-text-muted)]";

const inputBase =
  "w-full min-w-0 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary)]/20 placeholder:text-[var(--ds-text-muted)]";

/** Grille section Clinique & légal (infos + fiscal). */
const clinicGrid = "grid w-full min-w-0 grid-cols-1 gap-6 md:grid-cols-2";

/** Interrupteur animé (Notifications, 2FA). */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const isOn = checked;
  const handleToggle = () => onChange(!checked);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={handleToggle}
      style={{
        position: "relative",
        display: "inline-flex",
        width: "52px",
        height: "28px",
        borderRadius: "14px",
        border: "none",
        cursor: "pointer",
        padding: "2px",
        transition: "background-color 0.3s ease",
        backgroundColor: isOn
          ? "var(--ds-primary, #7c3aed)"
          : "rgba(148,163,184,0.4)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          backgroundColor: "white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          transform: isOn ? "translateX(24px)" : "translateX(0px)",
        }}
      />
    </button>
  );
}

type SettingsNavId =
  | "compte"
  | "clinique"
  | "equipe"
  | "abonnement"
  | "actes"
  | "laboratoires"
  | "modeles"
  | "preferences"
  | "sauvegardes";

const DEFAULT_ASSISTANT_PERMISSIONS: {
  stats: boolean;
  factures: boolean;
  parametres: boolean;
} = {
  stats: false,
  factures: true,
  parametres: false,
};

function normalizeAssistantPermissions(
  raw: unknown,
): {
  stats: boolean;
  factures: boolean;
  parametres: boolean;
} {
  const base = { ...DEFAULT_ASSISTANT_PERMISSIONS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    stats: typeof o.stats === "boolean" ? o.stats : base.stats,
    factures:
      typeof o.factures === "boolean"
        ? o.factures
        : typeof o.invoices === "boolean"
          ? o.invoices
          : base.factures,
    parametres:
      typeof o.parametres === "boolean"
        ? o.parametres
        : typeof o.settings === "boolean"
          ? o.settings
          : base.parametres,
  };
}

export default function SettingsPageClient({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsNavId>("clinique");
  const [twoFA, setTwoFA] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>("violet");
  const [settings, setSettings] = useState({
    nomCabinet: "",
    praticien: "",
    praticienPrenom: "",
    praticienNom: "",
    praticienEmail: "",
    adresse: "",
    telephone: "",
    email: "",
    numeroCnam: "",
    nif: "",
    nis: "",
    rc: "",
    ordre: "",
    theme: "systeme",
    currency: "DA",
    weekStart: "dimanche",
    whatsappBusinessNumber: "",
    assistantPermissions: { ...DEFAULT_ASSISTANT_PERMISSIONS },
    mentionLegale: "",
    logoBase64: "",
    notif_stock: true,
    notif_rdv: true,
    notif_impayes: true,
    notif_labo: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getCabinetSettingsAction();
      if (!res.ok || cancelled) return;
      const parsed = res.data as Record<string, unknown>;
      setSettings((prev) => {
        const merged = { ...prev, ...parsed };
        merged.assistantPermissions = normalizeAssistantPermissions(
          parsed.assistantPermissions ?? prev.assistantPermissions,
        );
        merged.whatsappBusinessNumber =
          typeof merged.whatsappBusinessNumber === "string"
            ? merged.whatsappBusinessNumber
            : "";
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCurrentTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab === "sauvegardes") {
      setActiveTab("clinique");
    }
  }, [isAdmin, activeTab]);

  async function handleSaveSettings() {
    const payload = { ...settings } as Record<string, unknown>;
    delete payload.whatsappReminders;
    const res = await replaceCabinetSettingsAction(payload);
    if (res.ok) {
      replaceCabinetBlobFromServer(payload);
      alert("Paramètres sauvegardés");
    } else {
      alert(res.error);
    }
  }

  const navItems: {
    id: SettingsNavId;
    label: string;
    icon: typeof UserCircle;
  }[] = useMemo(() => {
    const base: {
      id: SettingsNavId;
      label: string;
      icon: typeof UserCircle;
    }[] = [
      { id: "compte", label: "Mon compte", icon: UserCircle },
      { id: "clinique", label: "Clinique & légal", icon: Building2 },
      { id: "actes", label: "Actes & tarifs", icon: Tags },
      { id: "laboratoires", label: "Laboratoires", icon: FlaskConical },
      { id: "equipe", label: "Équipe", icon: Users },
      { id: "abonnement", label: "Abonnement", icon: CreditCard },
      { id: "modeles", label: "Modèles PDF", icon: FileText },
      { id: "preferences", label: "Préférences", icon: Settings },
    ];
    if (isAdmin) {
      base.splice(base.length - 1, 0, {
        id: "sauvegardes",
        label: "Sauvegardes",
        icon: HardDrive,
      });
    }
    return base;
  }, [isAdmin]);

  const panelClass =
    "w-full min-w-0 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 sm:p-8";

  return (
    <div className="w-full space-y-6">
      <header className="mb-6 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-8 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text)]">
          Réglages
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted)]">
          Cabinet, catalogue d&apos;actes, équipe et préférences.
        </p>
      </header>

      <nav
        className="flex w-full flex-nowrap gap-1 overflow-x-auto scrollbar-none rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-1.5"
        aria-label="Sections des réglages"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={[
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition-colors whitespace-nowrap lg:text-sm",
                isActive
                  ? "bg-[color:var(--ds-primary)] font-medium text-white shadow-sm"
                  : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-8 block w-full">
            {activeTab === "compte" && (
              <div className={panelClass}>
                <div>
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                    Profil
                  </h2>
                  <div className="w-full min-w-0">
                    <div className={fieldRow}>
                      <label className={labelClass} htmlFor="settings-prenom">
                        Prénom
                      </label>
                      <input
                        id="settings-prenom"
                        type="text"
                        className={inputBase}
                        value={settings.praticienPrenom ?? ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            praticienPrenom: e.target.value,
                          }))
                        }
                        autoComplete="given-name"
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={labelClass} htmlFor="settings-nom">
                        Nom
                      </label>
                      <input
                        id="settings-nom"
                        type="text"
                        className={inputBase}
                        value={settings.praticienNom ?? ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            praticienNom: e.target.value,
                          }))
                        }
                        autoComplete="family-name"
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={labelClass} htmlFor="settings-email-perso">
                        Email personnel
                      </label>
                      <input
                        id="settings-email-perso"
                        type="email"
                        className={inputBase}
                        value={settings.praticienEmail ?? ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            praticienEmail: e.target.value,
                          }))
                        }
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={() => router.push("/change-password")}
                      className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                    >
                      Changer le mot de passe
                    </button>
                  </div>
                </div>

                <div className="mt-12 border-t border-[var(--ds-primary-border)] pt-10">
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                    Sécurité
                  </h2>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--ds-text)]">
                          Authentification à double facteur (2FA)
                        </p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Recommandé
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                        Protégez votre compte avec un code à usage unique.
                      </p>
                    </div>
                    <Toggle checked={twoFA} onChange={setTwoFA} />
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded-xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}

            {activeTab === "clinique" && (
              <>
              <div className={panelClass}>
                <div>
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                    Informations générales
                  </h2>
                  <div className={clinicGrid}>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-nom-cabinet">
                        Nom du cabinet
                      </label>
                      <input
                        id="settings-nom-cabinet"
                        type="text"
                        className={inputBase}
                        value={settings.nomCabinet}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            nomCabinet: e.target.value,
                          }))
                        }
                        autoComplete="organization"
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-praticien">
                        Praticien principal
                      </label>
                      <input
                        id="settings-praticien"
                        type="text"
                        className={inputBase}
                        value={settings.praticien}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            praticien: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className={`${fieldRowGrid} md:col-span-2`}>
                      <label className={labelClass} htmlFor="settings-adresse">
                        Adresse complète
                      </label>
                      <input
                        id="settings-adresse"
                        type="text"
                        className={inputBase}
                        value={settings.adresse}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            adresse: e.target.value,
                          }))
                        }
                        autoComplete="street-address"
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-tel">
                        Téléphone
                      </label>
                      <input
                        id="settings-tel"
                        type="tel"
                        className={inputBase}
                        value={settings.telephone}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            telephone: e.target.value,
                          }))
                        }
                        autoComplete="tel"
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-cnam">
                        Numéro CNAM / agrément
                      </label>
                      <input
                        id="settings-cnam"
                        type="text"
                        className={inputBase}
                        value={settings.numeroCnam ?? ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            numeroCnam: e.target.value,
                          }))
                        }
                        placeholder="Ex: 123456"
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-email-contact">
                        Email de contact
                      </label>
                      <input
                        id="settings-email-contact"
                        type="email"
                        className={inputBase}
                        value={settings.email}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, email: e.target.value }))
                        }
                        autoComplete="email"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-12 border-t border-[var(--ds-primary-border)] pt-10">
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                    Identification fiscale &amp; légale (DZ)
                  </h2>
                  <div className={clinicGrid}>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-nif">
                        NIF
                      </label>
                      <input
                        id="settings-nif"
                        type="text"
                        className={inputBase}
                        placeholder="Ex: 000216001234567"
                        value={settings.nif}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, nif: e.target.value }))
                        }
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-nis">
                        NIS
                      </label>
                      <input
                        id="settings-nis"
                        type="text"
                        className={inputBase}
                        placeholder="Ex: 000216012345678"
                        value={settings.nis}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, nis: e.target.value }))
                        }
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-rc">
                        RC
                      </label>
                      <input
                        id="settings-rc"
                        type="text"
                        className={inputBase}
                        placeholder="Ex: 16/00-0123456B00"
                        value={settings.rc}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, rc: e.target.value }))
                        }
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-ordre">
                        N° inscription à l&apos;Ordre
                      </label>
                      <input
                        id="settings-ordre"
                        type="text"
                        className={inputBase}
                        placeholder="Ex: 12345"
                        value={settings.ordre}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, ordre: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${panelClass} mt-6`}>
                <h2 className="mb-6 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                  Horaires d&apos;ouverture
                </h2>
                <div className="space-y-3">
                  {(
                    [
                      ["Lundi", "lundi"],
                      ["Mardi", "mardi"],
                      ["Mercredi", "mercredi"],
                      ["Jeudi", "jeudi"],
                      ["Vendredi", "vendredi"],
                      ["Samedi", "samedi"],
                      ["Dimanche", "dimanche"],
                    ] as const
                  ).map(([label, key]) => {
                    const st = settings as unknown as Record<
                      string,
                      string | boolean | undefined
                    >;
                    const ouvertKey = `horaire_${key}_ouvert`;
                    const debutKey = `horaire_${key}_debut`;
                    const finKey = `horaire_${key}_fin`;
                    const defaultOuvert = key !== "dimanche";
                    const ouvert = (st[ouvertKey] as boolean | undefined) ?? defaultOuvert;
                    return (
                      <div key={key} className="flex items-center gap-4">
                        <div className="flex w-28 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={ouvert}
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                [ouvertKey]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 accent-[var(--ds-primary)]"
                          />
                          <span className="text-sm text-[var(--ds-text)]">{label}</span>
                        </div>
                        <input
                          type="time"
                          value={(st[debutKey] as string | undefined) ?? "08:00"}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              [debutKey]: e.target.value,
                            }))
                          }
                          disabled={!ouvert}
                          className={`${inputBase} w-32`}
                        />
                        <span className="text-sm text-[var(--ds-text-muted)]">→</span>
                        <input
                          type="time"
                          value={(st[finKey] as string | undefined) ?? "18:00"}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              [finKey]: e.target.value,
                            }))
                          }
                          disabled={!ouvert}
                          className={`${inputBase} w-32`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-10 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="rounded-xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Sauvegarder
                </button>
              </div>
              </>
            )}

            {activeTab === "actes" && <ActesTarifsSection />}

            {activeTab === "equipe" && (
              <div className={panelClass}>
                <TeamSection />
              </div>
            )}

            {activeTab === "abonnement" && (
              <div className={panelClass}>
                <div className="space-y-6">
                  <div className="rounded-2xl border-2 border-[var(--ds-primary)] bg-[var(--ds-primary-soft)] p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-[var(--ds-text)]">
                            Plan Pro
                          </span>
                          <span className="rounded-full bg-[var(--ds-primary)] px-2.5 py-0.5 text-xs font-semibold text-white">
                            Actif
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
                          4 000 DA / mois · Renouvellement le 1er du mois
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold tabular-nums text-[var(--ds-primary)]">
                          4 000
                        </p>
                        <p className="text-xs text-[var(--ds-text-muted)]">DA / mois</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6">
                    <h3 className="mb-4 text-sm font-bold text-[var(--ds-text)]">
                      Inclus dans votre plan
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        "Patients illimités",
                        "Odontogramme interactif",
                        "Planning & Agenda",
                        "Module Laboratoire",
                        "Gestion des stocks",
                        "Stérilisation & traçabilité",
                        "Statistiques avancées",
                        "Export PDF factures",
                        "Support prioritaire",
                        "Hébergement sécurisé Algérie",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-primary)]" />
                          <span className="text-sm text-[var(--ds-text-muted)]">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[var(--ds-text)]">
                        Stockage documents
                      </h3>
                      <span className="text-xs text-[var(--ds-text-muted)]">
                        2,3 Go / 50 Go
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--ds-primary-soft)]">
                      <div
                        className="h-2 rounded-full bg-[var(--ds-primary)] transition-all"
                        style={{ width: "4.6%" }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                      47,7 Go disponibles
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--ds-text)]">
                        Besoin d&apos;aide ?
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                        Contactez notre support Oryx
                      </p>
                    </div>
                    <a
                      href="mailto:support@oryx.dz"
                      className="rounded-xl bg-[var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--ds-primary-hover)]"
                    >
                      Contacter le support
                    </a>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "modeles" && (
              <div className={panelClass}>
                <h2 className="text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                  Modèles PDF
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted)]">
                  Configurez l&apos;apparence de vos devis et factures pour la conformité
                  CNAS / CASNOS.
                </p>

                <div className={`mt-8 ${fieldRow}`}>
                  <label className={labelClass} htmlFor="settings-mention-legale">
                    Mention légale par défaut
                  </label>
                  <textarea
                    id="settings-mention-legale"
                    rows={5}
                    placeholder="Ex: Paiement à réception. Merci de votre confiance."
                    value={settings.mentionLegale ?? ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        mentionLegale: e.target.value,
                      }))
                    }
                    className={inputBase}
                  />
                </div>

                <div className={`mt-8 ${fieldRow}`}>
                  <span className={labelClass}>Logo du cabinet (PNG / JPG)</span>
                  <label className="flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/50 px-4 py-10 text-center transition-colors hover:border-[color:var(--ds-primary)] hover:bg-[var(--ds-surface)]">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setSettings((prev) => ({
                            ...prev,
                            logoBase64: ev.target?.result as string,
                          }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Upload className="h-7 w-7 text-[var(--ds-text-muted)]" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-[var(--ds-text-muted)]">
                      Glissez ou cliquez pour importer · PNG/JPG · Max 2 Mo
                    </span>
                  </label>
                  {settings.logoBase64 ? (
                    <img
                      src={settings.logoBase64}
                      alt="Logo cabinet"
                      className="mt-3 h-16 w-auto rounded-xl border border-[var(--ds-primary-border)] object-contain p-2"
                    />
                  ) : null}
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded-xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}

            {activeTab === "preferences" && (
              <div className={panelClass}>
                <div className="space-y-4 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ds-text)]">
                      Apparence
                    </h3>
                    <p className="mt-0.5 text-sm text-[var(--ds-text-muted)]">
                      Choisissez le thème de votre interface
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          applyTheme(theme.id, { persist: true });
                          setCurrentTheme(theme.id);
                        }}
                        className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                          currentTheme === theme.id
                            ? "border-[var(--ds-primary)] bg-[var(--ds-primary-soft)]"
                            : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] hover:border-[var(--ds-primary-border)]"
                        }`}
                      >
                        <div className="flex h-16 w-full overflow-hidden rounded-xl border border-[var(--ds-primary-border)]">
                          <div
                            className="h-full w-1/3"
                            style={{ backgroundColor: theme.color }}
                          />
                          <div
                            className="h-full flex-1"
                            style={{ backgroundColor: theme.bg }}
                          >
                            <div className="space-y-1 p-1.5">
                              <div className="h-1.5 w-3/4 rounded-full bg-white/60" />
                              <div className="h-1.5 w-1/2 rounded-full bg-white/40" />
                              <div className="h-1.5 w-2/3 rounded-full bg-white/40" />
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-xs font-semibold ${
                            currentTheme === theme.id
                              ? "text-[var(--ds-primary)]"
                              : "text-[var(--ds-text-muted)]"
                          }`}
                        >
                          {theme.label}
                        </span>

                        {currentTheme === theme.id && (
                          <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ds-primary)]">
                            <svg
                              className="h-3 w-3 text-white"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2 6l3 3 5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 border-t border-[var(--ds-primary-border)] pt-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: THEMES.find((t) => t.id === currentTheme)
                          ?.color,
                      }}
                    />
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Thème actif :{" "}
                      <span className="font-semibold text-[var(--ds-text)]">
                        {THEMES.find((t) => t.id === currentTheme)?.label}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ds-text)]">
                      Rappels patients
                    </h3>
                    <p className="mt-0.5 text-sm text-[var(--ds-text-muted)]">
                      Numéro du cabinet pour les messages WhatsApp manuels (ex. depuis la liste patients).
                    </p>
                  </div>

                  <div className={fieldRow}>
                    <label
                      className={labelClass}
                      htmlFor="settings-whatsapp-business"
                    >
                      Numéro WhatsApp Business du cabinet
                    </label>
                    <input
                      id="settings-whatsapp-business"
                      type="text"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="Ex. 2137XXXXXXXX (sans +)"
                      value={settings.whatsappBusinessNumber}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          whatsappBusinessNumber: e.target.value,
                        }))
                      }
                      className={inputBase}
                    />
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Indicatif pays inclus. Si vide, le numéro principal du cabinet peut servir de secours pour les liens manuels.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[var(--ds-primary-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--ds-text)]">
                        Rappels automatiques
                      </p>
                      <span className="inline-flex shrink-0 rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                        Bientôt disponible
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full border-0 bg-[var(--ds-primary-border)] opacity-45"
                      role="switch"
                      aria-checked={false}
                      aria-label="Rappels automatiques — bientôt disponible"
                      title="Bientôt disponible"
                    >
                      <span className="inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--ds-text-muted)]">
                    Les rappels automatiques nécessitent un abonnement WhatsApp Business API. Disponible prochainement.
                  </p>
                </div>

                <div className={`${panelClass} mb-6`}>
                  <h2 className="mb-4 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                    Notifications
                  </h2>
                  <div className="space-y-4">
                    {(
                      [
                        ["notif_stock", "Alertes stock faible", "Quand un produit passe sous le seuil"],
                        ["notif_rdv", "Rappel RDV du jour", "Résumé des RDV chaque matin"],
                        ["notif_impayes", "Alertes impayés", "Factures en attente depuis + de 7 jours"],
                        ["notif_labo", "Commandes laboratoire", "Prothèses prêtes ou en retard"],
                      ] as [string, string, string][]
                    ).map(([key, label, desc]) => {
                      const notifVal = Boolean(
                        (settings as unknown as Record<string, boolean | undefined>)[key] ??
                          true,
                      );
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between border-b border-[var(--ds-primary-border)] py-2 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-[var(--ds-text)]">{label}</p>
                            <p className="text-xs text-[var(--ds-text-muted)]">{desc}</p>
                          </div>
                          <Toggle
                            checked={notifVal}
                            onChange={(value) =>
                              setSettings((prev) => ({
                                ...prev,
                                [key]: value,
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <h2 className="mt-8 text-lg font-semibold tracking-tight text-[var(--ds-text)]">
                  Préférences
                </h2>

                <div className="mt-8 flex flex-col gap-8">
                  <div className={`w-full min-w-0 ${fieldRow}`}>
                    <label className={labelClassMuted} htmlFor="settings-theme">
                      Thème
                    </label>
                    <select
                      id="settings-theme"
                      value={settings.theme}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, theme: e.target.value }))
                      }
                      className={inputBase}
                    >
                      <option value="clair">Clair</option>
                      <option value="sombre">Sombre</option>
                      <option value="systeme">Système</option>
                    </select>
                  </div>

                  <div className={`w-full min-w-0 border-t border-[var(--ds-primary-border)] pt-8 ${fieldRow}`}>
                    <label className={labelClassMuted} htmlFor="settings-currency">
                      Devise d&apos;affichage
                    </label>
                    <select
                      id="settings-currency"
                      value={settings.currency}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, currency: e.target.value }))
                      }
                      className={inputBase}
                    >
                      <option value="DA">Dinar algérien (DA)</option>
                      <option value="centimes">Centimes</option>
                    </select>
                  </div>

                  <div className={`w-full min-w-0 border-t border-[var(--ds-primary-border)] pt-8 ${fieldRow}`}>
                    <label className={labelClassMuted} htmlFor="settings-weekstart">
                      Début de la semaine
                    </label>
                    <select
                      id="settings-weekstart"
                      value={settings.weekStart}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, weekStart: e.target.value }))
                      }
                      className={inputBase}
                    >
                      <option value="dimanche">Dimanche</option>
                      <option value="lundi">Lundi</option>
                    </select>
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded-xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}

            {activeTab === "laboratoires" && (
              <div className={panelClass}>
                <LabsPartnersSection />
              </div>
            )}

            {activeTab === "sauvegardes" && isAdmin ? (
              <BackupsSettingsSection />
            ) : null}
      </div>
    </div>
  );
}
