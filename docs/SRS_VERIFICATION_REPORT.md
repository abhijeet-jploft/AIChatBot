# SRS Verification Report: Scenarios & Rules vs Document

**Source document:** `tools/docx_extract/document_text.txt` (extracted from *AI Chat Agent __ Feature listing and Ideas __ JPloft.docx*)  
**SRS sections checked:** 3.0 Functional Requirements, 4.2 AI Training, 4.5 AI Configuration  
**Code references:** `server/services/chatRules.js`, `server/services/aiModes.js`, `server/services/anthropicService.js`

---

## 1. Scenarios: Document vs Code

The SRS defines **12 visitor scenarios** in the User Journey (Scenarios 01–12). The code implements **13 scenario IDs** (12 + `mixed_general` fallback).

| Doc scenario | Doc section | Code ID | Code playbook / behavior | Status |
|--------------|-------------|---------|---------------------------|--------|
| 01 — First Time Visitor | Lines 156–183 | `first_time_visitor` | Welcome, discovery (new vs existing, what users do), guide to scope/consultation | ✅ Match |
| 02 — Confused / Idea Stage | Lines 184–233 | `idea_stage_visitor` | Reduce confusion, product vs service, target users, simple first version | ✅ Match |
| 03 — Price-hungry User | Lines 234–284 | `price_hungry_user` | No exact price, deflect → qualify → features → call booking → contact | ✅ Match |
| 04 — Exploring / Browsing | Lines 285–322 | `exploring_visitor` | No pressure, guidance, optional email/WhatsApp guide | ✅ Match |
| 05 — Portfolio / Capability | Lines 323–403 | `portfolio_evaluation` | Confirm capability, similar projects, guided viewing, links from KB | ✅ Match |
| 06 — Technology questions | Lines 404–447 | `technology_question` | Answer briefly, redirect to requirements | ✅ Match |
| 07 — Returning Visitor | Lines 448–479 | `returning_visitor` | Welcome back, skip intro, straight to portfolio/services | ✅ Match |
| 08 — Job Seeker | Lines 480–527 | `job_seeker` | See **variance** below | ⚠️ Variance |
| 09 — Wrong / Irrelevant | Lines 528–567 | `wrong_visitor` | Clarify scope, offer relevant alternative | ✅ Match |
| 10 — Competitor / Agency | Lines 568–612 | `competitor_check` | Safe company-level answers, no client/pricing detail | ✅ Match |
| 11 — Feature Shopper | Lines 613–686 | `feature_shopper` | Answer features → stop checklist → pivot to business need → consultation | ✅ Match |
| 12 — Urgent Buyers | Lines 687–764 | `urgent_buyer` | Immediate acknowledgement, fast qualification, realistic expectation, strong call push, fast contact | ✅ Match |
| — | — | `mixed_general` | Fallback; blend sales/support/technical by intent | ✅ OK (no doc scenario) |

**Conclusion (scenarios):** All 12 document scenarios are represented in code. One intentional variance: **Job Seeker** (see below).

---

## 2. Critical Variance: Job Seeker (Scenario 08)

- **Document (lines 480–527):**  
  - “You can share your skills or **resume** and I'll match you with a suitable position and **forward it to our hiring team**.”  
  - “Just **upload your resume** or tell me your experience…”  
  - “You can **upload your CV here directly**. I'll attach it to your profile and forward it to our recruitment team.”

- **Code (`chatRules.js` + `aiModes.js`):**  
  - “**Do not ask for a resume in chat**, and instead **share the HR email** for applications while briefly explaining the process.”  
  - Playbook: “Do not ask for resume upload in chat. Guide them to official hiring contact on company website.”  
  - Enforcement: `violatesJobSeekerRule()` detects “upload/attach/share … resume/cv” and replaces with a safe reply redirecting to official hiring contact.

