/**
 * Protocoles dentaires standards algériens - tarifs par défaut
 * Chargés automatiquement si la liste est vide (premier démarrage)
 */
export const DEFAULT_ACTES_TARIFS = [
  // Omnipratique
  { categorie: "Omnipratique", acte: "Consultation/Examen", prix: 500 },
  { categorie: "Omnipratique", acte: "Détartrage", prix: 1500 },
  { categorie: "Omnipratique", acte: "Extraction simple", prix: 2000 },
  { categorie: "Omnipratique", acte: "Extraction chirurgicale", prix: 4000 },
  { categorie: "Omnipratique", acte: "Traitement canalaire (monoradiculé)", prix: 4000 },
  { categorie: "Omnipratique", acte: "Traitement canalaire (pluriradiculé)", prix: 6000 },
  { categorie: "Omnipratique", acte: "Obturation composite (1 face)", prix: 2500 },
  { categorie: "Omnipratique", acte: "Obturation composite (2 faces)", prix: 3500 },
  { categorie: "Omnipratique", acte: "Obturation composite (3 faces)", prix: 4500 },
  { categorie: "Omnipratique", acte: "Scellement de sillon", prix: 1000 },
  // Prothèse
  { categorie: "Prothèse", acte: "Couronne céramo-métallique", prix: 15000 },
  { categorie: "Prothèse", acte: "Couronne zircone", prix: 25000 },
  { categorie: "Prothèse", acte: "Bridge 3 éléments", prix: 35000 },
  { categorie: "Prothèse", acte: "Prothèse amovible partielle", prix: 20000 },
  { categorie: "Prothèse", acte: "Prothèse amovible totale", prix: 25000 },
  // Orthodontie
  { categorie: "Orthodontie", acte: "Bilan orthodontique", prix: 2000 },
  { categorie: "Orthodontie", acte: "Appareil fixe (arcade)", prix: 45000 },
  { categorie: "Orthodontie", acte: "Gouttière transparente", prix: 35000 },
  { categorie: "Orthodontie", acte: "Contention", prix: 5000 },
  // Parodontologie
  { categorie: "Parodontologie", acte: "Détartrage + surfaçage radiculaire", prix: 3000 },
  { categorie: "Parodontologie", acte: "Chirurgie parodontale", prix: 8000 },
  // Implantologie
  { categorie: "Implantologie", acte: "Implant dentaire", prix: 60000 },
  { categorie: "Implantologie", acte: "Couronne sur implant", prix: 20000 },
] as const;
