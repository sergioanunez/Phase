# Cullers Scheduling

A mobile-first web application for residential homebuilders to schedule construction work, manage contractors, and track task completion with SMS confirmations and an AI assistant.

## Features

- **Role-Based Access Control**: 4 user roles (Admin, Superintendent, Manager, Subcontractor)
- **Master Template System**: Define work concepts that auto-generate tasks for new homes
- **SMS Confirmation Workflow**: Automated SMS confirmations via Twilio with Y/N responses
- **Task Status Management**: Comprehensive status tracking with valid transitions
- **Manager Dashboard**: Overview of progress, behind-schedule homes, and next tasks
- **Subcontractor Portal**: "My Week" view for contractors to see their assigned tasks
- **AI Assistant**: Role-aware AI assistant with tool calling for data retrieval and analysis
- **Audit Logging**: Complete audit trail of all changes
- **Mobile-First Design**: Responsive UI optimized for mobile devices

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: NextAuth.js with credentials provider
- **Validation**: Zod
- **SMS**: Twilio (outbound + inbound webhooks)
- **AI**: OpenAI API with function calling

## Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL database
- Twilio account (for SMS functionality)
- OpenAI API key (for AI assistant)

## Setup Instructions

### 1. Clone and Install

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string for **runtime** (Supabase: use transaction pooler, port 6543). Must include `?sslmode=require&pgbouncer=true`.
- `DIRECT_URL`: Direct connection to primary (Supabase: port 5432, `?sslmode=require`). Used only for migrations.
- `NEXTAUTH_URL`: Your app URL (e.g., `http://localhost:3000`)
- `NEXTAUTH_SECRET`: Random secret for NextAuth (generate with `openssl rand -base64 32`)
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number (e.g., `+1234567890`)
- `OPENAI_API_KEY`: Your OpenAI API key
- `APP_TIMEZONE`: Timezone (e.g., `America/New_York`)

#### Twilio account integration (SMS notifications)

The app uses Twilio for **task confirmation SMS** (Y/N) and **punch list SMS**. To connect your Twilio account:

