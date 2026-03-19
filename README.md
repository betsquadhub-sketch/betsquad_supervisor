# BetSquad Supervisor

Dashboard amministratore per monitorare l'app BetSquad.

## Funzionalità

- 💰 Saldo POL sullo smart contract
- 📥 Totale depositato (ultimi 10k blocchi)
- 📤 Totale prelevato (ultimi 10k blocchi)
- 🎲 Numero scommesse totali
- 👥 Utenti registrati
- 📊 Info contratto (owner, commissione, network)

## Setup

```bash
npm install
npm start
```

## Configurazione

Modifica `.env` per cambiare:
- `EXPO_PUBLIC_BACKEND_URL` - URL backend BetSquad
- `EXPO_PUBLIC_CONTRACT_ADDRESS` - Indirizzo smart contract
- `EXPO_PUBLIC_POLYGON_RPC` - RPC Polygon

## Build APK

Pusha su GitHub e GitHub Actions builderà automaticamente l'APK.
