# IBF FG Warehouse Module — Backend Stack Explained
## Login, Logout, Data Storage, File Uploads — Kya Kahan Hota Hai
### Technology: Cloudflare D1 + Clerk + Cloudflare R2 + Drizzle ORM + Next.js

---

## 📌 QUICK ANSWERS (TL;DR)

| Question | Answer |
|----------|--------|
| **Login kahan hoga?** | Clerk (managed authentication service) — Clerk apne server par login page host karta hai, user verify karta hai, JWT token deta hai |
| **Logout kaise hoga?** | Clerk ka `signOut()` function — session clear, token revoke, login page par redirect |
| **Saara data kahan save hoga?** | Cloudflare D1 — ye ek serverless SQLite database hai, Cloudflare ke global network par (Mumbai edge included) |
| **Files kahan upload/save hongi?** | Cloudflare R2 — S3-compatible file storage, 10GB free, zero download charges |
| **Database queries kaise chalengi?** | Drizzle ORM — TypeScript code likho, Drizzle SQL banata hai, D1 par chalata hai |
| **Hosting kahan?** | Cloudflare Pages — frontend + API routes dono yahan deploy hote hain, ek hi command se |

---

## 1. LOGIN / LOGOUT — Clerk

### Ye kya hai? (Simple Hinglish)

📚 **Clerk kya hai?**

Clerk ek **ready-made login system** hai. Soch lo ek security guard jo building ke gate par sabko check karta hai — wahi Clerk hai app ke liye.

- User email/password daalta hai → Clerk check karta hai → sahi hai to token deta hai
- Har API request ke saath ye token jaata hai → API check karta hai ki user authentic hai
- Roles (R01-R12) bhi Clerk mein set hote hain — Clerk user ke metadata mein role store karta hai
- Password reset, email verification, social login (Google) — sab built-in, aapko code nahi likhna padega

### Login Flow (Step-by-Step)

```
1. User browser mein app ka URL kholta hai (e.g., ibf-warehouse.pages.dev)

2. Clerk middleware check karta hai — agar user login nahi hai:
   → Redirect to Clerk-hosted sign-in page
   → Page dekhta hai: "Sign in to IBF FG Warehouse"
   → Email + password enter karta hai (ya Google login)

3. Clerk credentials verify karta hai:
   → Sahi hai → JWT token banata hai
   → Token browser cookie mein set hota hai
   → User redirect to dashboard

4. Ab user dashboard dekhta hai:
   → Clerk middleware har page load par token verify karta hai
   → User ka role (e.g., R04 = QC) Clerk metadata se nikalta hai
   → UI us role ke hisab se pages dikhata hai
```

### Logout Flow

```
1. User "Logout" button click karta hai
2. Clerk ka signOut() function call hota hai
3. Clerk session clear karta hai — token revoke
4. User redirect to sign-in page
5. Ab agar user wapas page kholna chaahe → login maanga jayega
```

### Code Example — Login/Logout Setup

```typescript
// src/middleware.ts — Clerk middleware (har request par chalega)
import { authMiddleware } from '@clerk/nextjs';

export default authMiddleware({
  publicRoutes: ['/sign-in', '/sign-up'], // sirf ye pages bina login ke
  // baaki sab pages ke liye login zaroori
});

// src/app/sign-in/[[...sign-in]]/page.tsx — Login page
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return <SignIn />; // Clerk ka pre-built login form
}

// Logout button (kisi bhi page par)
import { signOut } from '@clerk/nextjs';

<button onClick={() => signOut({ redirectUrl: '/sign-in' })}>
  Logout
</button>
```

### Role Setup in Clerk

Clerk dashboard mein har user ke saath `metadata` set hota hai:

```json
// Clerk user public metadata
{
  "role": "R04",           // QC Lab Officer
  "department": "QC LAB",
  "plant": "LIMBASI"
}
```

API route mein role check:

```typescript
// src/lib/auth.ts
import { auth } from '@clerk/nextjs';

export function getCurrentUser() {
  const { sessionClaims } = auth();
  return {
    role: sessionClaims?.metadata?.role,        // "R04"
    department: sessionClaims?.metadata?.department,
    plant: sessionClaims?.metadata?.plant,
  };
}

export function requireRole(allowedRoles: string[]) {
  const { role } = getCurrentUser();
  if (!role || !allowedRoles.includes(role)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return role;
}

// Usage in API route:
// app/api/holds/[id]/release/route.ts
export async function POST(req: Request) {
  requireRole(['R04', 'R05']); // Sirf QC release kar sakta hai
  // ... release logic
}
```

