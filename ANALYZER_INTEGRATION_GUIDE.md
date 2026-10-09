# Analyzer integration guide

## Before connecting medical equipment

Obtain the manufacturer’s interface manual and confirm the analyzer model, firmware, connection type, TCP role, framing, character set, ACK requirements, patient/sample identifier field and licensed LIS interface. Do not transmit Start/Stop or any undocumented command to an analyzer.

## Configuration choices

| Analyzer interface | Smart Lab connection type | Required configuration |
| --- | --- | --- |
| Wired TCP/IP | Ethernet / LAN | Analyzer IP, LIS bind IP, port, TCP client/server role, protocol |
| Wireless TCP/IP | Wi-Fi / WLAN | Same TCP configuration; wireless is only the physical LAN transport |
| RS-232 | RS-232 | COM path, baud rate, data bits, stop bits, parity, documented protocol |
| USB-to-serial | USB / USB-Serial | Operating-system COM path and the serial settings above |

TCP server mode means Smart Lab listens on the configured LIS interface/port and waits. It cannot prove an analyzer is connected until the analyzer actually opens the socket. TCP client mode makes a real outbound socket probe and reconnects according to the configured interval.

## Protocols

### HL7

The built-in parser accepts `MSH`, `PID`, `OBR` and one or more `OBX` segments. It supports normal segment separators and MLLP (`VT ... FS CR`) framing. Sample ID comes from `OBR-3` (falling back to `PID-3`); results come from `OBX-3/5/6/7/8/14`. HL7 acknowledgements are generated only for configured HL7 connections and can be disabled with `protocolOptions.send_ack=false`.

### ASTM

The parser handles common `H`, `P`, `O`, `R` and `L` records, including STX/EOT framed batches. It uses the order record’s sample identifier and result record test/value/unit/range/flag fields. Vendor ASTM profiles can vary; validate with a de-identified capture before production.

### Custom/vendor protocol

`CUSTOM` is not a guessed vendor protocol. It accepts only the explicit bridge payload below after a documented vendor adapter has translated the original data:

```json
{
  "sampleId": "LAB-20261008-0001",
  "patientId": "P123",
  "results": [
    {"testCode":"GLU", "testName":"Glucose", "resultValue":"95", "unit":"mg/dL", "referenceRange":"70-99", "abnormalFlag":"N"}
  ]
}
```

`GP11` and `MANUFACTURER_SPECIFIC` deliberately fail with “protocol specification required” until a manufacturer-verified parser is registered. This prevents unsafe result guessing.

## Add a new analyzer

1. Add its configuration in the Admin UI.
2. Reuse `TcpClientAdapter`, `TcpServerAdapter` or `SerialAdapter` if the transport is documented.
3. Add a parser under `backend/machineIntegration/parsers/`, then register it in `protocolRegistry.js`.
4. Return the parser contract: `patientId`, `sampleId`, optional `barcode/orderId`, and `parameters` keyed by test code. Each parameter requires `testName`, `value`, `unit`, `referenceRange`, `abnormalFlag` and optional `resultDateTime`.
5. Add de-identified parser and framing tests. Do not add a second result persistence path—the shared service handles normalization, matching, audit and validation.

## Local gateway

For a network-restricted LIS deployment, run the bundled gateway on the LAN-connected host after setting `GATEWAY_API_URL`, `GATEWAY_ANALYZER_ID`, `MACHINE_GATEWAY_TOKEN`, `GATEWAY_LISTEN_HOST` and `GATEWAY_LISTEN_PORT` in `backend/.env.gateway`. The gateway forwards raw data through the same protected backend pipeline; use a separate 32+ character token and keep it off the frontend.
