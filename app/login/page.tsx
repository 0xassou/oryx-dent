"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setLoading(true);
    const res = await loginAction(email, password);
    if (res.ok) {
      router.push("/");
    } else {
      setError(res.error ?? "Erreur");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-[#ddd6fe] 
      flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white 
        rounded-2xl shadow-xl p-8 space-y-6">
        
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex h-14 w-14 
            items-center justify-center 
            rounded-2xl bg-[#7c3aed] 
            shadow-lg mx-auto mb-4">
            <img 
              src="/logo-white.svg" 
              alt="Oryx"
              className="h-8 w-8 object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <h1 className="text-2xl font-bold 
            text-slate-900">Oryx</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion Dentaire
          </p>
        </div>

        {/* Formulaire */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs 
              font-semibold text-slate-600 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="admin@oryx.dz"
              className="w-full h-10 rounded-xl border 
                border-slate-200 bg-slate-50 px-3 
                text-sm outline-none transition-all
                focus:border-[#7c3aed]/50
                focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"
            />
          </div>
          <div>
            <label className="block text-xs 
              font-semibold text-slate-600 mb-1.5">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="••••••••"
              className="w-full h-10 rounded-xl border 
                border-slate-200 bg-slate-50 px-3 
                text-sm outline-none transition-all
                focus:border-[#7c3aed]/50
                focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 
              bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full h-10 rounded-xl 
              bg-[#7c3aed] text-white text-sm 
              font-semibold transition-all
              hover:bg-[#6d28d9]
              disabled:opacity-50">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}