1. **Get Account SID and Auth Token**
   - Log in at [Twilio Console](https://console.twilio.com)
   - On the dashboard you’ll see **Account SID** and **Auth Token** (click “Show” to reveal the token)
   - Or go to **Account → API keys & tokens**

2. **Get a phone number**
   - Go to **Phone Numbers → Manage → Buy a number** (or use your **trial number** under Phone Numbers)
   - The number must support SMS. Copy it in E.164 form (e.g. `+15551234567`)

3. **Add to `.env`**
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_PHONE_NUMBER=+15551234567
   ```

4. **Configure the inbound webhook** (so replies like Y/N are processed)
   - In Twilio: **Phone Numbers → Manage → Active Numbers** → click your number
   - Under **Messaging**, set “A message comes in” webhook to:
     - Production: `https://your-domain.com/api/sms/webhook` (HTTP POST)
     - Local: use [ngrok](https://ngrok.com) (`ngrok http 3000`) and set the webhook to `https://your-subdomain.ngrok.io/api/sms/webhook`

After saving `.env`, restart the app. SMS is used when:
- A user clicks **Send Confirmation** on a scheduled task (subcontractor receives Y/N confirmation request)
- A user sends **punch list** SMS from a task’s punch items

### 3. Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database with sample data
npm run db:seed
```

### 4. Twilio Webhook Configuration

1. Go to your Twilio Console
2. Navigate to Phone Numbers → Manage → Active Numbers
3. Select your phone number
4. Under "Messaging", set the webhook URL to:
   ```
   https://your-domain.com/api/sms/webhook
   ```
   For local development, use a tool like ngrok:
   ```bash
   ngrok http 3000
   ```
   Then use the ngrok URL: `https://your-ngrok-url.ngrok.io/api/sms/webhook`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Floor Plans (Supabase Storage, optional)

1. Create a [Supabase](https://supabase.com) project and enable Storage.
2. In the Supabase Dashboard → Storage, create a new bucket:
   - **Name:** `home-plans`
   - **Visibility:** Private (recommended)
3. Add to `.env`:
   - `SUPABASE_URL=https://your-project.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key` (from Project Settings → API)
4. Run Prisma migration so the `Home` table has plan fields: `npm run db:push` or `npm run db:migrate`.

Admins can upload a floor plan (PDF or image) per home in the Admin panel under Subdivisions & Homes → edit a home → Floor Plan section. Other roles see a "Plan" / "View Plan" button wherever a home address appears; tapping opens a full-screen viewer (pinch/zoom for images, embedded viewer for PDF). Signed URLs expire after 15 minutes; the viewer can refresh the link on demand.

## Test Accounts

After seeding, you can use these test accounts:

- **Admin**: `admin@cullers.com` / `admin123`
- **Superintendent**: `super@cullers.com` / `super123`
- **Manager**: `manager@cullers.com` / `manager123`
- **Subcontractor**: `sub@cullers.com` / `sub123`

## User Roles & Permissions

### Admin
- Full access to all features
- User management (CRUD)
- System configuration
- View all schedules and dashboards

### Superintendent
- View assigned homes
- Schedule tasks (assign date + contractor)
- Send SMS confirmations
- Mark tasks InProgress/Completed
- Add notes and reschedule tasks

### Manager
- Read-only access
- View all homes and dashboards
- View task status and progress
- Cannot edit schedules

### Subcontractor
- View-only access to assigned tasks
- "My Week" view with filters
- Can only see tasks where `contractorId` matches their linked contractor

## API Endpoints

### Homes
- `GET /api/homes` - List homes
- `POST /api/homes` - Create home
- `GET /api/homes/[id]` - Get home details
- `PATCH /api/homes/[id]` - Update home
- `DELETE /api/homes/[id]` - Delete home

### Tasks
- `GET /api/tasks/[id]` - Get task details
- `PATCH /api/tasks/[id]` - Update task
- `POST /api/tasks/[id]/send-confirmation` - Send SMS confirmation

### SMS
- `POST /api/sms/webhook` - Twilio inbound SMS webhook

### Subcontractor
- `GET /api/subcontractor/my-week` - Get "My Week" tasks with filters

### Dashboard
- `GET /api/dashboard` - Get dashboard data

### AI Assistant
- `POST /api/ai/chat` - Chat with AI assistant

## Task Status Flow

```
Unscheduled → Scheduled → PendingConfirm → Confirmed → InProgress → Completed
                                    ↓
                                 Declined
                                    
Any status → Canceled
Completed → (no transitions)
```

## SMS Workflow

1. Superintendent schedules a task (sets date + contractor)
2. Status changes to `Scheduled`
3. Superintendent clicks "Send Confirmation"
4. System sends SMS via Twilio with confirmation code
5. Status changes to `PendingConfirm`
6. Contractor replies Y or N
7. System processes reply via webhook:
   - Y → Status: `Confirmed`
   - N → Status: `Declined`

## AI Assistant

The AI assistant is role-aware and can:
- Answer questions about schedules and tasks
- Summarize delays and blockers
- Generate daily/weekly plans
- Draft contractor messages (requires user confirmation to send)
- Provide analytics (behind schedule homes, pending confirmations, etc.)

For Subcontractor role, the assistant is limited to "my tasks only".

## Development

```bash
# Run development server
npm run dev

# Run database migrations
npm run db:migrate

# Generate Prisma Client
npm run db:generate

# Open Prisma Studio
npm run db:studio

# Seed database
npm run db:seed
```

## Deployment

### Vercel

Prisma migrations run automatically on every deploy: the **Build Command** runs `prisma generate && prisma migrate deploy && next build`. Ensure your Vercel project has:

- **Build Command**: `npm run build` (or leave default; it uses `package.json` scripts)
- **Environment variables**: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and any other required vars (see below).

No need to set a custom Build Command if you use the project’s `build` script as-is.

### Production database: migrations and seed (from local machine)

Run these against your **production** database (e.g. Supabase) when provisioning or after schema changes:

```bash
# 1. Point to production DB (set env or use .env.production)
export DATABASE_URL="postgresql://...?sslmode=require"   # use pooler URL (port 6543) for app
export DIRECT_URL="postgresql://...?sslmode=require"    # primary (port 5432) for migrations

# 2. Run pending migrations
npx prisma migrate deploy

# 3. Seed default tenant and admin (idempotent; safe to re-run)
npx prisma db seed
```

Or with a single env file:

```bash
# Ensure .env (or .env.production) has DATABASE_URL and DIRECT_URL set to production
npx prisma migrate deploy
npx prisma db seed
```

**Env vars for migrations and seed**

- `DATABASE_URL` – PostgreSQL connection string for runtime (Supabase: **transaction pooler**, port 6543). Must include `?sslmode=require&pgbouncer=true`.
- `DIRECT_URL` – Direct connection to primary (Supabase: port 5432, `?sslmode=require`). Required for `prisma migrate deploy`. If port 5432 is unreachable from your network, you can temporarily set `DIRECT_URL` to the same pooler URL as `DATABASE_URL` to run migrations, or run the migration SQL manually in Supabase (see below).

No other env vars are required for migrations or seed. The seed creates/updates the default tenant (Cullers Homes, slug `cullers`, allowed email domain `cullers.com`) and admin user `admin@cullers.com`.

### Other platforms

1. Set up PostgreSQL database (e.g., on Railway or Supabase)
2. Set all environment variables in your hosting platform
3. Configure Twilio webhook URL to point to your production domain
4. Deploy to Vercel, Railway, or your preferred platform

```bash
npm run build
npm start
```

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   ├── auth/             # Authentication pages
│   ├── homes/            # Homes pages
│   ├── dashboard/        # Dashboard page
│   ├── my-week/          # Subcontractor "My Week" page
│   └── layout.tsx        # Root layout
├── components/
│   ├── ui/               # Reusable UI components
│   ├── navigation.tsx    # Bottom navigation
│   ├── task-modal.tsx    # Task editing modal
│   └── ai-assistant.tsx  # AI assistant component
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   ├── rbac.ts           # Role-based access control
│   ├── twilio.ts         # Twilio SMS functions
│   ├── audit.ts          # Audit logging
│   └── utils.ts          # Utility functions
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed script
└── types/                # TypeScript type definitions
```

## License

Proprietary - Cullers Homes

## Support

For issues or questions, please contact the development team.
#   P h a s e 
 
 