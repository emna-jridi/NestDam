# iOS Frontend Development Roadmap for ShadowGuard

## 📱 Project: ShadowGuard iOS App
**Backend**: NestJS (DAM 2.0)  
**Purpose**: Privacy & security scanning for iOS apps with permission analysis  
**Apple Restrictions**: Cannot directly access installed apps like Android can (no direct enumeration of third-party apps)

---

## ⚠️ Apple Restrictions & iOS Limitations

### What Apple DOESN'T Allow:
- ❌ Direct enumeration of installed third-party apps (no equivalent to Android's `pm list packages`)
- ❌ Reading arbitrary app permissions (system-level permission info is restricted)
- ❌ Access to app metadata beyond the current app and Apple's native framework data
- ❌ URL schemes to query other apps (limited and unreliable)

### What Apple ALLOWS:
- ✅ User input / manual app entry
- ✅ Screenshots for manual inspection
- ✅ Sending screenshots to backend for analysis
- ✅ Comparing against database of known apps
- ✅ Storing scan history locally
- ✅ Display app privacy labels (from App Store data)

---

## 🎯 iOS Frontend Architecture

### Pages (Screens) to Build

#### 1. **Authentication Flow** (Required)
- **Login Screen**
  - Email/Password fields
  - "Forgot Password" link
  - "Sign Up" link
  - Google Sign-In button
  - Remember me checkbox

- **Register Screen**
  - Email field
  - Password field
  - Confirm password field
  - Terms & conditions checkbox
  - "Login" navigation

- **OTP Verification Screen**
  - OTP input fields (6-digit code)
  - "Resend OTP" button
  - Email address displayed

- **Password Reset Flow**
  - Forgot Password Screen (email input)
  - Reset Code Verification Screen
  - New Password Screen

- **Profile Setup Screen** (Post-signup)
  - Avatar selection/generation
  - Username
  - Bio (optional)

---

#### 2. **Home/Dashboard Screen** (Main hub)
- **Top Section**
  - User profile avatar + name + greeting
  - Last scan date/time
  - Overall privacy score (0-100)
  
- **Quick Stats Cards**
  - Total scans performed
  - Apps scanned
  - Dangerous permissions found
  - High-risk trackers detected

- **Quick Action Buttons**
  - "Start New Scan"
  - "View Scan History"
  - "Compare Scans"

- **Recent Scans Widget**
  - List of last 3-5 scans
  - App name, date, risk level
  - Tap to view details

---

#### 3. **App Scanner Screen** (Main feature)
**Note: Requires manual app entry due to iOS limitations**

- **Input Methods**
  - Manual App Name Search
    - Search bar with autocomplete
    - Suggestions from backend database
    - "Add" button to add to scan list
  
  - Screenshot Upload (Alternative)
    - Camera icon to capture screenshot
    - Photo library picker
    - Image cropping/editing
    - "Analyze Screenshot" button
  
  - QR Code Scanner (Optional)
    - Scan app QR codes
    - Auto-extract app info

- **Scan List**
  - Selected apps with remove option
  - App icon, name, package (if available)
  - "Start Scan" button (disabled until at least 1 app selected)

- **Scan Results Display**
  - Loading indicator with progress
  - Results card for each app:
    - App icon & name
    - Privacy score (0-100) with color indicator
    - Tracker count
    - Dangerous permissions count
    - Expand button for details

---

#### 4. **Detailed App Analysis Screen**
- **App Header**
  - Large app icon
  - App name & developer
  - App category
  - Rating (from Play Store data if available)

- **Overall Score**
  - Large circular progress indicator (0-100)
  - Score explanation text

- **Permissions Section**
  - "Normal Permissions" tab
  - "Dangerous Permissions" tab
  - Permission name + risk level
  - Description on tap

- **Trackers Section**
  - List of detected trackers
  - Tracker name & category
  - "Known tracker" badge
  - Tap for more info

- **Privacy Issues**
  - Summary of key concerns
  - Risk indicators

- **Action Buttons**
  - "View Full Report"
  - "Compare with Similar App"
  - "Share Report"

---

#### 5. **Scan History Screen**
- **Filter Options**
  - Date range picker
  - Sort by: Date, Score, App Name
  - Risk level filter (All, High, Medium, Low, Safe)

- **Scan List**
  - Date header grouping (Today, Yesterday, This week, etc.)
  - Each scan card shows:
    - Scan date/time
    - Number of apps scanned
    - Overall score
    - Risk level badge
    - Tap to expand or view details

- **Scan Card Details** (On expansion)
  - List of apps in that scan
  - Individual app scores
  - Quick view button

- **Actions**
  - "Delete" button (with confirmation)
  - "Export" button (PDF/CSV)
  - "Share" button

---

#### 6. **Compare Scans Screen**
- **Scan Selection**
  - Dropdown 1: Select first scan
  - Dropdown 2: Select second scan
  - "Compare" button

- **Comparison View**
  - Side-by-side comparison
  - Scan 1 | Scan 2
  - Date, total apps, overall score
  - Differences highlighted

- **Apps Comparison Table**
  - App name
  - Scan 1 score
  - Scan 2 score
  - Change indicator (↑↓)
  - Sorting options

- **Summary**
  - Improved/Declined apps count
  - New trackers detected
  - New dangerous permissions

---

#### 7. **User Profile Screen**
- **Profile Information**
  - Avatar (with option to change)
  - Username/Email
  - Member since date
  - Total stats

- **Editable Fields**
  - Username
  - Bio/Description
  - Phone number (optional)

- **Privacy Settings**
  - Data sharing preferences
  - Notifications toggle
  - Location tracking (if used)

- **Account Management**
  - Change Password
  - Two-Factor Authentication
  - Linked Accounts (Google)

- **App Settings**
  - Dark/Light mode
  - Language selection
  - Notification preferences
  - Cache/Storage management

- **Actions**
  - "Save Changes" button
  - "Logout" button
  - "Delete Account" button (with confirmation)

---

#### 8. **Settings Screen**
- **App Preferences**
  - Theme (Light/Dark/Auto)
  - Language
  - Font size

- **Privacy & Security**
  - Biometric unlock
  - Auto-lock timer
  - Clear cache on exit

- **Notifications**
  - Enable/disable notifications
  - Push notification settings
  - Email preferences

- **Data Management**
  - Clear app data
  - Export scan history
  - Backup settings

- **About**
  - App version
  - Build number
  - Terms & Conditions
  - Privacy Policy
  - Contact Support

---

#### 9. **About/Info Screen**
- App description
- Features list
- App version & build
- License information
- Changelog
- Credits

---

#### 10. **Support/Help Screen**
- FAQ section
- Contact form
- Report a bug button
- Feature request form
- Knowledge base links

---

## 🔌 Backend Endpoints to Call

### **Authentication Endpoints** (No JWT required)

```
POST   /auth/register
       Body: { email, password, username }
       Returns: { accessToken, refreshToken, user }

POST   /auth/login
       Body: { email, password }
       Returns: { accessToken, refreshToken, user }

POST   /auth/refresh
       Body: { refreshToken }
       Returns: { accessToken }

POST   /auth/request-password-reset
       Body: { email }
       Returns: { message, success }

POST   /auth/verify-reset-code
       Body: { email, resetCode }
       Returns: { message, success }

POST   /auth/reset-password
       Body: { email, resetCode, newPassword }
       Returns: { message, success }

POST   /auth/verify-otp
       Body: { email, otp }
       Returns: { message, success, user }

POST   /auth/resend-otp
       Body: { email }
       Returns: { message, success }

POST   /auth/google
       Body: { idToken }
       Returns: { accessToken, refreshToken, user }

POST   /auth/verify-email
       Body: { email, otp }
       Returns: { message, success }
```

### **User Endpoints** (JWT Required)

```
GET    /users/profile
       Returns: { user profile data }

PATCH  /users/me
       Body: { username, bio, phone, ... }
       Returns: { updated user data }
```

### **Avatar Endpoints** (JWT Required)

```
POST   /api/v1/avatar
       Body: { userHash, avatarStyle, topType, hairColor, ... }
       Returns: { avatar config, URL, fileName }

GET    /api/v1/avatar/:userHash
       Returns: { avatar data }

PUT    /api/v1/avatar/:userHash
       Body: { partial avatar config }
       Returns: { updated avatar }

POST   /api/v1/avatar/random/:userHash
       Returns: { random avatar }

POST   /api/v1/avatar/consistent/:userHash
       Returns: { deterministic avatar }

DELETE /api/v1/avatar/:userHash
       Returns: { success }
```

### **App Registry Endpoints** (No JWT required)

```
GET    /api/v1/apps/search?query=:appName&limit=20
       Returns: { query, count, results: [apps] }

GET    /api/v1/apps/:packageName
       Returns: { app data }

GET    /api/v1/apps/top/safe?limit=10
       Returns: { safe apps list }

GET    /api/v1/apps/top/dangerous?limit=10
       Returns: { dangerous apps list }
```

### **Scan Endpoints** (JWT Required)

```
POST   /api/v1/scan/ios
       Body: { userHash, apps: [{ name, icon?, info? }] }
       Returns: { scan ID, results: [app analyses] }

POST   /api/v1/scan/installed
       Body: { userHash, apps: [app data] }
       Returns: { scan results }

GET    /api/v1/scan/search?query=:appName
       Returns: { query, count, results }

GET    /api/v1/scan/app/:packageName
       Returns: { app security data }

GET    /api/v1/scan/:scanId
       Returns: { detailed scan data }

GET    /api/v1/scan/latest/:userHash
       Returns: { latest scan }

GET    /api/v1/scan/user/:userHash?limit=20&skip=0
       Returns: { scans: [history] }

DELETE /api/v1/scan/:scanId
       Body: { userHash }
       Returns: { success }

POST   /api/v1/scan/compare
       Body: { scanId1, scanId2 }
       Header: { x-user-hash }
       Returns: { comparison data }

GET    /api/v1/scan/stats/:userHash
       Returns: { statistics }
```

---

## 📊 Data Models for iOS App

### Authentication State
```swift
struct AuthState {
    var accessToken: String?
    var refreshToken: String?
    var user: User?
    var isAuthenticated: Bool
}

struct User {
    var id: String
    var email: String
    var username: String
    var avatar: Avatar?
    var role: String
    var createdAt: Date
}
```

### Scan Model
```swift
struct Scan {
    var id: String
    var userHash: String
    var apps: [AppAnalysis]
    var createdAt: Date
    var totalScore: Double
}

struct AppAnalysis {
    var packageName: String?
    var name: String
    var icon: URL?
    var privacyScore: Double
    var trackers: [Tracker]
    var permissions: Permissions
}

struct Tracker {
    var name: String
    var category: String
    var severity: String // low, medium, high, critical
}

struct Permissions {
    var normal: [Permission]
    var dangerous: [Permission]
}

struct Permission {
    var name: String
    var description: String
    var riskLevel: String
}
```

### Avatar Model
```swift
struct Avatar {
    var userHash: String
    var config: AvatarConfig
    var url: URL
    var fileName: String
    var createdAt: Date
}

struct AvatarConfig {
    var avatarStyle: String
    var topType: String
    var hairColor: String
    var clotheType: String
    var clotheColor: String
    var skinColor: String
    var eyeType: String
    var mouthType: String
}
```

---

## 🛠️ Tech Stack Recommendation for iOS

- **UI Framework**: SwiftUI (modern) or UIKit (traditional)
- **Networking**: URLSession or Alamofire
- **State Management**: Combine or MVVM
- **Local Storage**: CoreData or Realm
- **Authentication**: Secure Enclave for tokens
- **UI Components**: SwiftUI Components or CocoaPods libraries

---

## 📋 Priority Implementation Order

### Phase 1: Core Authentication & Setup (Week 1-2)
- [ ] Login/Register screens
- [ ] OTP verification
- [ ] Token storage & refresh
- [ ] Profile setup with avatar
- [ ] Logout functionality

### Phase 2: Main Scan Feature (Week 3-4)
- [ ] App search/autocomplete
- [ ] Manual app entry
- [ ] Scan execution
- [ ] Results display
- [ ] Detailed app analysis view

### Phase 3: History & Comparison (Week 5)
- [ ] Scan history screen
- [ ] Compare two scans
- [ ] Export/Share functionality

### Phase 4: User Features (Week 6)
- [ ] Profile management
- [ ] Settings screen
- [ ] Notifications
- [ ] Dark mode support

### Phase 5: Polish & Release (Week 7-8)
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] App Store review preparation
- [ ] TestFlight beta testing

---

## 🔐 Security Considerations for iOS

1. **Token Storage**
   - Store JWT tokens in Keychain (not UserDefaults)
   - Implement token refresh before expiration

2. **SSL Pinning**
   - Implement SSL certificate pinning for API calls

3. **Biometric Authentication**
   - Optional Face ID / Touch ID for app unlock

4. **Data Encryption**
   - Encrypt sensitive data locally

5. **Privacy**
   - Request app tracking transparency (ATT)
   - Handle privacy manifests for App Store

---

## 📝 Notes

- **iOS Limitation**: You cannot directly scan installed apps like on Android. The iOS app will require **manual app selection** or **screenshot analysis** as alternatives.
- **Screenshot Analysis**: Users can take screenshots of their Settings > Apps or App Store to manually select apps for analysis.
- **App Store Compliance**: Ensure privacy labels are correct and no private APIs are used.
- **Sync**: Consider implementing local caching of scan history for offline access.

---

## 📞 Questions to Clarify Before Starting

1. Do you want to support **screenshot analysis** for iOS apps?
2. Should users be able to **save app preferences** for quick re-scanning?
3. Do you need **real-time notifications** for privacy concerns?
4. Should the app work **offline** with cached data?
5. Do you want **PDF export** of scan reports?
