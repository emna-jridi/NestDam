# 🔍 ANALYSE APPROFONDIE - Modules: Analysis, App-Registry, External-APIs, Scan

**Date**: 16 Novembre 2025  
**Focus**: Flow de travail, fonctions utilisées/non-utilisées, correctness des APIs

---

## 📊 TABLE DES MATIÈRES

1. [Architecture générale & Flow](#architecture)
2. [Module ANALYSIS](#module-analysis)
3. [Module APP-REGISTRY](#module-app-registry)
4. [Module EXTERNAL-APIS](#module-external-apis)
5. [Module SCAN](#module-scan)
6. [Intégration Cross-Module](#intégration)
7. [Issues détectées](#issues)
8. [Recommandations](#recommandations)

---

## 🏗️ ARCHITECTURE GÉNÉRALE & FLOW {#architecture}

```
┌─────────────────────────────────────────────────────────────┐
│                    ANDROID CLIENT                            │
│         (Envoie apps installées + permissions + trackers)   │
└──────────────────────┬──────────────────────────────────────┘
                       │ POST /api/v1/scan/installed
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SCAN.CONTROLLER                                   │
│  ├─ POST /scan/installed → ScanService.analyzeInstalledApps()       │
│  ├─ POST /scan/apk → ScanService.uploadApk()                        │
│  ├─ POST /scan/metadata → ScanService.analyzeMetadata()             │
│  ├─ GET /scan/history → placeholder (NOT IMPLEMENTED)               │
│  └─ POST /admin/add-package-mapping → ExodusService.addMapping()    │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────┐
│              SCAN.SERVICE                                  │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ analyzeInstalledApps()                               │  │
│ │ ├─ Pour chaque app: analyzeInstalledApp()            │  │
│ │ │  ├─ appRegistry.getOrCreateApp(packageName)        │  │
│ │ │  ├─ exodusService.getTrackers() [FUSION]           │  │
│ │ │  ├─ riskCalculator.calculateRiskScore()            │  │
│ │ │  └─ app.save()                                     │  │
│ │ └─ scanModel.create() [SAVE SCAN]                    │  │
│ │                                                       │  │
│ │ uploadApk()                                           │  │
│ │ ├─ mobsfService.uploadApk()                          │  │
│ │ ├─ mobsfService.scanApk()                            │  │
│ │ ├─ mobsfService.getReport()                          │  │
│ │ ├─ appRegistry.getOrCreateApp() + update              │  │
│ │ └─ scanModel.create() [SAVE SCAN]                    │  │
│ │                                                       │  │
│ │ analyzeMetadata()                                     │  │
│ │ ├─ riskCalculator.calculateRiskScore()              │  │
│ │ └─ scanModel.create() [SAVE SCAN]                    │  │
│ └──────────────────────────────────────────────────────┘  │
└─────────────┬──────────────────┬───────────────┬──────────┘
              │                  │               │
              ▼                  ▼               ▼
    ┌─────────────────┐  ┌──────────────┐ ┌──────────────┐
    │  APP-REGISTRY   │  │ EXTERNAL-API │ │  ANALYSIS    │
    │   (getOrCreate) │  │  (Exodus)    │ │  (Risk Score)│
    └─────────────────┘  └──────────────┘ └──────────────┘
              │
              ▼
    ┌──────────────────┐
    │  MONGODB         │
    │  ├─ App Schema   │
    │  ├─ Tracker DB   │
    │  ├─ Scan Results │
    │  └─ Permissions  │
    └──────────────────┘
```

---

## 📦 MODULE ANALYSIS {#module-analysis}

### 🎯 Responsabilité
Analyser les risques et permissions des applications.

### 📄 Fichiers
- `analysis.module.ts` - Module principal
- `risk-calculator.service.ts` - Calcul du score de risque (0-100)
- `permission-analyzer.service.ts` - Analyse détaillée des permissions
- `tracker-detector.service.ts` - Détection basée sur regex/heuristique
- `tracker-detection.types.ts` - Interfaces TypeScript

### 🔧 Services & Fonctions

#### 1️⃣ RiskCalculatorService

**Fonction utilisée ✅:**
- `calculateRiskScore(factors)` - **TRÈS UTILISÉE**
  - Prend: `permissions[]`, `trackers[]`, `isDebuggable`, `communityScore`, `hasUnknownTrackers`
  - Retourne: `{ score: 0-100, breakdown, alerts[] }`
  - **Logique**: 
    - Score initial = 100
    - Permissions dangereuses: -30 max (10 pts chaque, cap 30)
    - Trackers: -25 max (3 pts chaque, cap 25)
    - Debug: -20
    - Bonus communauté: +10 si score >= 4
    - Trackers inconnus: -10
    - Final: clamp [0, 100]
  - **Appelé par**: ScanService (3x), AppRegistryService (2x)

- `getRiskLevel(score)` - Mappe score → niveau
  - Retourne: `'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'`
  - **Utilisé par**: ScanService, AppRegistryService, Controllers

- `getRiskColor(score)` - Retourne couleur hex (UI)
  - **Utilisé par**: Rarement (surtout API)

**Fonctions NOT USED ❌:**
- Aucune - toutes les functions sont utilisées

**Évaluation**: ✅ **BON** - Score simple et efficace, bien implémenté

---

#### 2️⃣ PermissionAnalyzerService

**Fonction utilisée ✅:**
- `analyzePermissions(permissions, appCategory?)` - **JAMAIS APPELÉE**
  - Retourne: `{ totalScore, permissions[], summary, unjustifiedPermissions[] }`
  - Analyse chaque permission individuellement
  - Identifie permissions non justifiées par rapport à la catégorie
  - **PROBLÈME**: Pas intégrée dans le flux de calcul de risque

- `calculatePermissionRiskScore(permissions)` - **JAMAIS APPELÉE**
  - Calcule un score inversé basé sur les permissions
  - Redondant avec `RiskCalculatorService.calculateRiskScore`

- `getDangerousPermissions(permissions)` - **JAMAIS APPELÉE**
  - Filtre les permissions HIGH/CRITICAL

**Fonctions NOT USED ❌:**
- `private analyzePermission()` - Utilisée interne
- `private isPermissionJustified()` - Utilisée interne
- `private getJustification()` - Utilisée interne
- `private formatPermissionName()` - Utilisée interne

**VERDICT**: ⚠️ **CODE ORPHELIN** 
- Service très complet (40+ permissions documentées) mais **totalement déconnecté du flux de scan**
- Injection dans AnalysisModule mais **jamais injecté dans ScanService ou AppRegistryService**
- Potentiel énorme non exploité

---

#### 3️⃣ TrackerDetectorService

**Fonction utilisée ✅:**
- `detectTrackers(app: InstalledAppDto, trackers: Tracker[])` - **JAMAIS UTILISÉE**
  - Mappe les trackers en utilisant regex/heuristique sur le packageName
  - 4 strategies: regex sur company, package matching, websiteUrl, permission-based
  - **PROBLÈME MAJEUR**: La vraie détection vient de `ExodusService`, pas celle-ci

**VERDICT**: ⚠️ **ORPHELIN**
- Implémentation de fallback intéressante mais **jamais appelée**
- Remplacée par `ExodusService.getTrackers()` qui utilise une Map hardcoded

---

### ⚡ VERDICT MODULE ANALYSIS

| Service | Utilisé | État |
|---------|---------|------|
| RiskCalculatorService | ✅ OUI | ✅ BON |
| PermissionAnalyzerService | ❌ NON | ⚠️ CODE MORT |
| TrackerDetectorService | ❌ NON | ⚠️ CODE MORT |

**Score**: 33% (1/3 services utilisés)

---

## 🗂️ MODULE APP-REGISTRY {#module-app-registry}

### 🎯 Responsabilité
Gestion du registry des apps, trackers, permissions. Cache et refresh des données externes.

### 📄 Fichiers
- `app-registry.module.ts`
- `app-registry.service.ts` - Orchestration
- `tracker.service.ts` - Opérations Tracker DB
- `app.schema.ts` - Mongoose schema
- `tracker.schema.ts`
- `permission.schema.ts` (import, non utilisé)

### 🔧 Services & Fonctions

#### 1️⃣ AppRegistryService

**Fonction utilisée ✅:**
- `getOrCreateApp(packageName)` - **TRÈS UTILISÉE**
  - Retourne: App document ou crée si inexistant
  - **Logique**:
    1. Cherche en DB
    2. Si pas trouvée: `createAppEntry()` (appelle Exodus + PlayStore)
    3. Si trouvée + > 7j: `refreshAppData()` (re-fetch Exodus + PlayStore)
    4. Retourne app avec score calculé
  - **Appelé par**: ScanService (3x), AppRegistryController
  - **PROBLÈME**: Appelle `exodusService.analyzeApp()` (Exodus API HTTP) au lieu de `ExodusService` (local)

- `searchApps(query, limit)` - **UTILISÉE**
  - Recherche en DB avec text search + PlayStore fallback
  - Appelé par: ScanController (search endpoint, mais commenté)

- `updateAppScore(packageName, factors)` - **JAMAIS UTILISÉE**
  - Recalcule le score d'une app

**Fonctions NOT USED ❌:**
- `private createAppEntry()` - Utilisée interne seulement
- `private shouldRefresh()` - Utilisée interne
- `private refreshAppData()` - Utilisée interne

**PROBLÈME MAJEUR**: ⚠️
```typescript
// Line 21: AppRegistryService injecte ExodusPrivacyService (HTTP)
private exodusService: ExodusPrivacyService,

// Mais ScanService injecte ExodusService (local avec Map)
private exodusService: ExodusService,
```
**==> DEUX Exodus services différents, confusion!**

---

#### 2️⃣ TrackerService

**Fonction utilisée ✅:**
- `getAllTrackers()` - **UTILISÉE par ExodusService.onModuleInit()**
  - Retourne tous les trackers de MongoDB
  - Performant pour init

- `findTrackersByNames(trackerNames)` - **UTILISÉE par ExodusService**
  - Cherche les détails des trackers par noms
  - Appelé par `ExodusService.getTrackerDetails()`

- `findByCategory(category)` - **JAMAIS UTILISÉE**
- `upsertTracker()` - **JAMAIS UTILISÉE**
- `findByExodusId()` - **JAMAIS UTILISÉE**

**Fonctions NOT USED ❌:**
- `getStats()` - Appelée une fois au init pour logging

**VERDICT**: ✅ **BON** - Service léger, cache pour Exodus

---

### ⚡ VERDICT MODULE APP-REGISTRY

| Service | Utilisé | État |
|---------|---------|------|
| AppRegistryService | ✅ PARTIELLE | ⚠️ Double Exodus |
| TrackerService | ✅ OUI | ✅ BON |

**Score**: 66% - AppRegistry appelle le mauvais Exodus service!

---

## 🔗 MODULE EXTERNAL-APIS {#module-external-apis}

### 🎯 Responsabilité
Intégrations avec services externes: Exodus Privacy, MobSF, Google Play Store

### 📄 Fichiers
- `external-apis.module.ts`
- `exodus-privacy.service.ts` - **HTTP API calls** ⚠️
- `exodus.service.ts` - **Local + cached** ✅
- `mobsf.service.ts` - **HTTP API calls**
- `play-store.service.ts` - **Scraping**

### 🔧 Services & Fonctions

#### 1️⃣ ExodusPrivacyService (HTTP)

**Fonction utilisée ❌:**
- `getTrackers(packageName)` - **APPELÉE par AppRegistryService seulement**
  - HTTP GET: `https://reports.exodus-privacy.eu.org/api/search/{packageName}`
  - Retourne: `{ trackers: [{id, name}, ...] }`
  - **PROBLÈME**: Timeout 5s, rate-limited par Exodus, lent

- `getFullReport()` - **JAMAIS UTILISÉE**
- `getTrackerInfo()` - **JAMAIS UTILISÉE**
- `searchApp()` - **JAMAIS UTILISÉE**
- `getAppReport()` - **JAMAIS UTILISÉE**
- `analyzeApp()` - **APPELÉE par AppRegistryService**
  - Appelle `searchApp()` + `getAppReport()` → **REDUNDANT, ces deux ne sont pas utilisés ailleurs**

**VERDICT**: ⚠️ **CONFUSION + REDUNDANCE**

---

#### 2️⃣ ExodusService (Local)

**Fonction utilisée ✅:**
- `onModuleInit()` - **BON**
  - Charge les trackers au démarrage
  - Log stats

- `getTrackers(packageName)` - **TRÈS UTILISÉE** ✅
  - Retourne trackers via:
    1. Cache (7j TTL)
    2. Map hardcoded (23 apps)
    3. Heuristique (regex sur packageName)
    4. Fallback vide
  - **FAST et RELIABLE**

- `getTrackerDetails()` - **JAMAIS UTILISÉE**
  - Retourne détails des trackers depuis MongoDB

- `addPackageMapping()` - **UTILISÉE par ScanController**
  - Permet admin d'ajouter de nouveaux mappings

- `getStats()` - **UTILISÉE par ScanController**
  - Retourne stats du cache

**VERDICT**: ✅ **EXCELLENT**
- Priorise performance (cache, Map, heuristique)
- Pas de dépendance HTTP
- Parfaitement intégré au flux

---

#### 3️⃣ MobsfService

**Fonction utilisée ✅:**
- `uploadApk(filePath)` - **UTILISÉE par ScanService**
  - HTTP POST: `${MOBSF_URL}/api/v1/upload`
  - Envoie le fichier APK
  - Retourne: `{ hash, file_name }`

- `scanApk(hash)` - **UTILISÉE par ScanService**
  - HTTP POST: `${MOBSF_URL}/api/v1/scan`
  - Lance le scan MobSF

- `getReport(hash)` - **UTILISÉE par ScanService**
  - HTTP POST: `${MOBSF_URL}/api/v1/report_json`
  - Récupère le rapport JSON complet

**VERDICT**: ✅ **BON**
- API calls correctes
- Gestion des erreurs présente
- Bien utilisé par ScanService

**⚠️ PROBLÈME**: 
- `MOBSF_URL` et `MOBSF_API_KEY` doivent être en `.env`
- Pas de retry/timeout configuré
- Erreurs loggées mais pas propagées correctement au client

---

#### 4️⃣ PlayStoreService

**Fonction utilisée ✅:**
- `getAppDetails(packageName)` - **UTILISÉE**
  - Scrape Google Play Store
  - Retourne: `{ name, developer, category, iconUrl, description, rating, installs, version, updated }`
  - Appelé par: AppRegistryService

- `searchApp(query, limit)` - **UTILISÉE**
  - Scrape pour chercher apps
  - Appelé par: AppRegistryService

- `getPermissions(packageName)` - **JAMAIS UTILISÉE**
  - Scrape les permissions
  - **REDUNDANT**: Exodus fournit déjà les permissions

**Dépendance**: `google-play-scraper` npm

**VERDICT**: ⚠️ **FONCTIONNE MAIS FRAGILE**
- Scraping = vulnérable aux changements Google UI
- Permissions dupliquées avec Exodus
- Pas de rate-limiting visible

---

### ⚡ VERDICT MODULE EXTERNAL-APIS

| Service | Utilisé | État |
|---------|---------|------|
| ExodusPrivacyService (HTTP) | ⚠️ PARTIELLE | ⚠️ REDUNDANT |
| ExodusService (Local) | ✅ OUI | ✅ EXCELLENT |
| MobsfService | ✅ OUI | ✅ BON |
| PlayStoreService | ✅ PARTIELLE | ⚠️ FRAGILE |

**Score**: 60% - Confusion ExodusPrivacy vs Exodus

---

## 🔍 MODULE SCAN {#module-scan}

### 🎯 Responsabilité
Orchestration des scans: apps installées, APK upload, métadonnées. Agrégation des résultats.

### 📄 Fichiers
- `scan.controller.ts` - HTTP routes
- `scan.service.ts` - Logique de scan
- `scan.module.ts`
- DTOs: `installed-apps.dto.ts`, `metadata.dto.ts`, `create-scan.dto.ts`
- Schema: `scan.schema.ts`

### 🔧 Routes & Fonctions

#### 🎮 ScanController

**Routes UTILISÉES ✅:**
1. `POST /api/v1/scan/installed` → `analyzeInstalledApps()`
   - Reçoit DTO avec apps + userHash
   - Appelle ScanService

2. `POST /api/v1/scan/apk` → `scanApk()`
   - Upload + scan APK
   - FileInterceptor
   - Gestion temp files

3. `POST /api/v1/scan/metadata` → `analyzeMetadata()`
   - Analyse métadonnées directes

4. `POST /admin/add-package-mapping` → `ExodusService.addPackageMapping()`
   - Admin endpoint pour enrichir ExodusService Map

5. `GET /admin/exodus-stats` → `ExodusService.getStats()`
   - Retourne stats du cache Exodus

**Routes NOT USED ❌:**
- `GET /api/v1/scan/search` - **COMMENTÉE** (searchAppSecurity)
- `GET /api/v1/scan/app/:packageName` - **COMMENTÉE**
- `POST /api/v1/scan/compare` - **COMMENTÉE**
- `GET /api/v1/scan/history` - **PLACEHOLDER** (not implemented)

**PROBLÈME**: ⚠️ Trop d'endpoints commentés → confusion

---

#### 🏗️ ScanService

**Fonction utilisée ✅:**

1. `analyzeInstalledApps(userHash, apps[])` - **TRÈS UTILISÉE**
   - Mappe chaque app à `analyzeInstalledApp()`
   - Retourne:
     ```
     {
       scanId: crypto.randomUUID(),
       userHash,
       totalApps,
       results,
       summary: { totalTrackers }
     }
     ```
   - **PROBLÈME MAJEUR**: ⚠️ 
     - Génère UUID aléatoire au lieu de MongoDB `_id`
     - **N'ENREGISTRE PAS le scan en DB** ← Perte de données!
     - Pas de `scanModel.create()` comme pour APK et metadata

2. `private analyzeInstalledApp(appDto)` - **Utilisée interne**
   - Fusion des trackers (mobile + Exodus + DB) ✅ BONNE
   - Calcul du score via RiskCalculator
   - Sauvegarde app en DB
   - Retourne analyse
   - **BIEN IMPLÉMENTÉE**

3. `uploadApk(filePath)` - **UTILISÉE**
   - Appelle MobsfService (upload → scan → report)
   - Met à jour app dans AppRegistry
   - **SAUVEGARDE le scan en DB** ✅
   - Retourne: `{ scanId, packageName, report, analysis }`

4. `analyzeMetadata(meta)` - **UTILISÉE**
   - Calcul du score
   - **SAUVEGARDE le scan en DB** ✅
   - Retourne: `{ scanId, score, riskLevel, alerts, breakdown }`

5. `private generateSummary(results)` - **Utilisée interne**
   - Agrège les résultats
   - Compte les risques par niveau
   - Identifie les apps les plus dangereuses
   - **BON**

**Fonction NOT USED ❌:**
- `private findAlternatives()` - Jamais appelée (endpoint commenté)
- `private generateRecommendations()` - Jamais appelée
- `private getAppStats()` - Jamais appelée
- `private calculateAvgScore()` - Jamais appelée
- `private analyzeMobsfReport()` - Utilisée interne (uploadApk)

**VERDICT**: ⚠️ **PRESQUE BON MAIS CRITIQUE FLAW**
- ✅ Fusion de trackers bonne
- ✅ APK + metadata bien persistées
- ❌ **Batch scan JAMAIS persisté en DB** ← DATA LOSS!

---

### ⚡ VERDICT MODULE SCAN

| Composant | État |
|-----------|------|
| Controller | ⚠️ Endpoints commentés |
| Service logique | ✅ BON |
| Persistence | ❌ **Batch scan manquant** |
| Integration | ✅ BON |

**Score**: 60% - Critique: batch scans non sauvegardés

---

## 🔄 INTÉGRATION CROSS-MODULE {#intégration}

### Flow complet: `POST /api/v1/scan/installed`

```
Client Android
    ↓
POST {
  userHash: "abc123",
  apps: [
    { packageName: "com.facebook.katana", permissions: [...], trackers: [...] },
    { packageName: "com.instagram.android", ... }
  ]
}
    ↓
ScanController.scanInstalledApps(dto)
    ↓
ScanService.analyzeInstalledApps(userHash, apps)
    ├─ For each app:
    │  ├─ AppRegistry.getOrCreateApp(packageName)
    │  │  └─ [Appelle ExodusPrivacyService HTTP - LENT]  ⚠️
    │  ├─ ExodusService.getTrackers(packageName)
    │  │  ├─ Cache check [7j TTL]
    │  │  ├─ Map hardcoded [23 apps]
    │  │  ├─ Heuristique [regex]
    │  │  └─ Empty fallback
    │  ├─ FUSION: mobile + exodus + db trackers ✅
    │  ├─ RiskCalculator.calculateRiskScore()
    │  ├─ app.save() ✅
    │  └─ Return analysis
    │
    ├─ generateSummary(results)
    │
    └─ ❌ NO: scanModel.create()  ← DATA LOSS!
    
Return:
{
  scanId: "random-uuid",  ← NOT from DB!
  userHash,
  totalApps,
  results,
  summary
}
```

### Issues identifiés:

| # | Issue | Sévérité | Où |
|---|-------|----------|-----|
| 1 | Batch scan pas persisté en DB | 🔴 CRITIQUE | ScanService.analyzeInstalledApps |
| 2 | Deux Exodus services (HTTP vs local) | 🟡 MOYEN | AppRegistry + External-APIs |
| 3 | PermissionAnalyzerService orphelin | 🟡 MOYEN | Analysis |
| 4 | TrackerDetectorService orphelin | 🟡 MOYEN | Analysis |
| 5 | PlayStoreService scraping fragile | 🟡 MOYEN | External-APIs |
| 6 | Endpoints commentés (search, compare, app details) | 🟡 MOYEN | Scan Controller |
| 7 | /scan/history endpoint placeholder | 🟠 MINEUR | Scan Controller |
| 8 | Pas de retry sur MobSF/Exodus timeout | 🟠 MINEUR | External-APIs |
| 9 | UUID aléatoire au lieu de MongoDB `_id` | 🟡 MOYEN | ScanService |

---

## ❌ PROBLÈMES DÉTECTÉS EN DÉTAIL {#issues}

### 🔴 CRITIQUE #1: Batch Scan Pas Persisté en DB

**Localisation**: `src/scan/scan.service.ts`, ligne ~30

**Problème**:
```typescript
async analyzeInstalledApps(userHash: string, apps: InstalledAppDto[]) {
  // ... traiter les apps ...
  
  return {
    scanId: crypto.randomUUID(),  // ❌ UUID aléatoire
    userHash,
    totalApps: apps.length,
    results,
    summary: this.generateSummary(results),
  };
  // ❌ PAS DE: await this.scanModel.create({ ... })
}
```

**Impact**:
- Historique des scans batch perdus
- Pas de traçabilité pour l'utilisateur
- `scanId` invalide côté client

**Solution**: Ajouter avant le return:
```typescript
const scan = await this.scanModel.create({
  type: 'batch_installed',
  userHash,
  report: {
    totalApps: apps.length,
    results,
    summary: this.generateSummary(results),
  },
});

return {
  scanId: scan._id,  // ✅ ID réel MongoDB
  userHash,
  totalApps: apps.length,
  results,
  summary: this.generateSummary(results),
};
```

---

### 🟡 MOYEN #2: Double Exodus Service

**Localisation**: 
- `src/app-registry/app-registry.service.ts` → `ExodusPrivacyService` (HTTP)
- `src/scan/scan.service.ts` → `ExodusService` (Local)

**Problème**:
```typescript
// AppRegistryService injecte HTTP:
constructor(
  private exodusService: ExodusPrivacyService,  // HTTP calls
  ...
)

// ScanService injecte local:
constructor(
  private exodusService: ExodusService,  // Local + cached
  ...
)

// AppRegistry appelle:
await this.exodusService.analyzeApp(packageName);  // HTTP, lent

// Scan appelle:
await this.exodusService.getTrackers(packageName);  // Cache, rapide
```

**Impact**:
- `getOrCreateApp()` fait des appels HTTP à chaque fois (slow)
- `ExodusService` local jamais utilisé par AppRegistry
- Confusion dans le codebase

**Solution**:
- Remplacer `ExodusPrivacyService` par `ExodusService` dans AppRegistry
- Ou deprecate `ExodusPrivacyService` complètement (HTTP est slow)

---

### 🟡 MOYEN #3: PermissionAnalyzerService Orphelin

**Localisation**: `src/analysis/permission-analyzer.service.ts`

**Problème**:
- Exporté du module mais jamais injecté dans ScanService/AppRegistry
- Contient 40+ permissions documentées
- Détecte permissions non justifiées
- **JAMAIS UTILISÉ**

**Impact**:
- Code mort
- Potentiel énorme non utilisé
- Pourrait enrichir le score de risque

**Solution**:
- Intégrer dans `RiskCalculatorService.calculateRiskScore()`
- Ou injecter dans `ScanService` pour analyse détaillée

---

### 🟡 MOYEN #4: TrackerDetectorService Orphelin

**Localisation**: `src/analysis/tracker-detector.service.ts`

**Problème**:
- Implémente 4 strategies de détection (regex, package, URL, permissions)
- Jamais appelée
- `ExodusService` utilise hardcoded Map + heuristique simple à la place

**Impact**:
- Code mort
- Détection par permissions non utilisée (pourrait détecter plus)

---

### 🟡 MOYEN #5: PlayStore Scraping

**Localisation**: `src/external-apis/play-store.service.ts`

**Problème**:
- Dépend de `google-play-scraper` (scraping)
- Vulnérable aux changements Google UI
- Pas de rate-limiting visible
- **Redundant**: permissions déjà fournies par Exodus

**Impact**:
- Risk of breakage si Google change sa page
- Peut être rate-limited sans warning

**Solution**:
- Utiliser l'API officielle Google Play (si disponible)
- Ou retirer la méthode `getPermissions()`

---

### 🟡 MOYEN #6: Endpoints Commentés

**Localisation**: `src/scan/scan.controller.ts`

**Problème**:
```typescript
/* @Get('search') ... */
/* @Get('app/:packageName') ... */
/* @Post('compare') ... */
```

**Impact**:
- Confusion: endpoint existe ou pas?
- Code mort
- Utilisateurs ne savent pas quoi faire

**Solution**:
- Supprimer complètement si pas utilisé
- Ou activer et documenter

---

## ✅ RECOMMANDATIONS {#recommandations}

### 🎯 PRIORITÉ 1 (CRITIQUE) - À faire maintenant

#### 1.1 Fix: Batch Scan Persistence
```typescript
// scanService.analyzeInstalledApps():
const scan = await this.scanModel.create({
  type: 'batch_installed',
  userHash,
  report: { totalApps, results, summary },
});
return { scanId: scan._id, ... };
```

#### 1.2 Fix: Unify Exodus Service
- Remplacer `ExodusPrivacyService` (HTTP) par `ExodusService` (local) dans AppRegistry
- Ou deprecate l'HTTP complètement

```typescript
// app-registry.service.ts
constructor(
  private exodusService: ExodusService,  // Local + fast
  ...
)
```

---

### 🎯 PRIORITÉ 2 (HAUT) - Cette semaine

#### 2.1 Activate & Clean Dead Code
- Supprimer les endpoints commentés (search, compare, etc.)
- Ou implémenter proprement si utiles

#### 2.2 Integrate PermissionAnalyzerService
- Utiliser dans RiskCalculatorService
- Ajouter détection de permissions non justifiées au score

```typescript
// risk-calculator.service.ts
calculateRiskScore(factors: RiskFactors & { category?: string }) {
  // ... existing logic ...
  
  // Ajouter:
  const unjustified = this.permAnalyzer.getUnjustifiedPermissions(
    factors.permissions,
    factors.category
  );
  if (unjustified.length > 3) {
    score -= 10;
  }
}
```

#### 2.3 Add Timeout & Retry
```typescript
// mobsf.service.ts / exodus-privacy.service.ts
const client = axios.create({
  timeout: 30000,
  maxRetries: 2,  // Retry logic
});
```

---

### 🎯 PRIORITÉ 3 (MOYEN) - Next sprint

#### 3.1 Remove PlayStore Scraping (optional)
- Si permissions viennent d'Exodus, pas besoin de scraper
- Ou utiliser Play Store API officielle

#### 3.2 Implement /scan/history
```typescript
@Get('history')
async getScanHistory(
  @Query('userHash') userHash?: string,
  @Query('limit') limit = 20,
) {
  return this.scanModel
    .find({ userHash })
    .limit(limit)
    .sort({ createdAt: -1 });
}
```

#### 3.3 Add Scan Indexing
```typescript
// scan.schema.ts
ScanSchema.index({ userHash: 1, createdAt: -1 });
ScanSchema.index({ type: 1 });
```

---

### 📊 Summary Matrix

| Module | Complet | Utilisé | Code Mort | Notes |
|--------|---------|---------|-----------|-------|
| Analysis | ✅ | 33% | 66% | PermissionAnalyzer + TrackerDetector orphelins |
| App-Registry | ✅ | 85% | 15% | Double Exodus service |
| External-APIs | ✅ | 75% | 25% | Redundant PlayStore scraping |
| Scan | 60% | 90% | 10% | Batch persistence MISSING |

**Santé globale**: 6/10 ⚠️

---

## 📝 CONCLUSION

### Points Forts ✅
1. RiskCalculatorService simple et efficace
2. ExodusService (local) excellent design
3. Fusion de trackers bien implémentée
4. MobSF integration propre

### Points Faibles ❌
1. **Batch scans non persistés** (CRITICAL)
2. Double Exodus service (confusing)
3. 30% du code dead (PermissionAnalyzer, TrackerDetector)
4. Endpoints commentés (confusing)
5. PlayStore scraping fragile

### Prochaines Étapes
1. Fix batch persistence immédiatement
2. Unify Exodus services
3. Nettoyer le code mort
4. Ajouter tests unitaires
