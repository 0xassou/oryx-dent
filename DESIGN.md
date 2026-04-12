# DESIGN.md — Oryx · Gestion Dentaire

> Fiche d'identité visuelle complète.
> Ce fichier est la référence absolue pour tout développement UI.
> Cursor lit ce fichier avant chaque génération de composant.

---

## 01 · Identité de marque

| Élément | Valeur |
|---------|--------|
| Nom | **Oryx** |
| Sous-titre | Gestion Dentaire |
| Marché | Algérie — Cabinets dentaires |
| Positionnement | SaaS médical premium, moderne, unique |
| Inspiration | Linear.app + FinTech médical |

---

## 02 · Logo

- Oryx géométrique low-poly fusionné avec une dent
- Cornes effilées, tête angulaire, style polygonal
- **Fond violet → Logo blanc**
- **Fond blanc → Logo violet ou noir**
- Fichiers : `public/logo.svg` / `public/logo-white.svg`
- Ne jamais déformer, étirer ou recolorer autrement

---

## 03 · Couleurs

### Couleurs principales

```css
:root {
  --primary:        #7c3aed;  /* Violet — couleur Oryx */
  --primary-dark:   #6d28d9;  /* Violet foncé — hover */
  --primary-soft:   #f5f3ff;  /* Violet très clair — backgrounds */
  --primary-border: #ede9fe;  /* Violet border */

  --bg:      #faf9ff;  /* Background global — blanc légèrement violet */
  --surface: #ffffff;  /* Cards, modals, sidebar */
  --text:    #0f172a;  /* Texte principal */
  --text-muted:  #64748b;  /* Texte secondaire */
  --text-subtle: #94a3b8;  /* Labels, placeholders */
  --border:  #f1f5f9;  /* Bordures légères */
}
```

### Couleurs sémantiques

```css
--success: #10b981;  /* Vert — Payé, OK, Terminé */
--warning: #f59e0b;  /* Ambre — En attente, Faible */
--danger:  #ef4444;  /* Rouge — Rupture, Urgence, Impayé */
--info:    #06b6d4;  /* Cyan — Au fauteuil, Info */
```

### Couleurs odontogramme — FIXES, ne jamais changer

```css
--tooth-soin:      #06b6d4;  /* Cyan — Soins */
--tooth-chirurgie: #f97316;  /* Orange — Chirurgie */
--tooth-ortho:     #10b981;  /* Émeraude — Orthopédie */
--tooth-sain:      #e2e8f0;  /* Gris clair — Saine */
--tooth-absent:    #cbd5e1;  /* Gris — Absente */
```

---

## 04 · Typographie

### Police principale — Sora (Google Fonts)

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');

font-family: 'Sora', sans-serif;
```

**Sora pour tout le texte de l'interface — sans exception.**

| Poids | Usage |
|-------|-------|
| 700 | Titres de pages, noms patients, montants KPI |
| 600 | Boutons, navigation active, sous-titres |
| 500 | Tags, labels, badges |
| 400 | Texte courant, descriptions, corps |
| 300 | Timestamps, données secondaires |

### Police chiffres — DM Mono (Google Fonts)

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');

/* Uniquement pour : montants DA, numéros de dents, KPIs numériques */
font-family: 'DM Mono', monospace;
```

### Échelle typographique

```css
--text-xs:   11px;  /* Labels uppercase */
--text-sm:   12px;  /* Corps secondaire */
--text-base: 13px;  /* Corps principal */
--text-md:   15px;  /* Sous-titres */
--text-lg:   18px;  /* Titres sections */
--text-xl:   22px;  /* Titres pages */
--text-2xl:  28px;  /* KPIs grands */
```

---

## 05 · Espacements & Rayons

### Border radius

```css
--radius-sm:  8px;   /* Badges, tags, inputs petits */
--radius-md:  12px;  /* Boutons, inputs */
--radius-lg:  16px;  /* Cards secondaires */
--radius-xl:  20px;  /* Cards principales */
--radius-2xl: 24px;  /* Modals, panels */
```

**Règle : jamais de coins droits (0px) dans l'interface.**

### Shadows

```css
--shadow-sm:  0 1px 3px rgba(0,0,0,0.04);
--shadow-md:  0 4px 16px rgba(0,0,0,0.06);
--shadow-lg:  0 8px 32px rgba(0,0,0,0.08);
--shadow-primary: 0 4px 16px rgba(124,58,237,0.25);
```

---

## 06 · Composants de base

### Bouton primaire

```css
background: var(--primary);
color: white;
border-radius: var(--radius-md);
padding: 8px 16px;
font-family: 'Sora', sans-serif;
font-weight: 600;
font-size: 13px;
box-shadow: var(--shadow-primary);
border: none;
```

### Bouton secondaire

```css
background: var(--primary-soft);
color: var(--primary);
border: 1px solid var(--primary-border);
border-radius: var(--radius-md);
padding: 8px 16px;
font-weight: 600;
font-size: 13px;
```

### Card

