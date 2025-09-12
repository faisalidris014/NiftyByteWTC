# Windows Troubleshooting Companion (WTC) – Product Requirements Document  
**Version:** 2.3 (Draft)  
**Owner:** Faisal Idris (NiftyByte)  
**Editor:** ChatGPT (GPT-5)  
**Last Updated:** 2025-09-11  

---

## 1) What is a “lean PRD”?  
A **lean PRD (Product Requirements Document)** captures only what’s necessary to build and ship an MVP that solves the core problem end-to-end. It’s concise but complete: problem, who it’s for, the smallest set of features, success metrics, guardrails, and a delivery plan.  

---

## 2) Problem Statement  
Non-technical end-users struggle with IT issues (Wi-Fi, printing, app errors, file recovery). Traditional support requires opening tickets, waiting for IT, or searching KBs they don’t understand.  

**Pain points:**  
- High ticket volumes overwhelm IT.  
- Users frustrated with delays.  
- Built-in Windows/Mac troubleshooters too limited.  
- No proactive AI that can both *diagnose and act*.  

**Opportunity:**  
A system tray–based AI troubleshooting companion that can:  
- Run automated local fixes.  
- Walk users through steps with plain language.  
- Escalate to ITSM if unresolved.  
- Log results for IT visibility.  

---

## 3) Product Goals & Non-Goals  

**Goals (MVP):**  
- Simple, tray-accessible chatbot for end-users.  
- Execute pre-approved troubleshooting skills (Wi-Fi, printer, file recovery, app reset).  
- Offline capability (basic local fixes + ticket queueing).  
- ITSM integration (ServiceNow, Jira, Zendesk, Freshservice, Salesforce).  
- Admin Console for skill enable/disable, monitoring, and reporting.  

**Non-Goals (MVP):**  
- Full LLM offline model (use small local logic + optional cloud lookups).  
- Full remote desktop control.  
- Deep OS patch management (reserved for roadmap).  

---

## 4) Personas  

- **End User (Primary):**  
  - Non-technical staff, wants issue fixed fast.  
  - Doesn’t understand KBs or IT jargon.  
  - Prefers chat-style interaction.  

- **IT Service Desk Agent (Secondary):**  
  - Wants reduced ticket load.  
  - Needs context when tickets are escalated.  
  - Sees logs of what AI attempted.  

- **IT Admin / Endpoint Engineer (Secondary):**  
  - Manages deployment, policies, and integrations.  
  - Decides which skills are enabled.  
  - Monitors usage and health via Admin Console.  

---

## 5) Key Use Cases & User Stories (MVP)  

1. **Wi-Fi not connecting**  
   - User: “I can’t connect to Wi-Fi.”  
   - AI: Checks if adapter is toggled off → re-enables → confirms connectivity → logs resolution.  

2. **Recover unsaved Word file**  
   - User: “I lost my document.”  
   - AI: Finds autorecovery path → opens folder → user confirms file → AI guides saving.  

3. **Printer not working**  
   - AI clears print queue, restarts spooler.  

4. **App not launching (Teams/Outlook)**  
   - AI runs safe reset (cache clear, restart).  

5. **Website blocked**  
   - AI recognizes policy → auto-generates ITSM ticket with context.  

---

## 6) Functional Requirements  

- **System Tray Agent**  
  - Lightweight, always-running.  
  - One-click to open chat window.  

- **Chat Interface**  
  - Natural conversation.  
  - File/screenshot upload.  
  - Progress indicators (“Step 2 of 3…”).  

- **Skills**  
  - Packaged modules (PowerShell, shell scripts).  
  - Toggled per org in Admin Console.  

- **Escalation**  
  - Auto-ticket creation when unresolved.  
  - Logs show actions + user confirmations.  

---

## 7) Admin Console (Wireframe UI Description)  

- **Dashboard:**  
  - Org logo + theme (NiftyByte or customer branding).  
  - Key metrics (tickets prevented, top skills used, endpoint health).  

- **Skills Management:**  
  - List of all available skills (Wi-Fi reset, Printer queue clear, etc.).  
  - Toggle on/off (default = off for new skills).  
  - Risk-level labels (low = read-only, medium = config change, high = system restart).  

- **Monitoring:**  
  - Endpoint health (online/offline, version).  
  - Alerts (repeated failures, high CPU usage).  

- **Settings:**  
  - ITSM connectors (ServiceNow, Jira, etc.).  
  - KB connectors (upload service account / KB link).  
  - Branding: upload company logo, select light/dark theme.  

