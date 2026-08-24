# Guidelines de Développement - Tableau de Risques de Contamination

## 1. Principes généraux

### 1.1 Code Quality
* **Single Responsibility Principle (SRP)** : Chaque fonction/composant doit avoir une seule responsabilité
* **DRY (Don't Repeat Yourself)** : Éviter la duplication de code, créer des utilitaires réutilisables
* **KISS (Keep It Simple Stupid)** : Préférer la simplicité à la complexité
* **Refactor au fur et à mesure** : Ne pas laisser la dette technique s'accumuler
* **Code Review obligatoire** : Aucun code en production sans approbation

### 1.2 Architecture
* **Layouts responsives** : Utiliser Flexbox et Grid, **jamais positionnement absolu** sauf cas très particulier
* **Composants réutilisables** : Mettre les composants génériques dans \src/app/components/ui/\
* **Composants métier** : Mettre les composants spécifiques au projet dans \src/app/components/\
* **Séparation des concerns** : Logique métier séparée de l'UI


## 2. TypeScript

* **Mode strict** : Toujours activé
* **Pas de any** : Typer explicitement tout
* **Zod** : Validation des données API

## 3. React et Composants

* **Functional components** : Uniquement
* **Hooks** : useCallback, useMemo, useContext
* **Custom hooks** : Pour logique réutilisable

## 4. Styling

* **Tailwind CSS** : Utility-first approach
* **Mobile-first** : Responsive design
* **Pas d'inline styles** : Sauf cas exceptionnel

## 5. Tests

* **Coverage** : Minimum 80%
* **Vitest + React Testing Library**
* **E2E** : Playwright pour flows critiques

## 6. Git

* **Commits clairs** : \eat:\, \ix:\, \chore:\
* **Atomic commits** : Une feature = un commit
* **Code review obligatoire**

## 7. Performance

* **Code splitting** : React.lazy() pour routes
* **Web Vitals** : LCP < 2.5s, FID < 100ms
* **Bundle size** : < 200KB gzip

Bon développement! 🚀
