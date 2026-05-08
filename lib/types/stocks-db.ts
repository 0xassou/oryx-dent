/** Modèle Stocks (PostgreSQL). */

export type StockRow = {
  id: string;
  nom: string;
  categorie: string | null;
  quantite: number;
  quantite_min: number;
  unite: string | null;
  prix_unitaire: string | null;
  fournisseur: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StockInput = {
  nom: string;
  categorie?: string | null;
  quantite?: number;
  quantite_min?: number;
  unite?: string | null;
  prix_unitaire?: number | string | null;
  fournisseur?: string | null;
  notes?: string | null;
};