So: **SRS describes accepting resume/CV in chat and forwarding to hiring team; implementation deliberately does not accept resume in chat and redirects to HR/Contact.** This is a **document vs code mismatch**. If the product decision is “no resume in chat” (e.g. privacy/compliance), the SRS should be updated to match.

---

## 3. Rules: Document vs Code

### 3.1 Pricing (4.5.7 & Scenario 03)

| Doc | Code | Status |
|-----|------|--------|
| Never display exact pricing; redirect to consultation (4.5.7) | DOCX_RULES + no numeric price/range in output; deflection flow | ✅ |
| Step 1–4: Deflection, “just tell price” handling, qualification, feature listing | Same flow in rules and `buildPricingDeflectionReply()` | ✅ |
| Step 5: “Give RANGE (Optional — Controlled)” / “call initialization” | Code does **not** give range; only “quick discussion for estimate” | ✅ Stricter (aligned with 4.5.7) |
| Step 6–7: Call booking, “Where to send meeting details?”, “best number”, “name?” | In DOCX_RULES and prompt | ✅ |
| If user refuses call → brief plan, ask for email | DOCX_RULES: “Offer to send a brief plan or outline. Ask for email instead.” | ✅ |
| Never hourly rate | DOCX_RULES + regex for “hourly rate” | ✅ |
| Repeated price → contact company + Contact Us link when in KB | DOCX_RULES + `isRepeatedPricingQuestion()` + fallback reply | ✅ |

### 3.2 Data safety (4.2.7)

| Doc | Code | Status |
|-----|------|--------|
| “The AI shall not expose raw database records or internal identifiers.” | `sanitizeInternalIdentifiers()` (UUIDs → `[redacted-id]`), DOCX_RULES | ✅ |
| No internal notes, sensitive DB data, client details | In DOCX_RULES | ✅ |

### 3.3 Unreliable information (4.2.13)

| Doc | Code | Status |
|-----|------|--------|
| “If the AI cannot find reliable information…” → “I may need to confirm this with our team. I can arrange a quick discussion for you.” | Exact phrasing in DOCX_RULES | ✅ |

### 3.4 Urgent buyers (Scenario 12)

| Doc | Code | Status |
|-----|------|--------|
| Immediate acknowledgement, fast qualification only, set realistic expectation, strong call push, fast contact | DOCX_RULES + `urgent_buyer` playbook + `enforceOutputRules()` urgent fallback | ✅ |
| “Please share your phone number” / “And your name?” | In `buildUrgentEscalationReply()` | ✅ |
| If user hesitates → get email | Doc says “Get the Email if the number not provided”; code urges call but doesn’t enforce email fallback in code | ⚠️ Prompt-only |

### 3.5 Portfolio / guided viewing (Scenario 05)

| Doc | Code | Status |
|-----|------|--------|
| “I’m opening a similar project for you” / “Let me take you to that page” + link | DOCX_RULES: “Guided viewing: Say … and include the link.” | ✅ |
| Links from knowledge base when available | DOCX_RULES + playbook “Include relevant source links from knowledge base when available.” | ✅ |

### 3.6 Feature shopper (Scenario 11)

| Doc | Code | Status |
|-----|------|--------|
| Answer clearly → after 2–3 feature questions stop checklist → “what really matters is how customers will use the website” → redirect to requirement → consultation | DOCX_RULES + playbook “Stop checklist mode and redirect to the actual business need and consultation.” | ✅ |

### 3.7 Product vision / persona

| Doc | Code | Status |
|-----|------|--------|
| “Sales Executive + Product Consultant + Website Guide + Lead Generator + **Business Analyst**” | DOCX_RULES: “Sales Executive + Product Consultant + Website Guide + Lead Generator.” No “Business Analyst.” | ⚠️ Minor omission |
| “This product is not a CRM and not an FAQ bot.” | DOCX_RULES: “Not a CRM or FAQ bot.” | ✅ |

### 3.8 Contact capture & phone validation

