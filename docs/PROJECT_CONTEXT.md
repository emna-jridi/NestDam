# NestDam - Project Context

## Overview

**NestDam** (also known as **dam2.0**) is a comprehensive **mobile app privacy and security analysis platform** built with NestJS. It provides backend services for analyzing Android and iOS applications, detecting privacy risks, tracking user devices, generating security reports, and delivering personalized privacy tips.

## Project Purpose

The platform enables users to:
- **Scan installed apps** on Android and iOS devices for privacy and security risks
- **Analyze app permissions** and identify dangerous permission usage
- **Detect tracking libraries** and privacy-invasive behaviors
- **Track devices** and manage alerts across multiple devices
- **Receive personalized privacy tips** powered by AI (Google Gemini)
- **Generate security reports** with actionable recommendations
- **Search and discover** app security information
- **Monitor data breaches** through leak checking

## Technology Stack

### Core Framework
- **NestJS 11.x** - Progressive Node.js framework
- **TypeScript** - Type-safe development
- **MongoDB** (Mongoose) - Primary database
- **Redis** - Caching layer
- **JWT** - Authentication & authorization

### Key Libraries
- **@google/generative-ai** - AI-powered privacy tips generation
- **Firebase Admin SDK** - Push notifications
- **Axios** - HTTP client for external APIs
- **Swagger/OpenAPI** - API documentation
- **class-validator/class-transformer** - DTO validation
- **bcrypt** - Password hashing
- **SendGrid/Nodemailer** - Email services

### External Integrations
- **ETIP API** - Tracker detection database
- **MobSF** - Mobile Security Framework for APK analysis
- **Google Play Store API** - App metadata and permissions
- **Exodus Privacy** - Privacy tracker database

## Architecture

### Module Structure

```
src/
├── alerts/              # Alert management & push notifications
├── analysis/            # Risk calculation & permission analysis
├── app-registry/        # App database & metadata management
├── auth/                # JWT authentication & authorization
├── devices/             # Device registration & management
├── external-apis/       # External service integrations
├── leakcheck/           # Data breach monitoring
├── privacy-tips/        # AI-generated privacy recommendations
├── redis/               # Caching service
├── report/              # Security report generation
├── scan/                # App scanning & analysis
├── search/              # Global search functionality
├── user-management/     # User CRUD operations
└── shared/              # Shared utilities (mail, logger)
```

## Core Features

### 1. App Scanning (`scan/`)
- **Android App Scanning**: Analyze installed apps from Android devices
- **iOS App Scanning**: Analyze apps from iOS screenshots
- **APK Upload**: Direct APK file analysis via MobSF
- **Metadata Analysis**: Analyze app metadata without full scan
- **Scan History**: Track scan history with trends and pagination
- **Scan Comparison**: Compare two scans to identify changes
- **Statistics**: User scan statistics and analytics

**Key Endpoints:**
- `POST /api/scan/installed` - Scan installed Android apps
- `POST /api/scan/ios` - Scan iOS apps
- `POST /api/scan/apk` - Upload and scan APK file
- `GET /api/scan/history` - Get scan history with trends
- `GET /api/scan/:scanId` - Get specific scan details
- `POST /api/scan/compare` - Compare two scans
- `GET /api/scan/stats/:userHash` - Get user statistics

### 2. App Registry (`app-registry/`)
- **App Database**: Centralized database of analyzed apps
- **App Search**: Search apps by name, package, or developer
- **App Details**: Retrieve comprehensive app security information
- **Top Apps**: Get lists of safest/most dangerous apps
- **Statistics**: App registry statistics

**Key Endpoints:**
- `GET /api/app-registry/search` - Search apps
- `GET /api/app-registry/app/:packageName` - Get app details
- `GET /api/app-registry/top/safe` - Get top safe apps
- `GET /api/app-registry/top/dangerous` - Get top dangerous apps
- `GET /api/app-registry/stats` - Get registry statistics

