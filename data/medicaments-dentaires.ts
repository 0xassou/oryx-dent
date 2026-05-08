export type MedicamentPreset = {
  nom: string;
  dosage: string;
  posologie: string;
  duree: string;
};

// Presets dentaires courants (Algérie) — liste volontairement simple.
// Le praticien peut toujours éditer après sélection.
export const MEDICAMENTS_DENTAIRES: MedicamentPreset[] = [
  { nom: "Amoxicilline", dosage: "1g", posologie: "1 comprimé 3x/jour", duree: "7 jours" },
  { nom: "Amoxicilline", dosage: "500mg", posologie: "1 comprimé 3x/jour", duree: "5 jours" },
  { nom: "Amoxicilline", dosage: "500mg", posologie: "1 gélule 3x/jour", duree: "7 jours" },
  { nom: "Amoxicilline + Acide clavulanique (Augmentin)", dosage: "1g", posologie: "1 comprimé 2x/jour", duree: "7 jours" },
  { nom: "Amoxicilline + Acide clavulanique (Augmentin)", dosage: "625mg", posologie: "1 comprimé 3x/jour", duree: "5 jours" },
  { nom: "Métronidazole", dosage: "500mg", posologie: "1 comprimé 3x/jour", duree: "7 jours" },
  { nom: "Métronidazole", dosage: "250mg", posologie: "1 comprimé 3x/jour", duree: "7 jours" },
  { nom: "Spiramycine", dosage: "3 MUI", posologie: "1 comprimé 3x/jour", duree: "5 jours" },
  { nom: "Spiramycine + Métronidazole", dosage: "—", posologie: "1 comprimé 2x/jour", duree: "7 jours" },
  { nom: "Clindamycine", dosage: "300mg", posologie: "1 gélule 3x/jour", duree: "7 jours" },
  { nom: "Clindamycine", dosage: "150mg", posologie: "1 gélule 4x/jour", duree: "7 jours" },
  { nom: "Azithromycine", dosage: "500mg", posologie: "1 comprimé/jour", duree: "3 jours" },
  { nom: "Céfalexine", dosage: "500mg", posologie: "1 gélule 3x/jour", duree: "7 jours" },
  { nom: "Cefixime", dosage: "200mg", posologie: "1 comprimé 2x/jour", duree: "7 jours" },
  { nom: "Ciprofloxacine", dosage: "500mg", posologie: "1 comprimé 2x/jour", duree: "7 jours" },

  { nom: "Ibuprofène", dosage: "400mg", posologie: "1 comprimé 3x/jour", duree: "5 jours" },
  { nom: "Ibuprofène", dosage: "600mg", posologie: "1 comprimé 2x/jour", duree: "3 jours" },
  { nom: "Kétoprofène", dosage: "100mg", posologie: "1 comprimé 2x/jour", duree: "3 jours" },
  { nom: "Diclofénac", dosage: "50mg", posologie: "1 comprimé 2x/jour", duree: "3 jours" },
  { nom: "Naproxène", dosage: "500mg", posologie: "1 comprimé 2x/jour", duree: "5 jours" },

  { nom: "Paracétamol", dosage: "1g", posologie: "1 comprimé 3x/jour", duree: "3 jours" },
  { nom: "Paracétamol", dosage: "500mg", posologie: "1 comprimé 3x/jour", duree: "3 jours" },
  { nom: "Doliprane", dosage: "1g", posologie: "1 comprimé 3x/jour", duree: "3 jours" },
  { nom: "Efferalgan", dosage: "1g", posologie: "1 comprimé 3x/jour", duree: "3 jours" },
  { nom: "Tramadol", dosage: "50mg", posologie: "1 gélule si douleur (max 3/jour)", duree: "2 jours" },

  { nom: "Prednisolone", dosage: "20mg", posologie: "1 comprimé/jour", duree: "3 jours" },
  { nom: "Dexaméthasone", dosage: "4mg", posologie: "1 comprimé/jour", duree: "3 jours" },
  { nom: "Bétaméthasone", dosage: "2mg", posologie: "1 comprimé/jour", duree: "3 jours" },
  { nom: "Oméprazole", dosage: "20mg", posologie: "1 gélule/jour", duree: "7 jours" },

  { nom: "Chlorhexidine (bain de bouche)", dosage: "0,12%", posologie: "Bain de bouche 3x/jour", duree: "10 jours" },
  { nom: "Chlorhexidine (bain de bouche)", dosage: "0,2%", posologie: "Bain de bouche 2x/jour", duree: "7 jours" },
  { nom: "Hexétidine (bain de bouche)", dosage: "0,1%", posologie: "Bain de bouche 2x/jour", duree: "7 jours" },
  { nom: "Povidone iodée (bain de bouche)", dosage: "—", posologie: "Bain de bouche 2x/jour", duree: "5 jours" },

  { nom: "Fluconazole", dosage: "150mg", posologie: "1 gélule/semaine", duree: "2 semaines" },
  { nom: "Nystatine (suspension)", dosage: "100 000 UI/ml", posologie: "4x/jour (bains de bouche)", duree: "7 jours" },
  { nom: "Aciclovir", dosage: "200mg", posologie: "1 comprimé 5x/jour", duree: "5 jours" },

  { nom: "Loratadine", dosage: "10mg", posologie: "1 comprimé/jour", duree: "5 jours" },
  { nom: "Cétirizine", dosage: "10mg", posologie: "1 comprimé/jour", duree: "5 jours" },

  { nom: "Acide méfénamique", dosage: "500mg", posologie: "1 comprimé 2x/jour", duree: "3 jours" },
  { nom: "Bains de bouche (eau salée tiède)", dosage: "—", posologie: "3x/jour", duree: "7 jours" },
];

