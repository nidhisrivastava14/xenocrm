# Xeno Mini CRM — AI-Native Multi-Channel Campaign Studio

Xeno Mini CRM is an enterprise-grade, data-first campaign orchestration platform designed for modern marketers. By combining generative AI, real-time WebSocket communication, and robust database transaction safety, it enables automated customer segmentation, multi-channel messaging (SMS, WhatsApp, Email, RCS), and hardened order revenue attribution.

---

## ✨ Features

### 🤖 1. AI-Native Segment & Message Drafts (Gemini API)

- Marketers describe target audiences in plain English (e.g., _"customers who haven't bought in 30 days"_).
- The backend leverages the **Gemini 2.0 Flash** model to parse user intent into structured RFM (Recency, Frequency, Monetary) SQL queries.
- AI drafts channel-appropriate message variants tailored to **Urgent**, **Value**, and **Personal** communication tones.

### 🔌 2. Real-Time Campaign Dashboard (Socket.io)

- Broadcasts campaign delivery dispatches and customer read/click interactions in real time.
- Features responsive metrics, delivery funnel tracking, and a live activity feed.
- Clean visual redesign (Intercom/Mixpanel aesthetics) with dark/light mode, custom scrollbars, and Lucide icons.

### 📱 3. Multi-Channel Support & Fallback Routing

- Orchestrates message delivery over **SMS**, **WhatsApp**, **Email**, and **RCS**.
- **Smart Fallbacks**: Automatically falls back to secondary channels if contact fields are missing (e.g., drops down from WhatsApp to Email if a phone number is unavailable).
- Enforces custom channel formatting (e.g., auto-stripping emojis for SMS, bolding discount codes for WhatsApp).

### 🛒 4. Hardened Order Attribution System (Last-Touch, 48hr Window)

- Traces customer purchases back to campaigns using a strict **last-touch, 48-hour window** model.
- **Atomic Transactions & Savepoints**: Combines customer lookup, campaign attribution, and order inserts in a single PostgreSQL transaction. Leverages `SAVEPOINT` so that any lookup failure falls back gracefully to an `organic` sale without blocking the order insert.
- **Early-Return Idempotency**: Client-provided idempotency keys check for duplicates first thing, preventing duplicate entries and conserving database locks.
- **Divide-by-Zero Guards**: Built-in math safety guards on campaigns stats (`avg_order_value`, `revenue_per_message`, `conversion_rate`) returning clean zeros instead of crashing the dashboard.
- **UUID & Input Validations**: Rejects invalid date formats, future dates, negative prices, and invalid UUID shapes early.

---

## 🏗️ Project Architecture

```mermaid
graph TD
    subgraph Frontend [React Client - Vite]
        UI[CampaignDashboard / ChatInterface] -->|HTTP / WebSocket| Server
    end

    subgraph Backend [Express API Server]
        Server[src/index.js] --> Chat[routes/chat.js]
        Server --> Orders[routes/orders.js]
        Server --> Campaigns[routes/campaigns.js]
        Server --> Webhooks[routes/webhooks.js]

        Chat -->|Gemini API| Gemini[Gemini SDK]
        Campaigns -->|Dispatches| ChannelService[channel-service]
        Orders -->|Attribution Logic| Attr[services/attributionService.js]
        Webhooks -->|Callbacks| WebhookSvc[services/webhookService.js]
    end

    subgraph Database [PostgreSQL - Supabase]
        Attr -->|Row Locks & Insert| Postgres[(Postgres DB)]
        WebhookSvc -->|Recalculate Counters| Postgres
    end
```

---

## 🛠️ Recent Upgrades & Hardening

### 🎨 Frontend visual & Functional Upgrades

