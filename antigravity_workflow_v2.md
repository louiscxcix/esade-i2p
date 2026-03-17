# 📋 Antigravity Workflow: Slack → Sheets → Looker Studio → Invoice

> **Assumption:** Google Antigravity is already installed and running.  
> **Pipeline:** Slack → Google Sheets → Looker Studio → Invoice PDF  
> **Last Updated:** March 2026

---

## 🗺️ Workflow Map

```
[Slack #invoices channel]
        ↓  Agent listens for new messages & parses fields
[Google Sheets — invoice_data]
        ↓  Live data connector (auto-refresh)
[Looker Studio — Invoice Report]
        ↓  Filter by invoice_id → Export as PDF
[Invoice PDF → Google Drive]
        ↓  Agent posts confirmation back to Slack
```

---

## PHASE 1 — Connect MCP Servers

MCP (Model Context Protocol) is how Antigravity agents interact with external tools like Slack and Google Sheets. You need to configure two MCP servers before building any agent.

---

### 1.1 Open the MCP Config

In Antigravity:
1. Click the **three-dot menu (⋯)** on any agent panel
2. Select **MCP Servers**
3. Click **View Raw Config** → this opens `mcp_config.json`

Alternatively, open the file directly:
```
~/.antigravity/mcp_config.json   # macOS / Linux
%APPDATA%\Antigravity\mcp_config.json  # Windows
```

---

### 1.2 Add Google Sheets MCP

Paste this block into `mcp_config.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "google-sheets": {
      "command": "uvx",
      "args": ["mcp-google-sheets"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/your/credentials.json"
      }
    }
  }
}
```

**How to get `credentials.json`:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Sheets API** and **Google Drive API**
3. Create a **Service Account** → download the JSON key
4. Share your Google Sheet with the service account email (e.g. `agent@project.iam.gserviceaccount.com`) as **Editor**

---

### 1.3 Add Slack MCP

Add this alongside `google-sheets` in `mcpServers`:

```json
"slack": {
  "command": "uvx",
  "args": ["mcp-slack"],
  "env": {
    "SLACK_BOT_TOKEN": "xoxb-your-token-here",
    "SLACK_CHANNEL_ID": "C0XXXXXXXXX"
  }
}
```

**How to get the Slack Bot Token:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `channels:history` — read messages
   - `chat:write` — post confirmations back
   - `channels:read` — list channels
3. Install app to workspace → copy the **Bot User OAuth Token** (`xoxb-...`)
4. Get **Channel ID**: right-click the channel in Slack → Copy Link → the ID is the last part (e.g. `C0XXXXXXXXX`)

---

### 1.4 Final `mcp_config.json`

```json
{
  "mcpServers": {
    "google-sheets": {
      "command": "uvx",
      "args": ["mcp-google-sheets"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/credentials.json"
      }
    },
    "slack": {
      "command": "uvx",
      "args": ["mcp-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here",
        "SLACK_CHANNEL_ID": "C0XXXXXXXXX"
      }
    }
  }
}
```

Save the file. Restart Antigravity. Verify MCPs appear as active in the MCP Servers panel (green dot).

---

## PHASE 2 — Google Sheet Setup

### 2.1 Create the Sheet

Create a new Google Sheet named **`invoice_data`** and set up **Row 1** as headers exactly as shown:

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| `timestamp` | `slack_channel` | `sender_name` | `client_name` | `service_description` | `quantity` | `unit_price` | `total_amount` | `currency` | `invoice_id` | `status` |

### 2.2 Format Columns

- **Column A** → Format as `Date time` (`YYYY-MM-DD HH:MM:SS`)
- **Columns F, G, H** → Format as `Number` (2 decimal places)
- **Column K** → `Data Validation` → dropdown: `pending`, `reviewed`, `ready`, `sent`, `paid`

### 2.3 Auto Invoice ID Formula (Column J)

In cell `J2`, paste this formula to auto-generate invoice IDs:

```
=IF(D2<>"", "INV-"&TEXT(YEAR(A2),"0000")&"-"&TEXT(COUNTA($J$2:J2),"000"), "")
```

Drag down for all rows. This generates `INV-2026-001`, `INV-2026-002`, etc.

---

## PHASE 3 — Build the Slack Capture Agent

### 3.1 Open Manager Surface