### 3. Analysis (`analysis/`)
- **Risk Calculation**: Calculate privacy risk scores for apps
- **Permission Analysis**: Analyze dangerous permissions
- **Tracker Detection**: Detect privacy-invasive trackers
- **Permission Analytics**: Permission usage analytics and statistics

**Key Endpoints:**
- `GET /api/permissions/analytics` - Get permission analytics

### 4. Alerts (`alerts/`)
- **Alert Creation**: Create security alerts for users
- **Device Integration**: Link alerts to specific devices
- **Push Notifications**: Send Firebase push notifications
- **Alert Management**: Retrieve and filter alerts by device/user

**Key Endpoints:**
- `POST /api/alerts` - Create new alert
- `GET /api/alerts` - Get user alerts (optionally filtered by device)
- `GET /api/alerts/device/:deviceId` - Get alerts for specific device
- `GET /api/alerts/devices` - Get all devices with alerts

### 5. Privacy Tips (`privacy-tips/`)
- **AI-Generated Tips**: Personalized privacy tips using Google Gemini
- **Daily Tips**: Curated daily privacy tips
- **Tip Categories**: Tips organized by category
- **User Interactions**: Track user interactions with tips
- **Caching**: Redis caching for performance

**Key Endpoints:**
- `GET /api/privacy-tips` - Get privacy tips (with filters)
- `GET /api/privacy-tips/personalized` - Get AI-generated personalized tips
- `GET /api/privacy-tips/daily` - Get daily tip
- `GET /api/privacy-tips/:id` - Get specific tip

### 6. Device Management (`devices/`)
- **Device Registration**: Register Android/iOS devices
- **Device Status**: Track device status and last seen
- **Device Scans**: Associate scans with devices
- **Multi-Device Support**: Manage multiple devices per user

**Key Endpoints:**
- `POST /api/devices/register` - Register new device
- `GET /api/devices` - Get user's devices
- `GET /api/devices/:deviceId` - Get device details
- `GET /api/devices/:deviceId/status` - Get device status

### 7. Search (`search/`)
- **Global Search**: Search across apps, alerts, and privacy tips
- **Filtered Search**: Filter by content type (apps, alerts, tips)
- **Pagination**: Paginated search results

**Key Endpoints:**
- `GET /api/search` - Global search across all content types

### 8. Reports (`report/`)
- **Security Reports**: Generate comprehensive security reports
- **PDF Generation**: Export reports in various formats
- **Device-Specific Reports**: Generate reports for specific devices

**Key Endpoints:**
- `POST /api/reports/generate` - Generate security report

### 9. Leak Check (`leakcheck/`)
- **Data Breach Monitoring**: Check for data breaches
- **Email/Phone Checking**: Verify if credentials were leaked
- **Breach Details**: Get detailed breach information

**Key Endpoints:**
- `POST /api/leakcheck/check` - Check for data leaks

### 10. Authentication (`auth/`)
- **JWT Authentication**: Secure token-based authentication
- **User Registration**: User account creation
- **Password Reset**: Forgot password flow with OTP
- **Role-Based Access**: Role-based authorization (admin, user)

**Key Endpoints:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with OTP
- `POST /api/auth/refresh` - Refresh JWT token

## Data Models

### Core Schemas

**User** (`user-management/entities/user.entity.ts`)
- User accounts with email, password, roles
- Profile information and preferences

**Device** (`devices/schemas/device.schema.ts`)
- Device registration with platform (Android/iOS)
- Device identifiers, status, last seen timestamp

**Scan** (`scan/schemas/scan.schema.ts`)
- Scan records with app results
- User hash, scan type, summary, timestamps

**App** (`app-registry/schemas/app.schema.ts`)
- App metadata, permissions, trackers
- Privacy score, risk level, community data

**Alert** (`alerts/alert.schema.ts`)
- Security alerts with severity levels
- Device association, push notification status

