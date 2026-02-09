# Quick Start Guide

## Initial Setup (5 minutes)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `NEXTAUTH_SECRET` - Run `openssl rand -base64 32` to generate
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - `OPENAI_API_KEY`

3. **Set up database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Access the app:**
   - Open http://localhost:3000
   - Sign in with: `admin@cullers.com` / `admin123`

## Testing SMS (Optional)

1. Set up ngrok for local webhook testing:
   ```bash
   ngrok http 3000
   ```

2. In Twilio Console, set webhook URL to:
   ```
   https://your-ngrok-url.ngrok.io/api/sms/webhook
   ```

3. Test by scheduling a task and sending a confirmation SMS.

## Key Features to Test

### As Admin:
- Create subdivisions and homes
- Create work template items
- Create contractors
- Manage users
- View all schedules

### As Superintendent:
- View assigned homes
- Schedule tasks (set date + contractor)
- Send SMS confirmations
- Mark tasks as InProgress/Completed

### As Manager:
- View dashboard with progress metrics
- See behind-schedule homes
- View all homes (read-only)

### As Subcontractor:
- View "My Week" with week navigation
- Filter by "All Scheduled" or "Only Confirmed"
- Toggle "Show Pending Confirmations"
- Use AI assistant (limited to own tasks)

## AI Assistant

Click the floating message icon to open the AI assistant. Try:
- "What tasks are pending confirmation?"
- "Which homes are behind schedule?"
- "Show me today's plan"
- "What's my schedule for this week?" (Subcontractor)

## Troubleshooting

**Database connection errors:**
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Run `npm run db:push` if migrations fail

**SMS not working:**
- Verify Twilio credentials
- Check webhook URL is accessible
- Check Twilio phone number format (+1234567890)

**Authentication issues:**
- Clear browser cookies
- Verify `NEXTAUTH_SECRET` is set
- Check user exists in database

**AI Assistant not responding:**
- Verify `OPENAI_API_KEY` is set
- Check API key has credits
- Review server logs for errors
