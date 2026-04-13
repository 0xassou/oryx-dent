"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, X } from "lucide-react";

interface VoiceCommand {
  pattern: RegExp;
  action: (match: RegExpMatchArray) => void;
  description: string;
}

/** Constructeur SpeechRecognition (préfixe webkit) — pas toujours dans les typings TS du projet */
type WebSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function VoiceAssistant() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const [show, setShow] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3000);
  };

  const commands: VoiceCommand[] = [
    {
      pattern: /nouveau patient/i,
      action: () => {
        router.push("/patients");
        showFeedback("✅ Ouverture de la liste patients");
      },
      description: "Nouveau patient",
    },
    {
      pattern: /nouveau (rdv|rendez.vous)/i,
      action: () => {
        router.push("/planning?newRdv=true");
        showFeedback("✅ Ouverture du planning");
      },
      description: "Nouveau RDV",
    },
    {
      pattern: /ouvrir (planning|agenda)/i,
      action: () => {
        router.push("/planning");
        showFeedback("✅ Planning ouvert");
      },
      description: "Ouvrir le planning",
    },
    {
      pattern: /ouvrir (patients|liste)/i,
      action: () => {
        router.push("/patients");
        showFeedback("✅ Patients ouverts");
      },
      description: "Ouvrir les patients",
    },
    {
      pattern: /ouvrir (stock|stocks)/i,
      action: () => {
        router.push("/stocks");
        showFeedback("✅ Stocks ouverts");
      },
      description: "Ouvrir les stocks",
    },
    {
      pattern: /ouvrir (finances|facturation)/i,
      action: () => {
        router.push("/finances");
        showFeedback("✅ Finances ouvertes");
      },
      description: "Ouvrir les finances",
    },
    {
      pattern: /ouvrir (tableau de bord|accueil|dashboard)/i,
      action: () => {
        router.push("/");
        showFeedback("✅ Tableau de bord ouvert");
      },
      description: "Tableau de bord",
    },
    {
      pattern: /ouvrir (paramètres|réglages|settings)/i,
      action: () => {
        router.push("/settings");
        showFeedback("✅ Paramètres ouverts");
      },
      description: "Paramètres",
    },
    {
      pattern: /ouvrir (laboratoire|labo)/i,
      action: () => {
        router.push("/laboratoire");
        showFeedback("✅ Laboratoire ouvert");
      },
      description: "Laboratoire",
    },
    {
      pattern: /ouvrir (stérilisation|sterilisation)/i,
      action: () => {
        router.push("/sterilisation");
        showFeedback("✅ Stérilisation ouverte");
      },
      description: "Stérilisation",
    },
  ];

  const processCommand = (text: string) => {
    setTranscript(text);
    for (const cmd of commands) {
      const match = text.match(cmd.pattern);
      if (match) {
        cmd.action(match);
        stopListening();
        return;
      }
    }
    showFeedback(`❓ Commande non reconnue : "${text}"`);
  };

  const startListening = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => WebSpeechRecognition })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => WebSpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      showFeedback("❌ Reconnaissance vocale non supportée");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      processCommand(text);
    };

    recognition.onerror = (event) => {
      showFeedback(
        `❌ ${
          event.error === "not-allowed"
            ? "Autorisez le microphone dans votre navigateur"
            : event.error === "no-speech"
              ? "Aucune parole détectée — réessayez"
              : "Erreur micro : " + event.error
        }`,
      );
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
    setShow(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setTimeout(() => setShow(false), 2000);
  };

  const toggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Bouton micro */}
      <button
        type="button"
        onClick={toggle}
        title="Assistant vocal"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-all"
        style={{
          background: isListening ? "var(--ds-primary)" : "transparent",
          color: isListening ? "white" : "var(--ds-text-muted)",
        }}
      >
        {/* Animation pulsante quand actif */}
        {isListening && (
          <span
            className="absolute inset-0 rounded-xl animate-ping opacity-30"
            style={{
              background: "var(--ds-primary)",
            }}
          />
        )}

        {isListening ? (
          <Mic className="relative h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {/* Panel feedback */}
      {show && (
        <div
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
        >
          <div
            className="min-w-[280px] max-w-[340px] rounded-2xl border px-5 py-4 shadow-xl"
            style={{
              background: "var(--ds-surface)",
              borderColor: "var(--ds-primary-border)",
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: isListening ? "#22c55e" : "#94a3b8",
                    animation: isListening ? "pulse 1s infinite" : "none",
                  }}
                />
                <p className="text-xs font-semibold" style={{ color: "var(--ds-text)" }}>
                  {isListening ? "Écoute en cours..." : "Traitement..."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setShow(false);
                }}
                className="opacity-50 hover:opacity-100"
              >
                <X className="h-4 w-4" style={{ color: "var(--ds-text-muted)" }} />
              </button>
            </div>

            {transcript && (
              <p className="mb-2 text-sm italic" style={{ color: "var(--ds-text-muted)" }}>
                &quot;{transcript}&quot;
              </p>
            )}

            {feedback && (
              <p className="text-sm font-medium" style={{ color: "var(--ds-primary)" }}>
                {feedback}
              </p>
            )}

            {isListening && !transcript && (
              <p className="text-xs" style={{ color: "var(--ds-text-muted)" }}>
                Dites par exemple : &quot;Nouveau RDV&quot; ou &quot;Ouvrir patients&quot;
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