**PrivacyTip** (`privacy-tips/schemas/privacy-tip.schema.ts`)
- Privacy tips with categories and content
- AI-generated personalized tips cache

## Security Features

1. **JWT Authentication**: Secure token-based auth
2. **Password Hashing**: bcrypt for password security
3. **Input Validation**: class-validator for DTO validation
4. **CORS**: Configurable CORS for API access
5. **Rate Limiting**: Throttler for API protection
6. **Helmet**: Security headers middleware
7. **Role-Based Access**: Guards for authorization

## API Documentation

- **Swagger UI**: Available at `/api` endpoint
- **OpenAPI 3.0**: Full API specification
- **Bearer Token Auth**: JWT token authentication in Swagger

## Environment Variables

Key environment variables required:
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `REDIS_HOST` - Redis server host
- `REDIS_PORT` - Redis server port
- `ETIP_BASE_URL` - ETIP API base URL (default: http://localhost:8000)
- `GOOGLE_GEMINI_API_KEY` - Google Gemini API key for AI tips
- `FIREBASE_PROJECT_ID` - Firebase project ID for push notifications
- `FIREBASE_PRIVATE_KEY` - Firebase private key
- `FIREBASE_CLIENT_EMAIL` - Firebase client email
- `SENDGRID_API_KEY` - SendGrid API key for emails
- `PORT` - Server port (default: 3000)

## Development Workflow

### Running the Application
```bash
# Install dependencies
npm install

# Development mode with watch
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### Database Seeding
```bash
# Seed admin user
npm run seed:admin

# Seed privacy tips
npm run seed:privacy-tips
```

### Testing
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## Recent Implementations

### Completed Features (P0)
1. ✅ **Scan History API** - `GET /api/scan/history` with trends and pagination
2. ✅ **Permission Analytics API** - `GET /api/permissions/analytics`
3. ✅ **Global Search API** - `GET /api/search` across apps, alerts, tips

### Pending Features (P1-P2)
1. ⏳ **Threat Detection API** - `POST /api/threats/detect`
2. ⏳ **Network Security API** - `POST /api/network/analyze`
3. ⏳ **Extended Report Generation** - Enhanced report features
4. ⏳ **App List Management** - Multiple endpoints for app lists
5. ⏳ **URL Reputation API** - `POST /api/url/check`

## Integration Points

### Mobile Clients
- **Android Client**: Located in `android/` directory
- **iOS Client**: API supports iOS app scanning via screenshots
- **Device Registration**: Both platforms can register devices
- **Push Notifications**: Firebase integration for real-time alerts

### External Services
- **ETIP Service**: Tracker database (runs on port 8000)
- **MobSF**: APK analysis service
- **Google Play Store**: App metadata scraping
- **Exodus Privacy**: Privacy tracker database

## Error Handling

- **Graceful Degradation**: Services continue working if external APIs fail
- **Caching**: Stale data returned when APIs unavailable
- **Detailed Logging**: Comprehensive error logging with context
- **User-Friendly Errors**: Clear error messages for API consumers

## Performance Optimizations

- **Redis Caching**: Cached tracker data, privacy tips
- **Database Indexing**: Optimized queries with proper indexes
- **Pagination**: All list endpoints support pagination
- **Lazy Loading**: Efficient data loading strategies

## Known Issues & Considerations

1. **ETIP Service**: Requires separate service running on port 8000
2. **Google Gemini API**: Model availability may vary (fallback implemented)
3. **MobSF Integration**: Requires MobSF instance for APK analysis
4. **Firebase Setup**: Requires Firebase project configuration for push notifications

## Project Status

**Active Development** - The project is actively being developed with new features and improvements. The core scanning, analysis, and alerting features are production-ready, with additional analytics and reporting features being added.

---

**Last Updated**: December 2025
**Version**: 0.0.1
**Framework**: NestJS 11.x
**Database**: MongoDB
**Cache**: Redis