### Clerk — Free-Only Constraint

Clerk is the selected authentication provider. Use it on the free plan by default. Current provider limits must be checked at implementation/deployment time rather than treated as permanent guarantees.

**Rule:** any upgrade, subscription, billing change, paid add-on, or credit purchase requires explicit Alpesh approval for that specific action.

---

## 2. DATA STORAGE — Cloudflare D1

### Ye kya hai? (Simple Hinglish)

📚 **Cloudflare D1 kya hai?**

D1 ek **serverless SQLite database** hai. Iska matlab:
- Koi server install nahi karna padta — Cloudflare apne server par chalata hai
- SQL queries chalti hain (SQLite syntax — standard SQL)
- Data Cloudflare ke global network par save hota hai — Mumbai mein bhi server hai
- Free tier: 5GB storage + 5 lakh reads/day + 1 lakh writes/day

Isko soch lo jaise ek Excel file jo Cloudflare ke server par hai, but SQL se query hoti hai — aur kabhi lose nahi hoti, automatically backup hoti hai.

### Kya Kahan Save Hota Hai?

```
Cloudflare D1 (SQLite database)
├── materials          ← Material master (LFG00938, LFG00613, etc.)
├── batches            ← Production batches (L26I010938, etc.)
├── pallets            ← Physical pallets with status
├── pallet_batches     ← Multiple batches per pallet (junction)
├── locations          ← Rack positions (CR1-01-A-4, etc.)
├── warehouses         ← Own + 3PL warehouse master
├── sap_codes          ← 110 SAP storage location codes (reference)
├── statuses           ← 10 fixed status values (QC_HOLD, OK, HOLD, etc.)
├── receiving_sheets   ← Digital receiving sheets (locked = legal doc)
├── receiving_sheet_pallets ← Pallet rows within receiving sheets
├── hold_records       ← Hold tracking with reason, aging, release
├── transfer_orders    ← Inter-warehouse / 3PL transfers
├── loading_sheets     ← Vehicle loading documents
├── maintenance_tickets ← Equipment issue tracking
├── stock_ledger       ← APPEND-ONLY transaction log (DSR replacement)
└── users              ← User list (synced from Clerk)
```

### How Data Gets Saved (Example: Receiving Sheet)

```
1. Warehouse Executive fills "New Receiving Sheet" form on tablet
   → Enters: date, shift, material code, batch number, pallet details

2. Form submitted → Next.js API Route receives request
   → POST /api/receiving-sheets

3. API Route:
   a. Clerk middleware verifies user is logged in (R01 or R03)
   b. Zod validation checks all fields (batch format, pallet numbers, etc.)
   c. Business rules checked (max 35 pallets, etc.)
   d. Drizzle ORM converts TypeScript to SQL:

      db.insert(receivingSheets).values({
        sheetNumber: 'RS-2026-0912-001',
        date: '2026-09-12',
        shift: 'A',
        materialId: 'uuid-of-LFG00938',
        batchNumber: 'L26I010938',
        status: 'DRAFT',
        ...
      });

   e. Drizzle runs SQL on D1:
      INSERT INTO receiving_sheets (id, sheet_number, date, ...) VALUES (...);

   f. D1 saves data on Cloudflare's server (Mumbai edge)

4. Confirmation sent back to user → "Receiving Sheet RS-2026-0912-001 created"

5. Later, when both sides confirm → status changes to LOCKED:
   → Stock ledger entry created: INSERT INTO stock_ledger (transaction_type='INWARD', ...)
   → Pallets created: INSERT INTO pallets (status_code='QC_HOLD', ...)
   → D1 trigger prevents any future UPDATE on the locked sheet
```

### Code Example — Drizzle ORM with D1

```typescript
// drizzle/schema.ts — Database schema (TypeScript)
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
  uomKgPerCarton: real('uom_kg_per_carton').notNull(),
  category: text('category').notNull(),
  palletWeightLimitKg: real('pallet_weight_limit_kg').notNull(),
  palletType: text('pallet_type').notNull(),
  shelfLifeDays: integer('shelf_life_days'),
  plantOrigin: text('plant_origin').notNull(),
  active: integer('active').default(1),
});

export const pallets = sqliteTable('pallets', {
  id: text('id').primaryKey(),
  palletNumber: text('pallet_number').notNull(),
  materialId: text('material_id').notNull().references(() => materials.id),
  statusCode: text('status_code').notNull().default('QC_HOLD'),
  totalWeightKg: real('total_weight_kg').notNull(),
  totalCartons: integer('total_cartons').notNull(),
  currentWarehouseId: text('current_warehouse_id').notNull(),
  // ...
});

// src/lib/db.ts — D1 connection
import { drizzle } from 'drizzle-orm/d1';
import { getRequestContext } from '@cloudflare/next-on-pages';
import * as schema from '@/drizzle/schema';

export const db = drizzle(getRequestContext().env.DB, { schema });
// DB is the D1 binding from wrangler.toml

// Usage in API route:
// app/api/pallets/route.ts
export async function GET() {
  const allPallets = await db.select().from(pallets);
  return Response.json(allPallets);
}
```

