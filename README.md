# PollCraft 📊

> A real-time polling application featuring instantaneous zero-refresh updates, in-memory vote counters, and server-side validation.

🔗 Live App: [poll-craft-tan.vercel.app](https://poll-craft-tan.vercel.app)

---

## 🏗 System Architecture & Stack Utilization

<img width="2640" height="2426" alt="mermaid-diagram-2026-09-19-091924" src="https://github.com/user-attachments/assets/7edbe566-f911-4f7c-b06a-1a179b1f253c" />


Every layer of the stack is chosen for a specific architectural reason to ensure seamless, real-time execution without shortcuts:

| Technology | Role & Architectural Purpose |
| :--- | :--- |
| **React + Vite** | Dynamic, responsive frontend UI rendering real-time WebSocket state without page refreshes. |
| **Go (Gin)** | High-concurrency backend API handling HTTP routing, WebSocket client hub management, and strict server-side payload validation. |
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

go run main.go
```
*Backend starts on `http://localhost:8080`*

### 3. Configure & Run Frontend
```bash
cd ../frontend
cp .env.example .env

npm install
npm run dev
```
*Frontend starts on `http://localhost:5173`*

---

## 🛡 Security & Environment Variable Safety
* Public deployment environments (Render & Vercel) inject secrets dynamically via secure runtime environment settings.
