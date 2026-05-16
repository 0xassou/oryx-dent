/**
 * Tarifs par défaut (DA) — alignés sur `data/protocols_seed.json`.
 * Le champ `acte` doit correspondre EXACTEMENT au champ `nom` de chaque protocole du seed
 * (même casse, même ponctuation) pour le pré-remplissage du cockpit clinique.
 */
export const DEFAULT_ACTES_TARIFS = [
  // Prévention & Bilan
  {
    categorie: "Prévention & Bilan",
    acte: "Consultation Initiale / Bilan complet",
    prix: 500,
  },
  {
    categorie: "Prévention & Bilan",
    acte: "Détartrage & Polissage",
    prix: 1500,
  },
  {
    categorie: "Prévention & Bilan",
    acte: "Scellement de sillons (Sealants)",
    prix: 800,
  },
  {
    categorie: "Prévention & Bilan",
    acte: "Application de vernis fluoré",
    prix: 600,
  },

  // Soins Conservateurs
  {
    categorie: "Soins Conservateurs",
    acte: "Restauration Composite 1 face",
    prix: 2500,
  },
  {
    categorie: "Soins Conservateurs",
    acte: "Restauration Composite 2 faces ou +",
    prix: 3500,
  },
  {
    categorie: "Soins Conservateurs",
    acte: "Composite Antérieur / Stratification esthétique",
    prix: 4500,
  },
  {
    categorie: "Soins Conservateurs",
    acte: "Reconstitution au Verre Ionomère (CVI)",
    prix: 1800,
  },
  {
    categorie: "Soins Conservateurs",
    acte: "Coiffage pulpaire (Biodentine ou Hydroxyde de calcium)",
    prix: 2000,
  },
  {
    categorie: "Soins Conservateurs",
    acte: "Traitement d'urgence (pansement provisoire)",
    prix: 1000,
  },

  // Endodontie
  {
    categorie: "Endodontie",
    acte: "Biopulpectomie Mono-radiculaire",
    prix: 4000,
  },
  {
    categorie: "Endodontie",
    acte: "Biopulpectomie Pluri-radiculaire",
    prix: 6000,
  },

  // Prothèse
  {
    categorie: "Prothèse",
    acte: "Empreinte Primaire",
    prix: 500,
  },
  {
    categorie: "Prothèse",
    acte: "Empreinte Secondaire Silicone",
    prix: 1000,
  },
  {
    categorie: "Prothèse",
    acte: "Préparation pour Couronne & Couronne Provisoire",
    prix: 8000,
  },
  {
    categorie: "Prothèse",
    acte: "Scellement définitif",
    prix: 2500,
  },

  // Chirurgie & Implantologie
  {
    categorie: "Chirurgie & Implantologie",
    acte: "Extraction Simple",
    prix: 2000,
  },
  {
    categorie: "Chirurgie & Implantologie",
    acte: "Extraction Chirurgicale",
    prix: 4000,
  },
  {
    categorie: "Chirurgie & Implantologie",
    acte: "Pose d'implant - 1er temps",
    prix: 60000,
  },
  {
    categorie: "Chirurgie & Implantologie",
    acte: "Contrôle post-opératoire / Dépose de fils",
    prix: 500,
  },
] as const;
