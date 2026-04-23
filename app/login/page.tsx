"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  Info,
  Lock,
  Mail,
  Moon,
  Phone,
  Sun,
  User,
  Users,
} from "lucide-react";
import { loginAction, loginAsMemberAction, registerAction } from "@/app/actions/auth";
import {
  findMemberByCredentials,
  setCurrentRole,
  setCurrentUser,
} from "@/utils/roles";

type TabKey = "connexion" | "inscription";

/** Clé localStorage pour le toggle light/dark de l'écran de connexion. */
const STORAGE_KEY = "oryx_login_theme";

export default function LoginPage() {
  const [tab, setTab] = useState<TabKey>("connexion");
  const [isDark, setIsDark] = useState(false);

  // Lecture du thème actif au montage (pour piloter les logos + le toggle).
  useEffect(() => {
    const root = document.documentElement;
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    const initial =
      saved === "dark" ? "dark" : root.getAttribute("data-theme") ?? "violet";
    if (initial === "dark") {
      root.setAttribute("data-theme", "dark");
      setIsDark(true);
    } else {
      setIsDark(false);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next = isDark ? "violet" : "dark";
    root.setAttribute("data-theme", next);
    setIsDark(next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, [isDark]);

  // Logo du panneau droit : blanc en dark, couleur en light.
  const rightLogo = isDark ? "/logo-white.svg" : "/logo.svg";

  return (
    <div className="fixed inset-0 grid min-h-screen grid-cols-1 overflow-auto bg-[var(--ds-bg)] md:grid-cols-2">
      <BrandPanel />

      <section className="relative flex flex-col items-center justify-center bg-[var(--ds-bg)] px-4 py-10 md:px-8">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Changer le thème"
          title="Changer le thème"
          className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] shadow-sm transition-colors hover:border-[var(--ds-primary)] hover:text-[var(--ds-primary)]"
        >
          {isDark ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </button>

        <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-9 pb-7 shadow-[0_8px_40px_rgba(124,58,237,0.10),0_2px_8px_rgba(0,0,0,0.06)]">
          {/* Mini logo + marque sur mobile (le panneau gauche est masqué < md). */}
          <div className="mb-5 flex items-center justify-center gap-2 md:hidden">
            <Image
              src={rightLogo}
              alt="Oryx"
              width={28}
              height={28}
              priority
              className="h-7 w-7"
            />
            <span className="text-lg font-extrabold tracking-tight text-[var(--ds-text)]">
              Oryx
            </span>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Authentification"
            className="mb-7 grid grid-cols-2 gap-1 rounded-[12px] border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] p-1"
          >
            <TabButton
              active={tab === "connexion"}
              onClick={() => setTab("connexion")}
              id="tab-connexion"
              controls="panel-connexion"
            >
              Connexion
            </TabButton>
            <TabButton
              active={tab === "inscription"}
              onClick={() => setTab("inscription")}
              id="tab-inscription"
              controls="panel-inscription"
            >
              Inscription
            </TabButton>
          </div>

          {tab === "connexion" ? (
            <ConnexionPanel key="connexion" />
          ) : (
            <InscriptionPanel key="inscription" />
          )}
        </div>

        <footer className="mt-5 text-center text-[11px] leading-6 text-[var(--ds-text-subtle)]">
          © {new Date().getFullYear()} Oryx · Gestion Dentaire · Algérie
          <br />
          <FooterLink href="#">Confidentialité</FooterLink>
          {" · "}
          <FooterLink href="#">Conditions d'utilisation</FooterLink>
          {" · "}
          <FooterLink href="#">Support</FooterLink>
        </footer>
      </section>
    </div>
  );
}

/* ───────────────────────── Brand panel (left) ───────────────────────── */

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden md:flex md:flex-col md:items-center md:justify-center"
      style={{
        background:
          "linear-gradient(145deg, #4c1d95 0%, #7c3aed 40%, #5b21b6 70%, #2e1065 100%)",
      }}
      aria-hidden={false}
    >
      {/* Motif pointillé */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden
      />
      {/* Cercles décoratifs */}
      <span
        className="pointer-events-none absolute -right-[120px] -top-[100px] h-[480px] w-[480px] rounded-full border border-white/5"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-[60px] -left-[80px] h-[320px] w-[320px] rounded-full border border-white/[0.08]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      {/* Croix flottantes */}
      <Cross style={{ top: "8%", left: "5%", fontSize: 48, opacity: 0.5 }} />
      <Cross style={{ top: "18%", right: "8%" }} />
      <Cross
        style={{ bottom: "22%", left: "12%", fontSize: 40 }}
      />
      <Cross
        style={{ bottom: "10%", right: "15%", fontSize: 32, opacity: 0.4 }}
      />

      <div className="relative z-10 w-full max-w-[380px] px-14 py-12 text-center">
        <div className="oryx-float mx-auto mb-6 flex h-[120px] w-[120px] items-center justify-center rounded-[20px] border border-white/25 bg-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur">
          <Image
            src="/logo-white.svg"
            alt="Oryx"
            width={72}
            height={72}
            className="h-[72px] w-[72px]"
            priority
          />
        </div>

        <div className="text-[36px] font-extrabold leading-none tracking-[-0.03em] text-white">
          Oryx
        </div>
        <div className="mt-1 text-[13px] font-medium uppercase tracking-[0.12em] text-white/55">
          Gestion Dentaire
        </div>

        <p className="mt-8 text-[22px] font-semibold leading-[1.35] tracking-[-0.01em] text-white text-balance">
          La gestion dentaire
          <br />
          nouvelle génération
        </p>

        <div className="mt-9 flex flex-col gap-3 text-left">
          <Feature
            icon={<Users className="h-[17px] w-[17px]" strokeWidth={2} />}
            title="Gestion des patients"
            sub="Dossiers, historique, odontogramme"
          />
          <Feature
            icon={<CalendarIcon />}
            title="Planning intelligent"
            sub="RDV, rappels SMS, agenda partagé"
          />
          <Feature
            icon={<DollarIcon />}
            title="Finance & Facturation"
            sub="Devis, paiements, rapports comptables"
          />
        </div>
      </div>
    </aside>
  );
}

function Cross({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute select-none font-light leading-none text-white/[0.07]"
      style={{ fontSize: 64, ...style }}
    >
      +
    </span>
  );
}

function Feature({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.08] p-3 backdrop-blur-sm">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white/15 text-white/90">
        {icon}
      </span>
      <div className="min-w-0">
        <strong className="block text-[13px] font-semibold leading-none text-white">
          {title}
        </strong>
        <span className="mt-0.5 block text-[11px] text-white/50">{sub}</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Tabs & panels ───────────────────────── */

function TabButton({
  active,
  onClick,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
      className={[
        "h-9 rounded-[9px] text-[13px] font-semibold tracking-[0.01em] transition-all duration-200",
        active
          ? "bg-[var(--ds-primary)] text-white shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
          : "bg-transparent text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ConnexionPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [teamHelpOpen, setTeamHelpOpen] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim();
    // 1) Membre d’équipe (localStorage) 2) Administrateur (serveur)
    const member = findMemberByCredentials(cleanEmail, password);
    if (member) {
      const res = await loginAsMemberAction(member.id);
      if (res.ok) {
        setCurrentRole(member.role);
        setCurrentUser({
          email: member.email,
          nom: member.nom,
          role: member.role,
        });
        router.push("/");
        return;
      }
      setError(res.error ?? "Erreur");
      setLoading(false);
      return;
    }
    const res = await loginAction(cleanEmail, password);
    if (res.ok) {
      setCurrentRole("admin");
      setCurrentUser({ email: cleanEmail, nom: "Administrateur", role: "admin" });
      router.push("/");
    } else {
      setError(res.error ?? "Erreur");
    }
    setLoading(false);
  }

  return (
    <form
      id="panel-connexion"
      role="tabpanel"
      aria-labelledby="tab-connexion"
      onSubmit={onSubmit}
      className="oryx-fade-slide-in"
      noValidate
    >
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--ds-text)]">
        Bon retour 👋
      </h2>
      <p className="mb-2 mt-1 text-[12.5px] leading-[1.5] text-[var(--ds-text-muted)]">
        Connectez-vous à votre espace cabinet
      </p>
      <p className="mb-5 text-[11.5px] leading-relaxed text-[var(--ds-text-subtle)]">
        Un seul identifiant : praticien ou membre d&apos;équipe, nous
        appliquons le bon accès selon l&apos;email.
      </p>

      <Field label="Adresse e-mail" htmlFor="loginEmail">
        <InputWrap iconLeft={<Mail className="h-[15px] w-[15px]" strokeWidth={2} />}>
          <input
            id="loginEmail"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="praticien@cabinet.dz"
            autoComplete="email"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      <Field label="Mot de passe" htmlFor="loginPwd">
        <InputWrap
          iconLeft={<Lock className="h-[15px] w-[15px]" strokeWidth={2} />}
          iconRight={
            <PasswordToggle show={showPwd} onToggle={() => setShowPwd((v) => !v)} />
          }
        >
          <input
            id="loginPwd"
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      <div className="mb-5 mt-0.5 flex items-center justify-between">
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-[var(--ds-text-muted)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[15px] w-[15px] cursor-pointer rounded accent-[var(--ds-primary)]"
          />
          Se souvenir de moi
        </label>
        <a
          href="#"
          className="text-[12px] font-semibold text-[var(--ds-primary)] transition-opacity hover:opacity-75"
        >
          Mot de passe oublié ?
        </a>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <PrimaryButton type="submit" disabled={loading}>
        {loading ? "Connexion…" : "Se connecter"}
      </PrimaryButton>

      <p className="mt-4 text-center">
        <button
          type="button"
          onClick={() => {
            setTeamHelpOpen((open) => {
              const next = !open;
              if (next) {
                window.setTimeout(
                  () => document.getElementById("loginEmail")?.focus(),
                  0,
                );
              }
              return next;
            });
          }}
          className="text-center text-[12px] text-[var(--ds-text-subtle)] underline decoration-[var(--ds-primary-border)] underline-offset-2 transition-colors hover:text-[var(--ds-primary)]"
        >
          {teamHelpOpen
            ? "Masquer l’aide membre"
            : "Vous êtes un membre de l’équipe ? Connectez-vous ici"}
        </button>
      </p>
      {teamHelpOpen ? (
        <p
          className="mt-3 rounded-xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-primary-soft)]/35 px-3 py-2.5 text-center text-[11.5px] leading-snug text-[var(--ds-text-muted)]"
          id="login-team-help"
        >
          Saisissez l&apos;email reçu à l&apos;invitation et le mot de passe que
          vous avez choisi, puis cliquez sur{" "}
          <span className="font-medium text-[var(--ds-text)]">Se connecter</span>
          . Vous n&apos;avez plus besoin du lien d&apos;invitation.
        </p>
      ) : null}
    </form>
  );
}

function InscriptionPanel() {
  const [cabinet, setCabinet] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => computeStrength(pwd), [pwd]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (pwd !== pwd2) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    const res = await registerAction({
      cabinet: cabinet.trim(),
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim(),
      telephone: phone.trim(),
      password: pwd,
    });
    if (res.ok) {
      setSuccess("Compte créé. Vous pouvez maintenant vous connecter.");
    } else {
      setError(res.error ?? "Erreur");
    }
    setLoading(false);
  }

  return (
    <form
      id="panel-inscription"
      role="tabpanel"
      aria-labelledby="tab-inscription"
      onSubmit={onSubmit}
      className="oryx-fade-slide-in"
      noValidate
    >
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--ds-text)]">
        Créer un compte
      </h2>
      <p className="mb-4 mt-1 text-[12.5px] leading-[1.5] text-[var(--ds-text-muted)]">
        Commencez votre essai gratuit de 30 jours
      </p>

      <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-2.5">
        <Info
          className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[var(--ds-primary)]"
          strokeWidth={2}
          aria-hidden
        />
        <p className="text-[11.5px] leading-[1.5] text-[var(--ds-primary)]">
          <strong className="font-bold">Essai 30 jours gratuit</strong> — Aucune
          carte bancaire requise. Accès complet à toutes les fonctionnalités.
        </p>
      </div>

      <Field label="Nom du cabinet" htmlFor="regCabinet">
        <InputWrap iconLeft={<Building2 className="h-[15px] w-[15px]" strokeWidth={2} />}>
          <input
            id="regCabinet"
            type="text"
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            placeholder="Cabinet Dentaire Al Chifa"
            autoComplete="organization"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        <Field label="Nom" htmlFor="regNom" compact>
          <InputWrap
            iconLeft={<User className="h-[15px] w-[15px]" strokeWidth={2} />}
          >
            <input
              id="regNom"
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Benali"
              autoComplete="family-name"
              className={INPUT_CLS}
            />
          </InputWrap>
        </Field>
        <Field label="Prénom" htmlFor="regPrenom" compact>
          <InputWrap>
            <input
              id="regPrenom"
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Yasmine"
              autoComplete="given-name"
              className={INPUT_CLS_NO_ICON}
            />
          </InputWrap>
        </Field>
      </div>

      <Field label="E-mail professionnel" htmlFor="regEmail">
        <InputWrap iconLeft={<Mail className="h-[15px] w-[15px]" strokeWidth={2} />}>
          <input
            id="regEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dr.benali@cabinet.dz"
            autoComplete="email"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      <Field label="Téléphone" htmlFor="regPhone">
        <InputWrap iconLeft={<Phone className="h-[15px] w-[15px]" strokeWidth={2} />}>
          <input
            id="regPhone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+213 555 123 456"
            autoComplete="tel"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      <Field label="Mot de passe" htmlFor="regPwd">
        <InputWrap
          iconLeft={<Lock className="h-[15px] w-[15px]" strokeWidth={2} />}
          iconRight={
            <PasswordToggle show={showPwd} onToggle={() => setShowPwd((v) => !v)} />
          }
        >
          <input
            id="regPwd"
            type={showPwd ? "text" : "password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Min. 8 caractères"
            autoComplete="new-password"
            className={INPUT_CLS}
          />
        </InputWrap>
        <PwdStrength score={strength} />
      </Field>

      <Field label="Confirmation" htmlFor="regPwd2">
        <InputWrap iconLeft={<Check className="h-[15px] w-[15px]" strokeWidth={2} />}>
          <input
            id="regPwd2"
            type={showPwd ? "text" : "password"}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="Répétez le mot de passe"
            autoComplete="new-password"
            className={INPUT_CLS}
          />
        </InputWrap>
      </Field>

      {error ? <FormError>{error}</FormError> : null}
      {success ? (
        <p className="mb-3 rounded-[10px] border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-2 text-[12px] text-[var(--ds-primary)]">
          {success}
        </p>
      ) : null}

      <div className="mt-2">
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Création…" : "Créer mon compte Oryx →"}
        </PrimaryButton>
      </div>
    </form>
  );
}

/* ───────────────────────── Primitives UI ───────────────────────── */

const INPUT_CLS =
  "h-11 w-full rounded-[12px] border-[1.5px] border-[var(--ds-primary-border)] bg-[var(--ds-bg)] pl-10 pr-10 text-[13px] text-[var(--ds-text)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--ds-text-subtle)] focus:border-[var(--ds-primary)] focus:bg-[var(--ds-surface)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-primary)_14%,transparent)]";

const INPUT_CLS_NO_ICON =
  "h-11 w-full rounded-[12px] border-[1.5px] border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3.5 text-[13px] text-[var(--ds-text)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--ds-text-subtle)] focus:border-[var(--ds-primary)] focus:bg-[var(--ds-surface)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-primary)_14%,transparent)]";

function Field({
  label,
  htmlFor,
  compact = false,
  children,
}: {
  label: string;
  htmlFor: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={compact ? "" : "mb-3.5"}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.02em] text-[var(--ds-text-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function InputWrap({
  iconLeft,
  iconRight,
  children,
}: {
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group relative">
      {iconLeft ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[13px] top-1/2 flex -translate-y-1/2 items-center text-[var(--ds-text-subtle)] transition-colors group-focus-within:text-[var(--ds-primary)]"
        >
          {iconLeft}
        </span>
      ) : null}
      {children}
      {iconRight ? (
        <span className="absolute right-[6px] top-1/2 -translate-y-1/2">
          {iconRight}
        </span>
      ) : null}
    </div>
  );
}

function PasswordToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ds-text-subtle)] transition-colors hover:text-[var(--ds-primary)]"
    >
      {show ? (
        <EyeOff className="h-[15px] w-[15px]" strokeWidth={2} />
      ) : (
        <Eye className="h-[15px] w-[15px]" strokeWidth={2} />
      )}
    </button>
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className="relative mt-1 h-[46px] w-full overflow-hidden rounded-[12px] text-[14px] font-bold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.45)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
      }}
    >
      {children}
    </button>
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-3 rounded-[10px] border border-[var(--ds-border-strong)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12px] text-[var(--ds-primary-hover)]"
    >
      {children}
    </p>
  );
}

function PwdStrength({ score }: { score: number }) {
  /** score: 0..4 */
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#10b981"];
  return (
    <div className="mt-1.5 flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-[3px] flex-1 rounded-[2px] transition-colors"
          style={{
            backgroundColor:
              i <= score && score > 0
                ? colors[score - 1]
                : "var(--ds-primary-border)",
          }}
        />
      ))}
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-[var(--ds-text-subtle)] no-underline transition-colors hover:text-[var(--ds-primary)]"
    >
      {children}
    </a>
  );
}

/* ───────────────────────── Icônes inline (match référence) ───────────────────────── */

function CalendarIcon() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function computeStrength(val: string) {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  return score;
}