| Doc | Code | Status |
|-----|------|--------|
| Collect name, phone, email when moving to conversion; “Where to send meeting details?” “best number” “name?” | DOCX_RULES | ✅ |
| Country code: doc doesn’t explicitly require “ask for country code if missing.” | Code adds: “If the user shares a phone number without an explicit country code, ask a short follow-up for the country code.” | ✅ Code adds a sensible rule |

### 3.9 Out-of-domain / coding requests

| Doc | Code | Status |
|-----|------|--------|
| Doc doesn’t spell out “no generic code/tutorial.” | Code: “Out-of-domain coding/tutorial requests: Do not provide that content. Redirect to business-focused guidance and discovery questions.” + `isOffDomainCodeRequest()` + redirect reply | ✅ Code adds guard not explicit in SRS |

### 3.10 Wrong visitor (Scenario 09)

| Doc | Code | Status |
|-----|------|--------|
| Politely clarify what company does; offer relevant alternative (e.g. “we build e-commerce apps for businesses that sell them”) | DOCX_RULES + wrong_visitor playbook | ✅ |

### 3.11 Competitor / agency (Scenario 10)

| Doc | Code | Status |
|-----|------|--------|
| Location, team size, clients, process, hourly rate, white-label — safe company-level answers; no client/pricing detail | DOCX_RULES + competitor_check playbook | ✅ |

---

## 4. Implementation coverage summary

| Area | Document | Code | Verdict |
|------|----------|------|--------|
| All 12 scenarios | 12 scenarios | 12 + mixed_general | ✅ All covered |
| Job seeker behavior | Accept resume/CV in chat, forward to hiring | No resume in chat; redirect to HR/Contact | ⚠️ **Intentional variance** |
| Pricing (no exact, no range, deflection, repeated price, no call refusal) | Full flow | Full flow + enforcement | ✅ |
| Data safety (no UUIDs/internal data) | 4.2.7 | Sanitization + rules | ✅ |
| Unreliable info phrase | 4.2.13 | In DOCX_RULES | ✅ |
| Urgent: acknowledge, fast qualify, call push, contact | Scenario 12 | Rules + playbook + fallback | ✅ |
| Portfolio guided viewing + KB links | Scenario 05 | Rules + playbook | ✅ |
| Feature shopper: answer then pivot to business need | Scenario 11 | Rules + playbook | ✅ |
| Persona | Includes “Business Analyst” | Omitted in code | ⚠️ Minor |
| Phone country code | Not explicit | Added in DOCX_RULES | ✅ Enhancement |
| Booking/Calendly link | “Will send the Calendly link if needed, integrated inside the AI chatbot” | “Provide booking link when available” (KB-dependent) | ⚠️ No dedicated Calendly integration; depends on KB |
| Contact Us link (repeated price) | Implied by “contact company” | Explicit “include Contact Us link when available in KB” | ✅ |

---

## 5. Recommendations

1. **Job Seeker (Scenario 08):** Align document with product decision. Either:  
   - **Option A:** Update SRS to state that the AI does **not** accept resume/CV in chat and directs applicants to official hiring/HR contact (current code behavior), or  
   - **Option B:** Implement resume/CV upload and forwarding as described in the current SRS.

2. **Persona:** If “Business Analyst” is required, add it to the code persona string and any prompts that list roles.

3. **Calendly / booking link:** SRS calls for integration inside the chatbot. Code currently relies on “booking link when available” from knowledge base. If a dedicated booking (e.g. Calendly) integration is required, add it to the backlog and reference it in the SRS.

4. **Urgent — email if no phone:** Document says to get email if number not provided. Consider adding an explicit rule or fallback in prompt/enforcement so the model consistently asks for email when the user doesn’t share a number.

---

**Report generated from:**  
- Document: `tools/docx_extract/document_text.txt`  
- Code: `server/services/chatRules.js`, `server/services/aiModes.js`