In Antigravity:
- Press **`Cmd + L`** (macOS) or **`Ctrl + L`** (Windows) to open the agent panel
- Switch mode to **`Planning`** (not Fast) — this is critical for multi-step tasks
- Use **`@`** to attach MCP context: type `@slack` and `@google-sheets` to load both MCPs

### 3.2 Save as a Workflow (`/` command)

Before running, save this as a reusable workflow:
1. Type `/` in the prompt bar → select **Save as Workflow**
2. Name it: `slack-to-sheets-capture`

### 3.3 Agent Prompt — Slack Capture

Paste this directly into the Antigravity agent panel:

```
@slack @google-sheets

You are an invoice capture agent for the #invoices Slack channel.

TASK:
1. Read the latest unprocessed messages from the Slack channel with ID: C0XXXXXXXXX
2. For each message, parse these fields:
   - CLIENT → client_name
   - SERVICE → service_description  
   - QTY → quantity (number)
   - UNIT PRICE → unit_price (number)
   - CURRENCY → currency (default: EUR if missing)
3. Calculate: total_amount = quantity × unit_price
4. Record: timestamp = current datetime, slack_channel = "#invoices", sender_name = message author
5. Append a new row to the Google Sheet "invoice_data" with all fields above
6. Leave invoice_id blank (it is auto-calculated by Sheet formula)
7. Set status = "pending"
8. Reply to the original Slack message: "✅ Captured to Sheet | Row [row_number] | Client: [client_name] | Total: [total_amount] [currency]"

VALIDATION RULES:
- If CLIENT, SERVICE, QTY, or UNIT PRICE is missing → reply in Slack: "⚠️ Missing: [field names]. Use the format below and resend." then post the format template.
- If quantity or unit_price is not a number → flag and skip that message

OUTPUT ARTIFACT:
Produce a summary table of all rows appended in this run: invoice_id, client_name, total_amount, status.
```

### 3.4 Expected Slack Message Format

Pin this message in `#invoices` so your team uses it:

```
CLIENT: [company name]
SERVICE: [description of work]
QTY: [number]
UNIT PRICE: [number]
CURRENCY: EUR
```

**Example:**
```
CLIENT: Acme Corp
SERVICE: Process Mining Dashboard — Q1 2026
QTY: 3
UNIT PRICE: 1500
CURRENCY: EUR
```

### 3.5 Verify with Artifacts

After the agent runs, a **Summary Artifact** appears in the Manager Surface. Check:
- Each row has correct data
- `total_amount` = `quantity × unit_price`
- Sheet has the new rows

Leave inline comments on the artifact if corrections are needed — the agent will fix them.

---

## PHASE 4 — Looker Studio Setup

### 4.1 Connect Google Sheets as Data Source

