## Current Structure (Modular)

`src/` is now split for easier maintenance:

- `Code.gs`: legacy placeholder
- `Config.gs`: shared CONFIG (reads from env-style file)
- `Env.gs`: private keys/settings (gitignored)
- `Env.example.txt`: template for `Env.gs`
- `AppEntry.gs`: menu, init, triggers, dashboard entrypoints
- `SelectionService.gs`: send mail + manual payment update flow
- `PairingService.gs`: rank pairing logic
- `DataService.gs`: form response parsing + weekly data
- `PaymentService.gs`: PayOS/payment request/webhook flow
- `CountService.gs`: selection count + dedup logs
- `CommonService.gs`: shared helpers
- `Template.html`: dashboard UI
# GatherEasy đŸ"©

GatherEasy is a lightweight automation tool built using **Google Apps Script** that helps you send personalized emails to Google Form respondents.  
It allows you to filter recipients (e.g., selected candidates vs. non-selected) and send customized **Congratulations** or **Feedback** emails directly from your Google Sheets responses.  

---

## ✨ Features

- đŸ"Š **Google Forms Integration** – Automatically fetches responses from linked Google Sheets.  
- đŸ"© **Bulk Emailing** – Send personalized emails to multiple users with a single click.  
- đŸŽ¨ **Custom HTML Templates** – Professional email formatting using an HTML file (`Template.html`).  
- ✅ **Selective Messaging** – Choose who gets a "Congrats" email and who receives feedback.  
- ⚡ **Google Apps Script Powered** – No external servers or dependencies required.  

---

## đŸ"' Project Structure

GatherEasy/
│── src/
│ ├── Code.gs
│ └── Template.html # Email template
│
│── docs/
│ ├── screenshots/ 
│ └── flowchart.png 
│
│── README.md
│── .gitignore


## 🛠 Prerequisites
- A Google account.
- A Google Form linked to a Google Sheet (**Responses → Create spreadsheet**).
- Basic familiarity with Google Apps Script.

---

## đŸš€ Setup (Form → Script)

1. **Create / open** your Google Form.  
2. Click **Responses → Link to Sheets** (green Sheets icon) to create/open the responses spreadsheet.
3. In the Google Sheet, go to **Extensions → Apps Script**.
4. Create two files in the Apps Script editor:
   - `Code.gs` → paste your Apps Script backend.
   - `Template.html` → paste your email HTML (simple text-style version).
5. **Install trigger (one-time):**
   - In the toolbar function dropdown, select `installTriggers`, then click **Run ▶**.
   - Approve the OAuth permission prompts.
6. **Test:**
   - Submit the form.
   - You (owner) and the submitter should receive emails (if your script is configured to send both).

> đŸ"Ž Tip: Open **Executions** (left sidebar) to view logs and errors during testing.

---

## đŸ"§ How Email Address is Determined

The script supports two modes:

1) **Verified Emails (Form setting)**  
   - Form → **Settings → Responses → Collect email addresses → Verified**  
   - Script uses `getRespondentEmail()` internally.

2) **Required "Email" Question**  
   - Add a question titled **Email** (Short answer, Required).  
   - Script scans responses for a question containing "email" and uses that answer.

> Ensure only **one** email-capturing method is active to avoid confusion.

---

## đŸ"¨ Conditional Sending (Congrats / Feedback)

If you want to manually choose who gets which email:

1. In your **responses sheet**, add a column named `Category` (or `Status`).
2. Fill it per row with either `Congrats` or `Feedback`.
3. Create two additional template files (optional, if you want different HTML):
   - `CongratsTemplate.html`
   - `FeedbackTemplate.html`
4. Add a function (e.g., `sendConditionalEmails`) that reads the sheet and sends emails based on `Category`.

> You can run `sendConditionalEmails` manually from the script editor, or add a custom menu to Sheets to trigger it.

---

## 🧩 Usage Notes

- **Daily Quota:** Free Gmail has ~500 recipients/day (Workspace varies). The code reads remaining quota via `MailApp.getRemainingDailyQuota()`.
- **Sender Name / Reply-To:** Configure in the `params` object in `onFormSubmit()`.
- **Template Variables:** The template is rendered via `HtmlService`.  
  You can pass values like `formTitle`, `formURL`, `responsesTable`, `submitterEmail`, etc.

---------------------------------------------------------------------------------------------------------------------------------------------------
