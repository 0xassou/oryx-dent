"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";

const inputBase =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

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
        checked ? "bg-indigo-600" : "bg-slate-300",
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

export default function ParametresPage() {
  const [activeTab, setActiveTab] = useState<
    "clinique" | "equipe" | "preferences" | "compte" | "abonnement" | "modeles"
  >("clinique");
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

  const navItems = [
    { id: "compte", label: "Mon Compte", icon: UserCircle },
    { id: "clinique", label: "Clinique & Légal", icon: Building2 },
    { id: "equipe", label: "Équipe & Accès", icon: Users },
    { id: "abonnement", label: "Abonnement", icon: CreditCard },
    { id: "modeles", label: "Modèles PDF", icon: FileText },
    { id: "preferences", label: "Préférences", icon: Settings },
  ] as const;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres du Cabinet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gérez les informations légales, l&apos;équipe et vos préférences.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className="w-full flex-shrink-0 md:w-64">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                    isActive
                      ? "rounded-lg bg-indigo-50 font-medium text-indigo-700"
                      : "rounded-lg text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex-1">
          {activeTab === "compte" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="mb-4 border-b pb-2 text-lg font-semibold text-slate-900">
                  Profil
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Prénom</label>
                    <input type="text" defaultValue="Assil" className={inputBase} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Nom</label>
                    <input type="text" defaultValue="Messaoudi" className={inputBase} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Email personnel
                    </label>
                    <input
                      type="email"
                      defaultValue="assil@cabinet.com"
                      className={inputBase}
                    />
                  </div>
                </div>
                <div className="mt-5">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Changer le mot de passe
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <h2 className="mb-4 border-b pb-2 text-lg font-semibold text-slate-900">
                  Sécurité
                </h2>
                <div className="flex items-center justify-between gap-4">
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
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="mb-4 border-b pb-2 text-lg font-semibold text-slate-900">
                  Informations Générales
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Nom du Cabinet
                    </label>
                    <input
                      type="text"
                      value={settings.nomCabinet}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, nomCabinet: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Nom du Praticien Principal
                    </label>
                    <input
                      type="text"
                      value={settings.praticien}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, praticien: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Adresse complète
                    </label>
                    <input
                      type="text"
                      value={settings.adresse}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, adresse: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={settings.telephone}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, telephone: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Email de contact
                    </label>
                    <input
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

              <div className="mt-8">
                <h2 className="mb-4 border-b pb-2 text-lg font-semibold text-slate-900">
                  Identification Fiscale & Légale (Marché DZ)
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      NIF (Numéro d&apos;Identification Fiscale)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 000216001234567"
                      value={settings.nif}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, nif: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      NIS (Numéro d&apos;Identification Statistique)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 000216012345678"
                      value={settings.nis}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, nis: e.target.value }))
                      }
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      RC (Registre de Commerce)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 16/00-0123456B00"
                      value={settings.rc}
                      onChange={(e) => setSettings((prev) => ({ ...prev, rc: e.target.value }))}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Numéro d&apos;inscription à l&apos;Ordre
                    </label>
                    <input
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

              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Sauvegarder les modifications
                </button>
              </div>
            </div>
          )}

          {activeTab === "equipe" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Équipe & Accès</h2>
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  + Ajouter un membre
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Dr. Assil</p>
                    <p className="text-xs text-slate-500">Rôle : Administrateur / Praticien</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Actif
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Sofia</p>
                    <p className="text-xs text-slate-500">Rôle : Assistante</p>
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="mb-2 font-medium">Permissions accordées :</p>
                      <label className="mt-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={assistantPermissions.invoices}
                          onChange={(e) =>
                            setAssistantPermissions((prev) => ({
                              ...prev,
                              invoices: e.target.checked,
                            }))
                          }
                        />
                        Créer/Modifier des factures
                      </label>
                      <label className="mt-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Plan Actuel</h2>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                  Premium
                </span>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-base font-semibold text-slate-800">Plan Pro</p>
                <p className="mt-1 text-sm text-slate-600">
                  Prochain prélèvement : 4 500 DA le 12/04/2026
                </p>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  className="rounded-lg border border-indigo-200 px-5 py-2.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50"
                >
                  Gérer la facturation
                </button>
              </div>

              <div className="mt-8">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800">Stockage Documents</p>
                  <p className="text-xs text-slate-500">15 Go / 50 Go utilisés</p>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-200">
                  <div className="h-2.5 w-[30%] rounded-full bg-indigo-600" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "modeles" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Modèles PDF</h2>
              <p className="mt-1 text-sm text-slate-500">
                Configurez l&apos;apparence de vos devis et factures pour la conformité
                CNAS/CASNOS.
              </p>

              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700">
                  Mention légale par défaut
                </label>
                <textarea
                  rows={5}
                  placeholder="Ex: Paiement à réception. Merci de votre confiance."
                  className={inputBase}
                />
              </div>

              <div className="mt-6">
                <p className="block text-sm font-medium text-slate-700">
                  Importer le logo du cabinet (Format PNG/JPG)
                </p>
                <label className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center text-sm font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700">
                  <input type="file" accept="image/png,image/jpeg" className="hidden" />
                  Importer le logo du cabinet (Format PNG/JPG)
                </label>
              </div>
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Préférences</h2>

              <div className="mt-6 space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Activer les rappels WhatsApp automatiques
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Envoyer des rappels automatiques avant les rendez-vous.
                    </p>
                  </div>
                  <Toggle
                    checked={settings.whatsappReminders}
                    onChange={(value) =>
                      setSettings((prev) => ({ ...prev, whatsappReminders: value }))
                    }
                  />
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <label className="block text-sm font-medium text-slate-800">
                    Thème de l&apos;interface
                  </label>
                  <select
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

                <div className="border-t border-slate-100 pt-5">
                  <label className="block text-sm font-medium text-slate-800">
                    Devise d&apos;affichage
                  </label>
                  <select
                    value={settings.currency}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, currency: e.target.value }))
                    }
                    className={inputBase}
                  >
                    <option value="DA">Dinar Algérien (DA)</option>
                    <option value="centimes">Centimes</option>
                  </select>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <label className="block text-sm font-medium text-slate-800">
                    Début de la semaine
                  </label>
                  <select
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

              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Sauvegarder les modifications
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