```css
background: white;
border-radius: var(--radius-xl);
border: 1px solid var(--border);
box-shadow: var(--shadow-sm);
```

### Input

```css
border: 1px solid #e2e8f0;
border-radius: var(--radius-md);
padding: 10px 14px;
font-family: 'Sora', sans-serif;
font-size: 13px;
color: var(--text);
background: white;
outline: none;
/* Focus */
border-color: var(--primary);
box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
```

### Tags / Badges

```css
/* Structure */
display: inline-flex;
align-items: center;
font-size: 11px;
font-weight: 600;
padding: 3px 10px;
border-radius: 50px;
border: 1px solid;

/* Violet — Actif, Sélectionné */
background: #f5f3ff; color: #7c3aed; border-color: #ede9fe;

/* Vert — Payé, Terminé, OK */
background: #f0fdf4; color: #16a34a; border-color: #bbf7d0;

/* Ambre — En attente, Faible */
background: #fffbeb; color: #d97706; border-color: #fde68a;

/* Rouge — Urgent, Rupture, Impayé */
background: #fef2f2; color: #dc2626; border-color: #fecaca;

/* Cyan — Au fauteuil, Info */
background: #ecfeff; color: #0891b2; border-color: #a5f3fc;

/* Orange — Urgence médicale */
background: #fff7ed; color: #ea580c; border-color: #fed7aa;

/* Slate — Neutre, À venir */
background: #f8fafc; color: #475569; border-color: #e2e8f0;
```

---

## 07 · Layout & Navigation

### Structure globale

```
┌─────────────┬──────────────────────────────┐
│             │                              │
│   Sidebar   │         Main Content         │
│   220px     │         flex: 1              │
│   fixe      │         overflow-y: auto     │
│             │                              │
└─────────────┴──────────────────────────────┘
```

### Sidebar

```css
width: 220px;
background: white;
border-right: 1px solid var(--primary-border);
height: 100vh;
position: fixed;
```

**Structure sidebar :**
- Header logo (fond blanc, logo violet)
- Navigation items
- Footer : status pill "● Système opérationnel"

### Nav item actif

```css
background: var(--primary-soft);
color: var(--primary);
font-weight: 600;
border-radius: var(--radius-md);
```

---

## 08 · Odontogramme

**Règle absolue : les couleurs de l'odontogramme ne changent JAMAIS.**
Elles sont indépendantes de la couleur principale de l'interface.

| Statut | Couleur | Hex |
|--------|---------|-----|
| Soins | Cyan | #06b6d4 |
| Chirurgie | Orange | #f97316 |
| Orthopédie | Émeraude | #10b981 |
| Saine | Gris clair | #e2e8f0 |
| Absente | Gris + croix rouge | #cbd5e1 |

**Les dents absentes ont une croix rouge `#ef4444` en diagonale.**

---

## 09 · Modules et couleurs d'accent

| Module | Couleur accent | Usage |
|--------|---------------|-------|
| Dashboard | Violet #7c3aed | KPI principal |
| Patients | Violet #7c3aed | Actions |
| Planning | Cyan #06b6d4 | RDV actifs |
| Finances | Émeraude #10b981 | Recettes |
| Stocks | Ambre #f59e0b | Alertes |
| Laboratoire | Orange #f97316 | Commandes |
| Stérilisation | Slate #475569 | Cycles |

---

## 10 · Stack technique

```
Framework  : Next.js 16 — App Router
Language   : TypeScript
Styling    : Tailwind CSS v4
Graphiques : Recharts
Animations : Framer Motion
Icônes     : Lucide React
Polices    : Sora + DM Mono (Google Fonts)
BDD        : PostgreSQL (local dev → VPS algérien prod)
```

---

## 11 · Règles design — à respecter absolument

1. **Jamais de coins droits** — minimum `rounded-xl` partout
2. **Ombres légères uniquement** — pas de shadows lourdes
3. **Violet = Oryx uniquement** — pas pour les statuts médicaux
4. **Odontogramme = couleurs fixes** — jamais modifier
5. **Sora partout** — pas d'autre police sauf DM Mono pour les chiffres
6. **Fond #faf9ff** — pas blanc pur, légèrement teinté violet
7. **Pas de borders lourdes** — 1px solid var(--border) maximum
8. **Dark mode** — prévu via CSS variables, à implémenter en Phase 3
9. **Mobile** — à implémenter en Phase 2 après stabilisation desktop
10. **Densité** — interface dense mais aérée, pas de padding excessif

---

## 12 · Ce qui ne change pas (décisions finales)

| Décision | Statut |
|----------|--------|
| Nom : Oryx | ✅ Final |
| Couleur : Violet #7c3aed | ✅ Final |
| Police : Sora | ✅ Final |
| Logo : blanc sur violet | ✅ Final |
| Odontogramme : cyan/orange/émeraude | ✅ Final |
| Hébergement : VPS algérien | ✅ Final |
| Prix : 4000 DA/mois | ✅ Final |

---

*Oryx · Gestion Dentaire · Algérie · 2025*
*Ce fichier est la source de vérité du design system.*