1. Go to [lookerstudio.google.com](https://lookerstudio.google.com) → **Create → Report**
2. Select **Google Sheets** as data connector
3. Choose your `invoice_data` sheet → **Connect**

### 4.2 Set Field Types

| Field | Type | Aggregation |
|---|---|---|
| `timestamp` | Date & Time | — |
| `total_amount` | Number (EUR Currency) | SUM |
| `quantity` | Number | SUM |
| `unit_price` | Number (EUR Currency) | AVG |
| `invoice_id` | Text | Count Distinct |
| `status` | Text | — |
| `client_name` | Text | — |

### 4.3 Enable Auto-Refresh

- **Resource → Manage Data Sources → Edit** your Sheet source
- Set **Data freshness**: `15 minutes`

---

## PHASE 5 — Invoice Report Layout

### 5.1 Page Structure

Build the Looker Studio report with these sections (one page = one invoice view):

**Top Bar — Filters**
```
[ Filter: invoice_id ▼ ]    [ Filter: client_name ▼ ]    [ Date range: timestamp ]
```

**Scorecards Row**
```
[ Total Amount (SUM) ]   [ # Invoices (COUNT) ]   [ Pending Amount (filtered SUM) ]
```

**Invoice Detail Table**

Add a **Table** component with these fields in order:
`invoice_id` · `client_name` · `service_description` · `quantity` · `unit_price` · `total_amount` · `currency` · `status`

Sort: `timestamp` descending.

**Footer (Static Text Box)**
```
Payment due: 30 days from invoice date
Bank: [Your bank details]
Company: [Legal entity name] · VAT: [number]
```

### 5.2 Single-Invoice View (for PDF Export)

1. Set the `invoice_id` filter control to **single select** mode
2. User picks one `invoice_id` → table shows exactly one invoice line
3. **File → Download → PDF** → saves as clean invoice

---

## PHASE 6 — Invoice Generation Agent (Advanced)

This second agent monitors the Sheet for rows marked `status = "ready"` and auto-generates HTML invoices, saves them to Drive, and notifies Slack.

### 6.1 Agent Prompt — Invoice Generator

```
@google-sheets @slack

You are an invoice generation agent.

TRIGGER: Every time you run, check the Google Sheet "invoice_data" for rows where status = "ready".

FOR EACH "ready" row:
1. Read all fields from that row.
2. Generate a clean HTML invoice with:
   - Header: Company name, logo placeholder, Invoice ID, Invoice Date
   - Bill To: client_name
   - Line item table: service_description | quantity | unit_price | total_amount | currency
   - Subtotal, VAT (21%), Total
   - Footer: Payment due 30 days from today, bank details
3. Save the HTML file as [invoice_id].html to Google Drive folder: "Invoices/2026/"
4. Update that row's status from "ready" → "sent"
5. Post to Slack #invoices: "📄 Invoice [invoice_id] for [client_name] → [total_amount] [currency] saved to Drive."

ARTIFACT: Output a log of all invoices generated in this run with: invoice_id, client_name, total_amount, file_path.
```

### 6.2 Run as Background Agent

- In Manager Surface: click **New Agent** → paste prompt above
- Set execution mode to: **Background / Long-running**
- Antigravity will notify you via **Inbox** when the agent completes each batch

---

## PHASE 7 — Status Lifecycle

Track every invoice through this status flow. Update `Column K` in your Sheet manually or via agent:

```
pending   →   reviewed   →   ready   →   sent   →   paid
   ↑                              ↑
Slack capture               Invoice agent
auto-sets this              triggers on this
```

| Status | Meaning | Set By |
|---|---|---|
| `pending` | Captured from Slack, not yet reviewed | Slack Capture Agent |
| `reviewed` | Data verified by you | Manual |
| `ready` | Approved, invoice can be generated | Manual |
| `sent` | Invoice HTML generated and saved to Drive | Invoice Gen Agent |
| `paid` | Payment confirmed | Manual |

---

## PHASE 8 — Saved Workflows (Reuse)

Save these as reusable `/workflows` inside Antigravity so you can trigger them with one command:

| Workflow Name | Trigger | What it does |
|---|---|---|
| `/slack-capture` | On demand or scheduled | Reads #invoices, writes to Sheet |
| `/generate-invoices` | On demand | Processes all "ready" rows → HTML files |
| `/status-report` | On demand | Reads Sheet → posts summary to Slack |

To save: type `/` in the agent panel → **Save as Workflow** → give it a name.  
To run: type `/slack-capture` in any new agent session.

---

## 🐛 Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| MCP shows red dot / inactive | Config JSON syntax error or uvx not installed | Run `pip install uvx` in terminal; validate JSON at jsonlint.com |
| Agent can't find Slack channel | Wrong Channel ID | Right-click channel in Slack → Copy Link → last segment is the ID |
| Sheet not updating | Service account not shared on Sheet | Share `invoice_data` sheet with the service account email as Editor |
| Looker Studio shows old data | Auto-refresh not enabled | Resource → Manage Data Sources → set freshness to 15 min |
| `total_amount` shows as text in Looker | Column H formatted as text in Sheets | Format column H as Number in Google Sheets |
| Invoice ID formula showing error | Formula not dragged down | Drag `J2` formula down to cover all expected rows (e.g. J2:J1000) |

---

## 📁 Google Drive Folder Structure

```
📁 Invoice Automation/
├── 📊 invoice_data              ← Google Sheet (shared with service account)
├── 📊 Looker Studio Report      ← Invoice report (link)
├── 📁 Invoices/
│   └── 📁 2026/
│       ├── INV-2026-001.html
│       ├── INV-2026-002.html
│       └── ...
└── 📁 Antigravity Config/
    ├── mcp_config.json          ← backup copy
    ├── slack-capture.workflow   ← saved workflow
    └── generate-invoices.workflow
```

---

*Stack: Google Antigravity (Manager Surface) · Slack MCP · Google Sheets MCP · Looker Studio*