---

## 8) End-User Tray-Side Chat Window (Wireframe UI Description)  

- Opens via tray icon click.  
- Lightweight, resizable window.  
- Elements:  
  - Chat bubbles (AI + user).  
  - Buttons for quick actions (retry, escalate, open settings).  
  - File upload drag-and-drop.  
  - Progress bar for multi-step fixes.  
  - Escalation buttons: *Submit Ticket*, *Request Callback*, *Call IT*.  

---

## 9) Example Conversation Flows  

### Wi-Fi Issue  
**User:** I can’t connect to Wi-Fi.  
**AI:** Checking your adapter… It looks like Wi-Fi was toggled off. I’ve turned it back on. Please select your network.  
**User:** [connects to network]  
**AI:** Great. Running a quick test… Google loads successfully. Wi-Fi is working. Submitting a record of this fix to IT.  

### Word File Recovery  
**User:** I lost my Word doc.  
**AI:** Searching AutoRecovery folder… Found this file: *Doc1[AutoRecovered]*. Please confirm if it’s correct.  
**User:** Yes.  
**AI:** Perfect. Please save it now. I’ll mark this issue as resolved.  

---

## 10) Quick Guide / Training Module  

- **Purpose:** Help IT admins & users understand scope.  
- **Format (MVP):**  
  - 5-min interactive walkthrough inside app (tray chat).  
  - “Try a Wi-Fi fix” demo scenario.  
  - IT Admin view: how to toggle skills, view logs.  
- **Roadmap:**  
  - Short video tutorials.  
  - Printable quick-start PDF.  

---

## 11) First-Run Setup Flow  

- **Purpose:** Allow both individual installs and enterprise deployments.  
- **End-User Install:**  
  - Wizard: Accept EULA → choose language → connect to ITSM (optional) → finish.  
  - Defaults: auto-update enabled, skills disabled until IT enables.  
- **Enterprise Deployment (via SCCM/Intune/Jamf):**  
  - Silent install with config.json pre-seeded (ITSM endpoints, skill defaults, branding).  
  - No end-user setup screens.  
- **UX:**  
  - Simple, 3–4 step wizard if run manually.  
  - Company logo + color scheme visible.  

---

## 12) Localization & Internationalization  

- **MVP:**  
  - English only, UTF-8 support.  
  - Framework supports multi-language strings.  
- **Roadmap:**  
  - Spanish, French, German, Arabic, Mandarin.  
  - Admin Console setting: “Preferred language per org.”  
  - User can override language in tray chat.  
- **AI Chat:**  
  - Cloud lookup (if allowed) uses translation API.  
  - Local skills always presented in selected language.  

---

## 13) Feedback Loop  

- **MVP:**  
  - After each fix, AI asks: *“Did this resolve your issue?”*  
  - User can rate (👍 / 👎) and add comment.  
  - Feedback queued offline if no internet.  
- **Roadmap:**  
  - Admin Console “Feedback Dashboard” with aggregated scores.  
  - Export feedback (CSV/JSON).  
  - AI improvement pipeline uses anonymized feedback.  

---

## 14) Security & Compliance  

- **Data Handling:**  
  - Collect only: machine name, username, skill run, outcome.  
  - No raw file contents or keystrokes.  
- **Encryption:**  
  - AES-256 at rest, TLS 1.3 in transit.  
- **Permissions:**  
  - Standard user mode default.  
  - Elevation only when required (UAC prompt).  
- **Code Signing:**  
  - All binaries signed with NiftyByte cert.  
- **Compliance Roadmap:**  
  - MVP: GDPR-ready.  
  - v1.1+: SOC 2 Type I.  
  - v1.2+: SOC 2 Type II, ISO 27001.  
- **Logging & Audit:**  
  - Immutable logs, accessible by IT admins only.  
- **Offline Behavior:**  
  - All queues encrypted.  

---

## 15) Performance & Resource Footprint  

- **Targets (MVP):**  
  - CPU idle: <1% average.  
  - Memory: ≤150MB baseline.  
  - Disk: ≤500MB installed footprint.  
  - Network: <2MB/hour idle chatter.  
- **Update Strategy:**  
  - Silent differential updates.  
  - Hotfix channel for security issues.  
- **System Impact Controls:**  
  - Battery-aware throttling.  
  - Auto-backoff if CPU >20% sustained.  
  - Configurable logging levels.  