### wrangler.toml — Cloudflare Config

```toml
# wrangler.toml — Cloudflare Pages config
name = "ibf-fg-warehouse"
compatibility_date = "2024-09-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"                    # This is how D1 is accessed in code
database_name = "ibf-fg-warehouse"
database_id = "your-d1-database-id"

[[r2_buckets]]
binding = "R2"                    # This is how R2 is accessed in code
bucket_name = "ibf-fg-warehouse-files"

[vars]
CLERK_SECRET_KEY = ""             # Set via: wrangler secret put CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ""  # Set in Cloudflare dashboard
```

### D1 — Free-Only Constraint

D1 is the selected operational database. Do not encode historical provider limits into business logic. Check current capacity/limits when deploying. If a limit is reached, stop and request a human decision instead of silently enabling paid usage.

---

## 3. FILE UPLOADS & STORAGE — Cloudflare R2

### Ye kya hai? (Simple Hinglish)

📚 **Cloudflare R2 kya hai?**

R2 ek **file storage service** hai — jaise Google Drive ya Dropbox, but app ke liye. Iska sabse bada fayda: **download karna free hai** (zero egress charges). Amazon S3 jaisa, but sasta.

Files jo save hongi:
- **Excel exports** (DSR format reports — daily/weekly/monthly)
- **Photos** (future: receiving dispute photos, damage photos — abhi deferred but model ready)
- **Documents** (loading sheet PDFs, gate pass copies — future)

### File Upload Flow (Step-by-Step)

```
1. User file select karta hai (e.g., photo of damaged carton — future feature)

2. File browser se Next.js API Route mein aati hai:
   → POST /api/upload with FormData

3. API Route:
   a. Clerk middleware verifies user is logged in
   b. File size/type check (max 5MB, only images for now)
   c. File upload to Cloudflare R2:

      const r2 = getRequestContext().env.R2;
      await r2.put(`photos/receiving/RS-2026-0912-001/pallet3.jpg`, fileData);

   d. R2 file URL save in D1 database:
      await db.update(receivingSheetPallets)
        .set({ photoUrl: 'photos/receiving/RS-2026-0912-001/pallet3.jpg' })
        .where(eq(id, palletRowId));

4. Later, when viewing receiving sheet:
   → API reads from R2:
     const file = await r2.get('photos/receiving/RS-2026-0912-001/pallet3.jpg');
   → Returns image to browser
```

### Excel Export Flow (Immediate Need)

```
1. User clicks "Export DSR" on Stock Ledger page
2. API Route:
   a. Query D1 for all transactions in date range
   b. SheetJS generates Excel in DSR format (matching SEPT-2026 sheet columns)
   c. Excel file saved to R2:
      await r2.put(`exports/DSR_2026-09.xlsx`, excelBuffer);
   d. Download URL returned to user
   e. User clicks download → file served from R2
```

### R2 Storage Structure

```
ibf-fg-warehouse-files/ (R2 bucket)
├── exports/
│   ├── DSR_2026-09.xlsx              (Monthly DSR export)
│   ├── DSR_2026-09-12.xlsx           (Daily DSR export)
│   └── Container_Report_2026-09.xlsx  (Container details export)
├── photos/                            (FUTURE — not in v1)
│   └── receiving/
│       └── RS-2026-0912-001/
│           ├── pallet3_bulging.jpg
│           └── pallet5_damage.jpg
└── documents/                         (FUTURE)
    └── loading-sheets/
        └── LS-2026-0912-001.pdf
```

### R2 Free Tier

| Feature | Free Tier | IBF Usage |
|---------|-----------|-----------|
| Storage | 10 GB | Excel exports: ~50MB/month → years of storage |
| Class A operations (writes) | 1 million/month | ~100-500/month |
| Class B operations (reads) | 10 million/month | ~1000/month |
| **Egress (download)** | **UNLIMITED — FREE** | No download charges ever |

**Verdict: Free tier more than enough. 10GB can store years of Excel exports + future photos.**

---