- **SaaS Design Language**: Replaced all emojis with professional SVG icons using `lucide-react`. Transitioned to a clean, data-first theme using dark slate (`#0F172A`/`#1E293B`) and professional blue (`#3B82F6`) accents.
- **Draft Termination (Cancel Campaign)**: Added a "Cancel Campaign" button on the **Segment Preview** and **Message Draft** steps. Users can immediately reset the flow to start over with a new prompt if they made a mistake (e.g., entered the wrong audience criteria), without having to generate all messages first.
- **Scrollbar & Layout Polish**:
  - Set a default minimum height on preview containers so scrollbars trigger correctly.
  - Added `overscroll-behavior: contain` to prevent mouse scrolls from leaking out and scrolling the main page layout.
  - Widened the scrollbar grip to `10px` for smooth, responsive scrolling.
- **Attributed Orders Highlight**: Displays attributed campaign sales inside the real-time activity feed with a green highlight and shopping cart indicators.
- **Organic Revenue Section**: Added an "Organic Revenue" panel to the dashboard to contextualize campaign sales against total platform revenue.

### 🛡️ Backend Reliability & Concurrency Hardening

- **Transaction Savepoints**: Wrapped attribution checks in a SQL `SAVEPOINT` so that any database-level attribution exceptions (such as locked tables or query issues) roll back cleanly to allow the sale to persist as an `organic` purchase, rather than rejecting the order.
- **Idempotency Keys**: Placed the idempotency verification step at the absolute beginning of the route handler. Duplicate orders return immediately, saving database customer validation and row lock resources.
- **UUID Formatting Guard**: Standardized client customer input validations using regular expressions for UUID shapes to avoid sending invalid UUID syntax queries to the database.
- **Row-Level Locking**: Utilized `SELECT ... FOR SHARE` on customer checks and `SELECT ... FOR UPDATE` on message attribution checks to secure resource locks in a deterministic order, avoiding database deadlocks.

---

## 📦 Technology Stack

- **Frontend**: React.js (Vite), Vanilla CSS (Design Tokens, Dark/Light Mode), Lucide Icons, Socket.io-client.
- **Backend**: Node.js, Express.js, Socket.io (WebSocket Server), dotenv.
- **Database**: Supabase PostgreSQL (`pg` pool, transactions, row-locking).
- **AI Service**: Google Gemini API SDK (`@google/generative-ai` v0.24.1).

---

## 🛠️ Installation & Local Setup

### 1. Database Schema Configuration

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Navigate to **SQL Editor** (left sidebar) → **New Query**.
3. Paste the contents of `backend/schema.sql` and run (▶) to initialize the tables (`customers`, `orders`, `campaigns`, `messages`, `campaign_stats`).

### 2. Environment Variables Configuration

Create a `.env` file inside the `backend` directory based on the `.env.example` template:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
GEMINI_API_KEY=AIzaSy...
```

### 3. Install Dependencies

```bash
# From the root folder:

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Database Migrations & Seeding

```bash
# In the backend directory:

# Run migrations (Add Order Attribution tables and structures)
node db/migrations/run.js

# Seed customer profiles and mock transactions
npm run seed:fresh
```

---

## 💻 Running the Application

To run the application locally, you will need to open **three terminal windows**:

### Terminal 1: Backend API Server

```bash
cd backend
npm run dev
```

### Terminal 2: Multi-Channel Simulator

Simulates customer actions like message delivery, clicks, and read events:

```bash
cd backend
npm run channel:dev
```

### Terminal 3: Frontend Client

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Running Tests

To verify that the order validation, transaction savepoints, idempotency checks, and campaign analytics math work flawlessly, run the automated integration test suite:

```bash
# Inside the backend folder:
node __tests__/attribution.test.js
```

**What the tests verify:**

1. **Service Level**: Proper attribution matching within 48h click/open status, last-touch priorities, and organic fallbacks.
2. **API Level**:
   - Invalid UUID formats or non-existent Customer IDs return `404` without database query crashes.
   - Negative or zero amount purchases return validation `400`.
   - Repeated idempotency keys return the original order row and avoid duplicates.
   - Campaign analytics for 0 sent/0 clicks campaigns return zeroed-out numbers instead of NaN/null values.

---

## 📄 License

MIT License. Created for the Xeno AI Campaign Studio.