- **Monitoring:**  
  - Admin Console shows per-endpoint footprint.  

---

## 16) Integrations  

- **MVP ITSM:**  
  - ServiceNow, Jira, Zendesk, Freshservice, Salesforce.  
- **MVP KB:**  
  - Service account or KB URL input.  
  - Local search first, then KB lookup.  
- **MVP Comms:**  
  - Escalation via Teams/Slack (open chat/call).  
- **Roadmap:**  
  - Device management (Intune, Jamf, SCCM).  
  - Zoom/Webex/Google Meet call integration.  
  - Outlook add-in (ticket from email).  
  - SDK for custom ITSM connectors.  

---

## 17) Analytics & Reporting  

- **MVP Dashboards:**  
  - Top 5 auto-resolved issues.  
  - % resolved locally vs escalated.  
  - MTTR improvement (AI vs manual).  
  - Ticket counts + savings.  
  - User satisfaction scores.  
- **Export:** CSV/Excel.  
- **Roadmap:**  
  - Trends over time.  
  - Predictive insights.  
  - Benchmarks across departments.  
- **Data Handling:**  
  - Aggregated/anonymized only.  

---

## 18) Licensing & Pricing Model  

- **MVP:**  
  - Free pilot licenses.  
- **Options:**  
  - Per endpoint.  
  - Per user.  
  - Enterprise flat fee.  
  - Hybrid models possible.  
- **Roadmap:**  
  - Volume discounts.  
  - Annual billing incentives.  
  - Freemium tier (basic skills free, advanced paid).  
  - SLA-based enterprise bundles.  
- **Risks:**  
  - Pricing resistance → mitigate with flexible pilots.  

---

## 19) Extensibility / Skills SDK  

- **MVP:**  
  - Built-in skills only.  
  - Toggled on/off by IT admins.  
- **Roadmap:**  
  - Skills defined in JSON + script (PowerShell/shell).  
  - Metadata: name, description, risk, version.  
  - Admin upload custom skills (sandboxed).  
  - SDK for Python/PowerShell/JS wrappers.  
  - APIs for OS, ITSM, KB, UI prompts.  
- **Future (v2.0+):**  
  - Marketplace of vetted skills.  
  - Enterprises whitelist before deployment.  
- **Governance:**  
  - Signed skills, sandboxed execution.  
  - Risk levels labeled.  

---

## 20) Offline Mode  

- **MVP:**  
  - Local skills work offline (Wi-Fi reset, file recovery, printer, OS checks).  
  - Tickets + feedback queued locally (encrypted).  
  - User informed: *“Ticket will be submitted once you’re back online.”*  
- **Roadmap:**  
  - KB offline cache (most-viewed articles).  
  - Pre-pushed remediation bundles.  
- **Sync Logic:**  
  - Queue capped (50MB logs, 20 tickets).  
  - Auto-retry when online.  
  - Admin Console shows queue status.  
- **UX:**  
  - Offline banners in chat.  
  - Sync confirmations once submitted.  

---

## 21) Update & Release Cadence  

- **MVP:**  
  - Monthly stable releases.  
  - Optional pilot channel (early adopters).  
  - Hotfixes outside cycle for security/critical bugs.  
- **Roadmap:**  
  - Long-Term Support (LTS) builds for regulated orgs.  
  - Admin policy: auto vs manual approval.  
- **Release Communication:**  
  - Notes shown in Admin Console.  
  - Optional “What’s New” banner in tray chat.  
- **Rollback:**  
  - Keep last 2 builds cached.  
  - Admin Console option to rollback.  

---

## 22) Monitoring & Alerting  

- **MVP:**  
  - Endpoint health dashboard.  
  - Online/offline, version, last check-in.  
  - Queue status (tickets waiting offline).  
  - Alerts for failed troubleshooting attempts.  
- **Roadmap:**  
  - Custom alert rules.  
  - SIEM integrations (Splunk, Sentinel).  
  - Teams/Slack/email notifications.  
  - Predictive insights.  
- **UX:**  
  - Admin Console “at a glance” health indicators (green/yellow/red).  

---

## 23) Deployment Models  

- **MVP:**  
  - **Agent-only**: Windows 10/11 desktop client.  
  - **Config:** ITSM endpoints + skill toggles via Admin Console or config.json.  
  - **Cloud optional:** for KB lookups, AI enhancements (toggle in settings).  