## 4. COMPLETE BACKEND ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER (Browser/Tablet)                        │
│                   Warehouse floor, -18°C, gloves                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Pages (Edge Runtime)                  │
│                    Mumbai edge — fast for India                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Next.js App                            │   │
│  │                                                          │   │
│  │  ┌─Pages (UI)──────┐   ┌─API Routes (Backend)──────┐    │   │
│  │  │ /dashboard       │   │ /api/receiving-sheets      │    │   │
│  │  │ /inward/receiving│   │ /api/pallets               │    │   │
│  │  │ /storage/rack-map│   │ /api/holds                  │    │   │
│  │  │ /holds           │   │ /api/loading-sheets         │    │   │
│  │  │ /outward         │   │ /api/transfers              │    │   │
│  │  │ /stock/ledger    │   │ /api/maintenance            │    │   │
│  │  │ /masters/*       │   │ /api/stock/*                 │    │   │
│  │  │ /maintenance    │   │ /api/masters/*               │    │   │
│  │  └──────────────────┘   └──────────┬──────────────────┘    │   │
│  │                                    │                       │   │
│  │  ┌─Clerk Auth─────┐               │                       │   │
│  │  │ Login/Logout   │               │                       │   │
│  │  │ Roles R01-R12  │               │                       │   │
│  │  │ Session verify │               │                       │   │
│  │  └────────────────┘               │                       │   │
│  │                                    │                       │   │
│  │         Drizzle ORM (type-safe)    │                       │   │
│  │         db.select().from(...)      │                       │   │
│  └────────────────────────────────────┼───────────────────────┘   │
│                                       │                           │
│                    ┌──────────────────┼───────────────┐          │
│                    │                  │               │          │
│                    ▼                  ▼               ▼          │
│           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│           │ Cloudflare   │  │ Cloudflare   │  │ Clerk API    │ │
│           │ D1 (SQLite)  │  │ R2 (Files)   │  │ (Auth)       │ │
│           │              │  │              │  │              │ │
│           │ All business │  │ Excel exports│  │ User data    │ │
│           │ data lives   │  │ Photos (fut) │  │ Roles        │ │
│           │ here          │  │ Documents    │  │ Sessions    │ │
│           │              │  │              │  │              │ │
│           │ 16 tables    │  │ /exports/    │  │ JWT tokens   │ │
│           │ Stock ledger │  │ /photos/     │  │              │ │
│           │ (append-only)│  │ /documents/  │  │              │ │
│           └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                  │
│  Free tier: 5GB + 5M reads   Free: 10GB + 0 egress   Free: 10K MAU│
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. SETUP INSTRUCTIONS (for Claude Code)

### Step 1: Cloudflare Account Setup
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create ibf-fg-warehouse
# Note the database_id — put in wrangler.toml

# Create R2 bucket
wrangler r2 bucket create ibf-fg-warehouse-files
```

### Step 2: Clerk Setup
```
1. Go to clerk.com → Create account → Create application "IBF FG Warehouse"
2. Get API keys:
   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (frontend)
   - CLERK_SECRET_KEY (backend — set as wrangler secret)
3. Create custom roles in Clerk dashboard:
   R01 through R12 (as public metadata)
4. Set up sign-in/sign-up pages with Clerk components
5. Set up webhook to sync users to D1
```

### Step 3: Environment Variables
```bash
# .env.local (for development)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Cloudflare secrets (for production)
wrangler secret put CLERK_SECRET_KEY
# Paste the key when prompted
```

### Step 4: Database Migration
```bash
# Create migration from Drizzle schema
npx drizzle-kit generate

# Apply migration to D1 (local for dev)
npx wrangler d1 migrations apply ibf-fg-warehouse --local

# Apply migration to D1 (remote for production)
npx wrangler d1 migrations apply ibf-fg-warehouse --remote

# Seed data
npm run db:seed
```

### Step 5: Deploy
```bash
# Deploy to Cloudflare Pages
npx @cloudflare/next-on-pages
# Or connect GitHub repo to Cloudflare Pages dashboard for auto-deploy
```

---

## 6. FREE-ONLY COST / BILLING GUARD

**Target operating mode: ₹0/month.**

No paid plan activation, paid credits, paid add-ons, domain purchase, or billing change is permitted without explicit Alpesh approval for that specific action. Provider prices and free-tier limits can change; verify them at deployment time. If a limit is reached, status becomes **BLOCKED / NEEDS HUMAN DECISION**.

---

*This document answers: login kahan, data kahan, files kahan — sab ek jagah.*
*Updated: 2026-09-13 — v1.3 hybrid/free-only guard hardening*
