<div align="center">

# 🐾 Neko Pulse
### *The All-in-One Crew Intelligence Platform*

![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)

> **Neko Pulse** is a full-stack, PWA-ready crew management platform built for outlet operations. It combines biometric facial recognition, QR-code attendance, AI-powered insights, shift scheduling, HR management, and real-time analytics — all inside a single installable mobile-first app.

</div>

---

## ✨ Feature Modules

### 📋 Attendance & Clock-In
Smart, multi-modal attendance tracking designed for the floor:
- **Face Recognition** — camera-based biometric clock-in powered by `face-api.js`, no pin required
- **QR Code Scanning** — scan-to-clock using `jsqr` for fast badge-based entry
- **Shift Validation** — attendance is cross-referenced against live shift schedules
- Real-time Firestore sync; admins see who's in and who's out live

### 📅 Shift Management
- Create, assign, and publish weekly shift schedules per outlet
- Conflict detection prevents double-booking
- Crew view shows personal upcoming shifts in a clean mobile layout

### 👥 Employee & HR Suite
- Full employee profiles: roles, contact info, outlet assignment, status
- HR module handles leave requests, appraisals, and disciplinary records
- End-of-Month (EOM) processing for payroll reconciliation

### 📈 Reports & Analytics
- Visual dashboards powered by **Recharts** — daily/weekly/monthly breakdowns
- Attendance rates, late clock-ins, hours worked, and overtime summaries
- Exportable data views for payroll and audit purposes

### 🤖 AI Insights (Gemini)
- Natural language query interface powered by **Google Gemini** (`@google/genai`)
- Ask the system: *"Who was late most this month?"* or *"Summarise Week 2 attendance"*
- AI-generated summaries and anomaly flags from operational data

### 🛍️ Orders & Store Operations
- Track outlet purchase orders and supplier deliveries
- Store module manages inventory-adjacent operational metadata
- Bluebook service provides centralised reference data

### 📋 Task & Meeting Management
- Assign tasks to crew members with due dates and status tracking
- Manager Meet module logs meeting notes and action items per outlet

### 🔒 Access Control
- Role-based access: **Admin**, **Manager**, **Crew**
- Module visibility and actions gate behind role checks
- Firestore security rules enforce server-side access control

---

## 📱 PWA — Installable on Any Device

Neko Pulse ships as a **Progressive Web App**:
- Installs directly to iOS and Android home screens (no app store needed)
- Standalone display mode — looks and feels like a native app
- Offline-capable via `sw.js` service worker
- Portrait-optimised layout for mobile floor use
- Theme colour: Emerald green (`#10b981`)

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19 + TypeScript | Component-driven SPA |
| **Build** | Vite 6 | Blazing-fast dev server and production build |
| **Backend / DB** | Firebase 12 (Firestore + Auth) | Real-time database and authentication |
| **AI** | @google/genai (Gemini) | Natural language queries and summaries |
| **Biometrics** | face-api.js | Camera-based facial recognition for attendance |
| **QR Scanning** | jsqr | QR code decode for badge clock-in |
| **Charts** | Recharts | Attendance and operations dashboards |
| **Date Utils** | date-fns | Shift and attendance date calculations |
| **Icons** | Lucide React | Consistent icon system |
| **PWA** | Web App Manifest + Service Worker | Installable, offline-capable app |
| **Deploy** | Vercel | Production hosting with SPA routing |

---

## 🏗 Architecture

```
Neko-Pulse-6.5/
├── modules/                   # Feature modules (one per domain)
│   ├── AttendanceModule.tsx   # Clock-in, face + QR recognition
│   ├── ShiftModule.tsx        # Shift scheduling
│   ├── EmployeeModule.tsx     # Employee profiles
│   ├── HRModule.tsx           # Leave, appraisals, discipline
│   ├── ReportsModule.tsx      # Analytics dashboards
│   ├── TaskModule.tsx         # Task assignment
│   ├── OrderModule.tsx        # Purchase orders
│   ├── StoreModule.tsx        # Store operations
│   ├── EOMModule.tsx          # End-of-month processing
│   ├── ManagerMeetModule.tsx  # Meeting notes
│   ├── AccessControl.tsx      # Role-based routing
│   ├── admin/                 # Admin-only views
│   └── crew/                  # Crew-facing views
├── services/                  # Firebase & API abstraction layer
│   ├── attendanceService.ts   # Clock-in logic
│   ├── faceService.ts         # face-api.js wrapper
│   ├── geminiService.ts       # Gemini AI integration
│   ├── shiftService.ts        # Shift CRUD
│   ├── employeeService.ts     # Employee CRUD
│   └── ... (15 services total)
├── components/                # Shared UI components
├── utils/                     # Helper functions
├── App.tsx                    # Root app shell and routing
├── types.ts                   # Shared TypeScript types
├── firebaseConfig.ts          # Firebase project configuration
├── firestore.rules            # Firestore security rules
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker
└── vercel.json                # Vercel SPA routing config
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with **Firestore** and **Authentication** enabled
- A Google AI Studio API key for Gemini features

### Installation

```bash
git clone https://github.com/dinoleix/Neko-Pulse-6.5.git
cd Neko-Pulse-6.5
npm install
```

### Environment Configuration

Create a `.env.local` file in the root:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Update `firebaseConfig.ts` with your Firebase project credentials.

### Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

---

## ☁️ Deployment

Neko Pulse deploys to **Vercel** with SPA routing configured via `vercel.json`. Connect the repository in your Vercel dashboard and add `VITE_GEMINI_API_KEY` as an environment variable. Firebase credentials are baked into `firebaseConfig.ts` at build time.

**Live deployment URL:** Available in repository Deployments tab.

---

## 🔐 Security

Firestore rules enforce role-based access at the database level. No crew member can read or write data outside their scope. Admin operations are restricted to verified admin UIDs only. See `firestore.rules` for the full policy.

---

## 🎨 Design

Neko Pulse uses a clean, **emerald-green** palette (`#10b981`) optimised for readability on mobile screens in busy outlet environments. The layout is portrait-first with large tap targets for staff wearing gloves or working at speed.

---

<div align="center">

**Built for the crew. Powered by AI. Always on.**

*🐾 Neko Pulse — React · Firebase · Gemini · face-api.js · PWA*

</div>