- **Roadmap:**  
  - **Hybrid Cloud Service:**  
    - Centralized reporting, cross-org benchmarking.  
    - Cloud-based policy sync (multi-tenant).  
  - **Mac Agent:** macOS support (Intel + M1/M2).  
  - **Linux Agent (v2.0):** For developer-heavy orgs.  
  - **Tenant Isolation:** Each customer gets logically isolated data plane.  
- **Enterprise Packaging:**  
  - MSI for Windows.  
  - PKG for macOS.  
  - Silent install flags for SCCM/Intune/Jamf.  

---

## 24) Non-Functional Requirements  

- Agent idle CPU <1%, RAM ≤150MB.  
- Updates apply <5 mins.  
- Offline queue encrypted.  
- Rollback always available.  
- Logs immutable, tamper-proof.  
- Multi-language UI framework-ready.  

---

## 25) Telemetry & Success Metrics  

- **MVP KPIs:**  
  - ≥45% self-serve rate on covered issues.  
  - ≥90% ticket/feedback sync within 24h.  
  - ≥95% endpoints on latest release within 30 days.  
  - User satisfaction ≥4/5 on resolved chats.  
- **Roadmap KPIs:**  
  - MTTR reduced ≥30%.  
  - ≥2 org-specific custom skills created with SDK in first 6 months.  

---

## 26) Packaging & Deployment  

- MSI/PKG installers.  
- Supports Intune/SCCM/Jamf push.  
- Config.json for pre-seeding endpoints + branding.  
- Offline cache + queue pre-configured.  

---

## 27) UX Requirements  

- Dark mode + light mode.  
- Branding with company logo.  
- Tray chat: simple, conversational, accessible.  
- Admin Console: toggle-based controls, risk-level labels.  
- Feedback prompts always optional, 1-click.  

---

## 28) Skill Specs (MVP)  

- Wi-Fi adapter toggle & reset.  
- Printer queue clear & spooler restart.  
- Word/Excel file autorecovery locator.  
- App cache reset (Teams, Outlook).  
- Disk space check + cleanup suggestions.  
- Browser test (Google + Outlook).  

---

## 29) Roadmap (90-Day MVP)  

- **Week 4:** Tray app + basic chat.  
- **Week 6:** Skills (Wi-Fi, printer, file recovery).  
- **Week 8:** Offline queue (tickets, feedback).  
- **Week 10:** ITSM integration (ServiceNow + Jira).  
- **Week 12:** Admin Console, monitoring dashboard, basic reporting.  
- MVP ready for pilot.  

---

## 30) Risks & Mitigations  

- **Risk:** End-users expect AI to solve everything.  
  - *Mitigation:* Training module + clear boundaries.  
- **Risk:** Alert fatigue for IT.  
  - *Mitigation:* Minimal curated alerts at launch.  
- **Risk:** Poor custom skills break systems.  
  - *Mitigation:* Sandbox, risk labels, admin approval.  
- **Risk:** Enterprises reject auto-updates.  
  - *Mitigation:* Manual approval + rollback.  

---

## 31) Acceptance Criteria (MVP)  

- Tray agent runs on Windows 10/11.  
- 4–5 core troubleshooting skills functional.  
- Offline queue works (encrypted, auto-sync).  
- Tickets integrate into at least 2 ITSM platforms.  
- Admin Console shows skill toggles + endpoint health.  
- Monitoring alerts visible in console.  

---

## 32) Open Questions  

1. Should offline KB cache be admin-defined (which articles)?  
2. Should rollback be admin-only, or allow local power users?  
3. Should queued tickets expire after 7 days?  
4. Should MVP include email alerts, or Admin Console only?  
5. Should monitoring data be exportable at MVP, or deferred?  
6. Should SDK allow compiled modules or scripts only?  
7. Should Skill Store be NiftyByte-only or open to partners?  
8. Should release notes be localized in MVP?  
9. Should per-department update channels be supported?  

---

## 33) Glossary  

- **Skill:** Predefined troubleshooting action (e.g., Wi-Fi reset).  
- **Admin Console:** IT dashboard for managing skills, monitoring, and reporting.  
- **Offline Queue:** Local encrypted cache of tickets/feedback waiting for sync.  
- **ITSM:** IT Service Management platform (ServiceNow, Jira, Zendesk, etc.).  
- **SIEM:** Security Information & Event Management (Splunk, Sentinel).  
- **SDK:** Software Development Kit for building custom skills.  
- **LTS:** Long-Term Support release (bugfix-only).  

