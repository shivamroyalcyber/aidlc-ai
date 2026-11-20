---
inclusion: always
---
# Product: BridgeX

BridgeX is a serverless integration gateway that connects legacy SOAP/XML systems with modern REST/JSON applications in both directions, without changing either side. Tagline: "Connecting Legacy Systems to the Modern World."

- Demo domain: a bank. A simulated SOAP Core Banking System (balance, transaction history, fund transfer) and a simulated REST FinTech credit-score API.
- Users: integration developers (configure mappings), app developers (call JSON or SOAP), operations engineers (monitor), legacy system owners (keep systems and credentials unchanged).
- Built for a same-day hackathon with AWS judges. Favour a working end-to-end demo over breadth.
- Requirements and decisions: `aidlc/spaces/default/intents/261120-bridgex-mvp/inception/`.

Out of scope for the MVP: WSDL discovery, SOAP 1.2, MTOM, WS-Security signatures, OAuth/JWT clients, GraphQL, drag-and-drop mapping UI, CI/CD pipeline.
