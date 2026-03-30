"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  FlaskConical,
  Settings,
  Tags,
  UserCircle,
  Users,
} from "lucide-react";
import { ActesTarifsSection } from "@/components/settings/ActesTarifsSection";
import { LabsPartnersSection } from "@/components/settings/LabsPartnersSection";

/** Champ : label au-dessus (liste verticale). */
const fieldRow =
  "flex w-full min-w-0 flex-col gap-2 mb-4 last:mb-0";

/** Même chose dans une grille : pas de mb (l’espace vient de gap-6). */
const fieldRowGrid = "flex w-full min-w-0 flex-col gap-2";

const labelClass = "text-sm font-medium text-gray-700";

const labelClassMuted = "text-sm font-medium text-gray-800";

const inputBase =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80";

/** Grille section Clinique & légal (infos + fiscal). */
const clinicGrid = "grid w-full min-w-0 grid-cols-1 gap-6 md:grid-cols-2";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-slate-900" : "bg-slate-300",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
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
  | "preferences";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsNavId>("clinique");
  const [twoFA, setTwoFA] = useState(false);
  const [assistantPermissions, setAssistantPermissions] = useState({
    stats: true,
    invoices: true,
    settings: false,
  });
  const [settings, setSettings] = useState({
    nomCabinet: "",
    praticien: "",
    adresse: "",
    telephone: "",
    email: "",
    nif: "",
    nis: "",
    rc: "",
    ordre: "",
    theme: "systeme",
    currency: "DA",
    weekStart: "dimanche",
    whatsappReminders: false,
  });

  useEffect(() => {
    const saved = localStorage.getItem("dental_settings");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setSettings((prev) => ({ ...prev, ...parsed }));
    } catch {
      // Ignore malformed localStorage payload.
    }
  }, []);

  function handleSaveSettings() {
    localStorage.setItem("dental_settings", JSON.stringify(settings));
    alert("Paramètres sauvegardés");
  }

  const navItems: {
    id: SettingsNavId;
    label: string;
    icon: typeof UserCircle;
  }[] = [
    { id: "compte", label: "Mon compte", icon: UserCircle },
    { id: "clinique", label: "Clinique & légal", icon: Building2 },
    { id: "actes", label: "Actes & tarifs", icon: Tags },
    { id: "laboratoires", label: "Laboratoires", icon: FlaskConical },
    { id: "equipe", label: "Équipe & accès", icon: Users },
    { id: "abonnement", label: "Abonnement", icon: CreditCard },
    { id: "modeles", label: "Modèles PDF", icon: FileText },
    { id: "preferences", label: "Préférences", icon: Settings },
  ];

  const panelClass =
    "w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:p-8";

  return (
    <div className="mx-auto w-full max-w-6xl bg-[#f5f5f7] p-6">
      <header className="mb-6 w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Réglages
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Cabinet, catalogue d&apos;actes, équipe et préférences.
        </p>
      </header>

      <nav
        className="flex w-full flex-wrap gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm"
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
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors whitespace-nowrap",
                isActive
                  ? "bg-slate-900 font-medium text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100",
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
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-slate-900">
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
                        defaultValue="Assil"
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={labelClass} htmlFor="settings-nom">
                        Nom
                      </label>
                      <input
                        id="settings-nom"
                        type="text"
                        defaultValue="Messaoudi"
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={labelClass} htmlFor="settings-email-perso">
                        Email personnel
                      </label>
                      <input
                        id="settings-email-perso"
                        type="email"
                        defaultValue="assil@cabinet.com"
                        className={inputBase}
                      />
                    </div>
                  </div>
                  <div className="mt-8">
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Changer le mot de passe
                    </button>
                  </div>
                </div>

                <div className="mt-12 border-t border-slate-100 pt-10">
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-slate-900">
                    Sécurité
                  </h2>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Authentification à double facteur (2FA)
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Renforcez la sécurité de votre compte praticien.
                      </p>
                    </div>
                    <Toggle checked={twoFA} onChange={setTwoFA} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "clinique" && (
              <div className={panelClass}>
                <div>
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-slate-900">
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
                        value={settings.nomCabinet}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            nomCabinet: e.target.value,
                          }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-praticien">
                        Praticien principal
                      </label>
                      <input
                        id="settings-praticien"
                        type="text"
                        value={settings.praticien}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            praticien: e.target.value,
                          }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={`${fieldRowGrid} md:col-span-2`}>
                      <label className={labelClass} htmlFor="settings-adresse">
                        Adresse complète
                      </label>
                      <input
                        id="settings-adresse"
                        type="text"
                        value={settings.adresse}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            adresse: e.target.value,
                          }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-tel">
                        Téléphone
                      </label>
                      <input
                        id="settings-tel"
                        type="tel"
                        value={settings.telephone}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            telephone: e.target.value,
                          }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-email-contact">
                        Email de contact
                      </label>
                      <input
                        id="settings-email-contact"
                        type="email"
                        value={settings.email}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, email: e.target.value }))
                        }
                        className={inputBase}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-12 border-t border-slate-100 pt-10">
                  <h2 className="mb-6 text-lg font-semibold tracking-tight text-slate-900">
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
                        placeholder="Ex: 000216001234567"
                        value={settings.nif}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, nif: e.target.value }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-nis">
                        NIS
                      </label>
                      <input
                        id="settings-nis"
                        type="text"
                        placeholder="Ex: 000216012345678"
                        value={settings.nis}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, nis: e.target.value }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-rc">
                        RC
                      </label>
                      <input
                        id="settings-rc"
                        type="text"
                        placeholder="Ex: 16/00-0123456B00"
                        value={settings.rc}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, rc: e.target.value }))
                        }
                        className={inputBase}
                      />
                    </div>
                    <div className={fieldRowGrid}>
                      <label className={labelClass} htmlFor="settings-ordre">
                        N° inscription à l&apos;Ordre
                      </label>
                      <input
                        id="settings-ordre"
                        type="text"
                        placeholder="Ex: 12345"
                        value={settings.ordre}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, ordre: e.target.value }))
                        }
                        className={inputBase}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}

            {activeTab === "actes" && <ActesTarifsSection />}

            {activeTab === "equipe" && (
              <div className={panelClass}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                    Équipe &amp; accès
                  </h2>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    + Ajouter un membre
                  </button>
                </div>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Dr. Assil</p>
                      <p className="text-xs text-slate-500">
                        Rôle : Administrateur / Praticien
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Actif
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Sofia</p>
                      <p className="text-xs text-slate-500">Rôle : Assistante</p>
                      <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="mb-2 font-medium">Permissions accordées :</p>
                        <label className="mt-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            checked={assistantPermissions.stats}
                            onChange={(e) =>
                              setAssistantPermissions((prev) => ({
                                ...prev,
                                stats: e.target.checked,
                              }))
                            }
                          />
                          Voir le chiffre d&apos;affaires et les statistiques
                        </label>
                        <label className="mt-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            checked={assistantPermissions.invoices}
                            onChange={(e) =>
                              setAssistantPermissions((prev) => ({
                                ...prev,
                                invoices: e.target.checked,
                              }))
                            }
                          />
                          Créer / modifier des factures
                        </label>
                        <label className="mt-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            checked={assistantPermissions.settings}
                            onChange={(e) =>
                              setAssistantPermissions((prev) => ({
                                ...prev,
                                settings: e.target.checked,
                              }))
                            }
                          />
                          Gérer les paramètres du cabinet
                        </label>
                      </div>
                    </div>
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      Actif
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "abonnement" && (
              <div className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                    Plan actuel
                  </h2>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    Premium
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-base font-semibold text-slate-800">Plan Pro</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Prochain prélèvement : 4 500 DA le 12/04/2026
                  </p>
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                  >
                    Gérer la facturation
                  </button>
                </div>

                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800">
                      Stockage documents
                    </p>
                    <p className="text-xs text-slate-500">15 Go / 50 Go utilisés</p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className="h-2 w-[30%] rounded-full bg-slate-900" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "modeles" && (
              <div className={panelClass}>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  Modèles PDF
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
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
                    className={inputBase}
                  />
                </div>

                <div className={`mt-8 ${fieldRow}`}>
                  <span className={labelClass}>Logo du cabinet (PNG / JPG)</span>
                  <label className="flex w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 py-10 text-center text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white">
                    <input type="file" accept="image/png,image/jpeg" className="hidden" />
                    Importer une image
                  </label>
                </div>
              </div>
            )}

            {activeTab === "preferences" && (
              <div className={panelClass}>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  Préférences
                </h2>

                <div className="mt-8 flex flex-col gap-8">
                  <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        Rappels WhatsApp automatiques
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Avant les rendez-vous.
                      </p>
                    </div>
                    <Toggle
                      checked={settings.whatsappReminders}
                      onChange={(value) =>
                        setSettings((prev) => ({ ...prev, whatsappReminders: value }))
                      }
                    />
                  </div>

                  <div className={`w-full min-w-0 border-t border-slate-100 pt-8 ${fieldRow}`}>
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

                  <div className={`w-full min-w-0 border-t border-slate-100 pt-8 ${fieldRow}`}>
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

                  <div className={`w-full min-w-0 border-t border-slate-100 pt-8 ${fieldRow}`}>
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
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
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
      </div>
    </div>
  );
}