---

## 34) Appendix – Future Skills (Backlog)  

- VPN diagnostics.  
- Antivirus status + update check.  
- OS patch verification.  
- Email client repair (Outlook profile reset).  
- Browser reset.  
- Remote log collection.  
- System restore point management.  

---

## 35) Developer Appendix – MVP Build Guide

### 35.1 System Architecture (Textual Diagram)

\[Tray App UI]  ⇄  \[Local Skills Engine]  ⇄  \[Offline Queue + Local Store]
│                          │                          │
│                          │                          │
\[End User]                 \[Scripts/Skills]          \[Encrypted SQLite DB]
│                          │                          │
└────────────→ \[Admin Console] ←─────────────┐
│
\[ITSM & KB Connectors]

**Components:**
- **Tray App UI**: Electron or WinUI-based, system tray agent, chat interface.
- **Skills Engine**: Executes packaged troubleshooting skills (PowerShell, batch, shell).
- **Offline Queue**: SQLite or LiteDB for local ticket/feedback storage.
- **Admin Console**: Webview or desktop UI for IT admins to manage skills, settings, monitoring.
- **Connectors**: REST-based adapters for ServiceNow, Jira, Zendesk, Freshservice, Salesforce.

---

### 35.2 Inter-Component Interfaces

- **Tray App ⇄ Skills Engine**  
  - IPC (inter-process communication) via JSON messages.  
  - Example request:  
    ```json
    { "action": "run_skill", "skill_id": "wifi_reset", "params": {} }
    ```  
  - Example response:  
    ```json
    { "status": "success", "output": "Wi-Fi adapter re-enabled" }
    ```

- **Skills Engine ⇄ ITSM Connectors**  
  - REST API with service account credentials.  
  - JSON body for ticket creation:  
    ```json
    {
      "summary": "Wi-Fi connectivity issue",
      "description": "Resolved by AI agent: adapter reset + confirmed browsing",
      "user": "jane.doe@corp.com",
      "outcome": "success"
    }
    ```

- **Skills Engine ⇄ Offline Queue**  
  - Local DB API:  
    - `enqueue_ticket(json_blob)`  
    - `dequeue_ticket()`  
    - `list_pending_tickets()`

---

### 35.3 Skill Package Schema (Draft)

Each skill = JSON metadata + script payload.

**Example (Wi-Fi Reset):**
```json
{
  "id": "wifi_reset",
  "name": "Wi-Fi Adapter Reset",
  "description": "Checks if Wi-Fi adapter is disabled and re-enables it",
  "os": ["windows"],
  "risk_level": "medium",
  "requires_admin": true,
  "script": "wifi_reset.ps1",
  "version": "1.0.0"
}

Scripts stored in `/skills/` folder, sandboxed execution, logs captured.

### 35.4 Test Cases (Acceptance)

* **Wi-Fi Adapter Off**

  * Setup: Disable Wi-Fi adapter.
  * Input: User types “I can’t connect to Wi-Fi.”
  * Expected: AI detects adapter off, re-enables, confirms browsing, logs success.

* **Word Recovery**

  * Setup: Unsaved Word doc open, crash simulation.
  * Input: User types “I lost my document.”
  * Expected: AI finds file in autorecovery folder, prompts user, logs outcome.

* **Printer Queue**

  * Setup: Blocked print job.
  * Input: User types “My printer isn’t working.”
  * Expected: AI clears spooler, confirms queue empty.

---

### 35.5 Suggested Tech Stack (MVP)

* **Tray App UI**: Electron (cross-platform), or WinUI 3 (Windows-only MVP).
* **Skills Engine**: PowerShell (Windows), bash (Mac/Linux).
* **Offline Queue**: SQLite (with AES encryption).
* **Admin Console**: React (webview inside Electron), or WinUI dashboard.
* **Connectors**: REST API clients in Node.js or Python.
* **Updates**: Differential update mechanism (e.g., Squirrel for Electron).

---

### 35.6 MVP Delivery Plan (Dev Focus)

* **Sprint 1:** Tray App scaffolding (chat UI).
* **Sprint 2:** Skills Engine + Wi-Fi reset skill.
* **Sprint 3:** Offline queue + ticket creation.
* **Sprint 4:** ITSM integration (ServiceNow).
* **Sprint 5:** Admin Console basics (toggle skills, health dashboard).
* **Sprint 6:** Monitoring/alerting + packaging for pilot.

---