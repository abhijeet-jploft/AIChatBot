# How to Test Leads from the Chatbot

This guide explains how leads are captured and how to test them end-to-end.

---

## 1. When does a lead get captured?

After **every** AI reply, the backend runs lead detection on the full conversation. A lead is **created or updated** when at least one of these is true:

| Signal | Example in chat |
|--------|------------------|
| **Email** | User says or types an email address |
| **Phone + name** | User says e.g. "I'm John, call me on +1 555 123 4567" |
| **Consultation** | "I want a consultation" / "discuss my project" / "quick call" |
| **Pricing** | "What's the price?" / "quote" / "estimate" / "budget" |
| **Contact** | "Contact me" / "reach out" / "get back to me" |
| **Meeting** | "Book a meeting" / "schedule a call" / "arrange a demo" |
| **High intent** | "Ready to start" / "need a proposal" / "timeline" / "launch" |

Extraction is automatic: **name** (e.g. "My name is Sarah"), **phone** (digits, with optional +), **email** (regex), **location**, **business type**, **budget**, **timeline**, and **service requested** (inferred from words like "mobile app", "ecommerce", "website").

---

## 2. Prerequisites

- **Server running** (e.g. `npm run server` or your usual start).
- **Database migrated** (`leads` table exists — see `server/db/migrate.js`).
- **Admin account** for the **same company** you use in the chat (e.g. `_JP_Loft`). Leads are stored per `company_id`; you only see leads for the company you’re logged in as.

---

## 3. Test flow (end-to-end)

### Step 1: Open the chat

Use either:

- **Main app:**  
  `http://localhost:5173` (or your client URL). Default company is `_JP_Loft`.
- **Embed demo:**  
  Host page: `http://localhost:7001/<embed_slug>?apiKey=<embed_secret>&companyId=<folder_id>` — both query params are required.

So in both cases, leads will be stored for company **`_JP_Loft`**.

### Step 2: Have a conversation that triggers lead capture

Use one of these patterns (or combine):

**Option A – Name + phone (strongest)**  
- "Hi, I need a website for my restaurant."  
- When the AI asks for contact: "My name is Test User. You can reach me at +91 9876543210."

**Option B – Email**  
- "I'm interested in a mobile app. My email is test@example.com."

**Option C – Consultation / meeting**  
- "I'd like to book a quick consultation to discuss my project."  
- Or: "Schedule a call with me for next week."

**Option D – Pricing + intent**  
- "What's the cost for an e-commerce site?"  
- Then: "Please contact me – I'm ready to get a proposal. My name is Jane and my number is 5551234567."

Send a few messages so the conversation has enough context; the last message (or earlier) should include at least one of the signals above.

### Step 3: Check leads in the admin panel

1. Log in to the **admin** panel:  
   `http://localhost:5173/admin` (or `/admin/login`).
2. Log in with an admin account that belongs to **`_JP_Loft`** (the same company the chat used).
3. Go to **Leads** in the sidebar (`/admin/leads`).
4. You should see the new lead (or an updated one if the same session already had a lead).

You can:

- Open a lead to see **detail**, **conversation transcript**, **status**, **notes**, **activities**.
- Change **status** (e.g. New → Contacted).
- Add **notes**, set **reminder**, **export CSV**, or **download transcript**.

---

## 4. What you’ll see on a lead

Each lead record includes (when available):

- **Name**, **phone**, **email**
- **Project summary** (excerpt from conversation)
- **Service requested** (e.g. "Website Development", "Mobile App Development")
- **Landing page** / **device type**
- **AI-detected intent** (e.g. `meeting_booking`, `pricing_request`, `high_intent`)
- **Lead score** (0–100) and **category** (e.g. cold / warm / hot)
- **Contact method** (e.g. whatsapp/call, email)
- **Full transcript** (in lead detail)

---

## 5. Optional: test lead email notifications

1. In admin, go to **Settings**.
2. Under **Lead notifications**, enable **Email notifications** and set the **notification email**.
3. Trigger a **new** lead from the chat (e.g. new session + name + phone).
4. Check that the configured inbox receives the new-lead email (if SMTP is configured in `.env`).

---

## 6. Troubleshooting

| Issue | What to check |
|-------|----------------|
| No lead appears | Ensure the conversation includes at least one trigger (email, or phone+name, or consultation/pricing/contact/meeting/high-intent). Send another message after sharing contact so the backend runs capture again. |
| Wrong company | Chat and admin must use the same `company_id`. Embed uses `JPLoftChatConfig.companyId`; main app uses the selected company (default `_JP_Loft`). |
| Lead not “new” | Same session can update an existing lead (upsert). Use a **new** chat session (new tab or new conversation) to get a separate lead. |
| Server errors | Check server logs for `[lead-capture]` or `[lead-notify]`; DB errors are logged as non-fatal so the chat still responds. |

---

## 7. Quick reference – lead trigger logic

Defined in `server/services/leadCaptureService.js`:

- **`shouldCreate`** is true if:  
  `email` **OR** (`phone` **AND** `name`) **OR** consultation **OR** pricing **OR** contact **OR** meeting **OR** highIntent.
- **Lead score** is increased by: phone (+30), email (+22), meeting (+20), consultation (+18), urgency (+14), contact (+12), high intent (+12), budget/timeline (+10 each), pricing (+5); very short conversations get a penalty.

Use the patterns in **Section 3** to hit these conditions and verify leads in **Admin → Leads**.
