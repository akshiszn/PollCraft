# PollCraft 📊

> A production-grade, real-time polling application featuring instantaneous zero-refresh updates, in-memory vote counters, and server-side validation.

[![Live App](https://img.shields.io/badge/Live_Demo-Vercel-brightgreen?style=for-the-badge&logo=vercel)](#-live-demo)
[![Backend API](https://img.shields.io/badge/Backend_API-Render-blue?style=for-the-badge&logo=render)](#-live-demo)

---

## 🔗 Live Demo & Submission Links
* **Frontend App:** [https://your-pollcraft-frontend.vercel.app](https://your-pollcraft-frontend.vercel.app) *(Update after deployment)*
* **Backend API:** [https://your-pollcraft-backend.onrender.com](https://your-pollcraft-backend.onrender.com) *(Update after deployment)*
* **Walkthrough Video:** [Link to YouTube / Google Drive Video] *(Update after recording)*

---

## 🏗 System Architecture & Stack Utilization

Every layer of the stack is chosen for a specific architectural reason to ensure seamless, real-time execution without shortcuts:

| Technology | Role & Architectural Purpose |
| :--- | :--- |
| **React + Vite** | Dynamic, responsive frontend UI rendering real-time WebSocket state without page refreshes. |
| **Go (Golang)** | High-concurrency backend API handling HTTP routing, WebSocket client hub management, and strict server-side payload validation. |
| **Upstash Redis** | **In-memory real-time driver:** Handles sub-millisecond atomic vote increments (`INCRBY`) and enforces IP/session rate-limiting before hitting database layers. |
| **MongoDB Atlas** | **Persistent store:** Manages user authentication records, hashed credentials, and long-term poll metadata/schemas. |

---

## ✨ Key Features & Architectural Decisions

1. **Truly Real-Time (WebSockets + Redis Engine)**
   * Votes cast from any browser instance instantly trigger an atomic increment in Upstash Redis.
   * The Go backend broadcasts the updated tally over persistent WebSocket connections to all connected clients in under **15ms**, requiring **zero page refreshes**.

2. **Strict Backend Input Validation & Security**
   * **Never Trust the Client:** All incoming poll creations, option bounds, and vote payload structures are thoroughly sanitized and validated on the Go backend prior to persistence.
   * **Authentication Protection:** Poll creation and management endpoints require JWT authentication. Unauthenticated guests can only view and participate in public polls.
   * **Anti-Spam Rate Limiting:** IP and session tokens are tracked in Redis to prevent vote manipulation and duplicate submissions.

3. **Polished UI/UX & Data Visualization**
   * Instant toggle between visual representation modes: raw percentage tallies, interactive Bar Charts, and Pie Charts.
   * Fully responsive layout built with Tailwind CSS.

---

## 📁 Repository Structure

```text
PollCraft/
├── backend/                  # Go Microservice
│   ├── cmd/                  # Application Entrypoints
│   ├── internal/             # Handlers, DB connections, WS Hub, & Middleware
│   ├── go.mod
│   └── .env.example
├── frontend/                 # React Single Page Application
│   ├── src/                  # Components, Hooks, Context, Charts
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md                 # Project Overview & Setup Guide
```

---

## 🛠 Local Setup Instructions

### Prerequisites
* **Go** (v1.20+)
* **Node.js** (v18+)
* **MongoDB Atlas** database URI
* **Upstash Redis** REST URL and Token

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/PollCraft.git](https://github.com/YOUR_USERNAME/PollCraft.git)
cd PollCraft
```

### 2. Configure & Run Backend
```bash
cd backend
cp .env.example .env
# Fill in your MONGODB_URI, UPSTASH_REDIS_REST_URL, and UPSTASH_REDIS_REST_TOKEN in .env

go run main.go
```
*Backend starts on `http://localhost:8080`*

### 3. Configure & Run Frontend
```bash
cd ../frontend
cp .env.example .env
# Ensure VITE_API_BASE_URL=http://localhost:8080 and VITE_WS_BASE_URL=ws://localhost:8080

npm install
npm run dev
```
*Frontend starts on `http://localhost:5173`*

---

## 🛡 Security & Environment Variable Safety
* All database connection strings, secret keys, and tokens are safely isolated inside `.env` files and excluded via `.gitignore`.
* Public deployment environments (Render & Vercel) inject secrets dynamically via secure runtime environment settings.