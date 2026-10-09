# Smart Lab

Smart Lab is a modular, offline-first laboratory information system (LIS) for patient/sample workflow, analyzer result intake, review, reports, billing and audit history. It is a laboratory automation platform, not a diagnostic system.

## What is implemented

- MongoDB-backed patients, samples, tests, results, analyzers, raw analyzer messages, analyzer results, reports, invoices, reagents and audit events.
- JWT authentication, bcrypt password hashing (including an on-login upgrade from legacy SHA-256 records), server-side role checks and rate-limited login.
- A shared analyzer pipeline: `adapter → protocol parser → normalized result → exact Sample ID match → validation queue → MongoDB`.
- Independent real TCP client, TCP server, RS-232 and USB-serial adapters. Wi-Fi and Ethernet are both TCP/IP network configurations, not separate result logic.
- HL7, ASTM and a documented custom JSON bridge. GP11/manufacturer-specific records are rejected until vendor documentation is supplied.
- Raw-message records, duplicate-message detection, unmatched-result investigation with audit trail, configurable automatic TCP reconnect and Socket.IO status events.
- Pathologist approval, immutable report revisions, real PDF generation and SMTP email delivery when SMTP is configured.

## Run locally

1. Copy `smart lab/backend/.env.example` to `smart lab/backend/.env` and configure MongoDB plus a 32+ character `JWT_SECRET`.
2. Install dependencies once:

   ```powershell
   npm run install:all
   ```

3. Start both applications:

   ```powershell
   npm run dev
   ```

   Frontend: `http://localhost:5173` · backend: `http://localhost:5000`.

To create the first admin safely, set `ADMIN_INITIAL_PASSWORD` and optionally `ADMIN_INITIAL_USERNAME` before the first backend start. Remove `ADMIN_INITIAL_PASSWORD` after account creation. There are no hard-coded live credentials.

## Analyzer setup

1. An administrator creates an analyzer and selects Ethernet, Wi-Fi, RS-232 or USB-serial.
2. Enter its documented endpoint/serial settings, TCP mode and protocol. Do not invent a protocol or send undocumented remote-control commands.
3. Use **Test Connection**. TCP client mode makes a real socket attempt; TCP server mode verifies the LIS listener can bind and reports that it is waiting for the analyzer; serial mode opens the configured port.
4. Select **Connect**. Each analyzer owns an independent adapter; a failing connection does not block the LIS or other analyzers.
5. For a hardware-free demo, use the Simulator. It labels the source as `simulator` but traverses the same production pipeline.

See [ANALYZER_INTEGRATION_GUIDE.md](ANALYZER_INTEGRATION_GUIDE.md) for message contracts and LAN deployment notes.

## Tests and checks

```powershell
Set-Location 'smart lab/backend'
node --test tests/*.test.js
Set-Location ../frontend
npm run build
```

## Safety notes

- A matching Sample ID is required before a result can enter the patient validation queue; unknown results remain unmatched.
- Results are not automatically approved. Approved reports cannot be overwritten; revisions preserve the predecessor and reason.
- A PDF records application-level pathologist approval. A legally qualified cryptographic digital signature or vendor analyzer remote control requires the relevant certificate/SDK and documented interface.
- Core registration, analyzer communication, review, PDF generation and audit storage work on the local network. SMTP/WhatsApp services need external configuration.
