# Local analyzer TCP gateway

Use this gateway when an analyzer is on the lab's LAN and the application API is hosted remotely. One gateway process connects to the single analyzer selected by `GATEWAY_ANALYZER_ID`; to switch analyzers, update the analyzer configuration and/or ID, then restart the gateway. The gateway runs on a PC on the same LAN as the selected analyzer, accepts its TCP connection, and securely forwards received data and connection status to the hosted API. Supported HL7 messages are parsed into analyzer results; the raw message is also retained. A protocol without an implemented parser is retained with an error and does not produce a parsed result.

## 1. Configure the analyzer

- In Machine Integration, add your analyzer or choose **Edit / Use this analyzer** on an existing configuration. Set its actual name, model, protocol, and TCP settings; no analyzer brand is assumed.
- Select TCP mode `SERVER`.
- Set its listening port to the port the device will use to connect to the gateway PC (default `8001`).
- Copy the displayed **Local gateway analyzer ID**. Editing an existing analyzer keeps its ID; adding another analyzer requires updating `GATEWAY_ANALYZER_ID` in `.env.gateway`.
- Keep the analyzer and gateway PC connected to the same router/switch.

## 2. Set the Render secret

Generate a long random token on a trusted machine:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the generated value as `MACHINE_GATEWAY_TOKEN` in the Render backend service's environment variables, then redeploy/restart the service. Use the same token in the local gateway configuration. Do not commit or share this token.

## 3. Configure and run the local gateway

Create `smart lab/backend/.env.gateway` (this file is git-ignored):

```dotenv
GATEWAY_API_URL=https://smart-lab2-1.onrender.com
GATEWAY_ANALYZER_ID=PASTE_THE_ANALYZER_ID_HERE
MACHINE_GATEWAY_TOKEN=PASTE_THE_SAME_RANDOM_TOKEN_HERE
GATEWAY_LISTEN_HOST=0.0.0.0
GATEWAY_LISTEN_PORT=8001
```

From the repository root, run:

```powershell
npm run start:gateway
```

Leave this process running on the lab PC. It does not replace the hosted API.

## 4. Connect the analyzer

- Find the gateway PC's LAN IPv4 address with `ipconfig`.
- Configure the analyzer to connect to that PC address and the gateway listening port (default `8001`).
- Allow inbound TCP traffic on that port in Windows Firewall, limited to the lab's private network.
- Check the gateway console and Machine Integration page. The selected analyzer's status should move from `WAITING FOR ANALYZER` to `CONNECTED` when the device reaches the gateway.

The Render website URL is an HTTP(S) address and is not the analyzer's TCP destination. The analyzer connects to the local gateway PC; only the gateway's HTTPS requests go to Render.
