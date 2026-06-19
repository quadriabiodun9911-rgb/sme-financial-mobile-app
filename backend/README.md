# Quad360 Backend — Pngme Integration

Express API that bridges the Pngme African financial data API with the Quad360 React Native SME app.

## Deploy to Railway

### Prerequisites
- GitHub repository containing this `backend/` folder
- [Railway](https://railway.app) account
- Pngme API key and webhook secret from [app.pngme.com](https://app.pngme.com)

### Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Quad360 backend"
   git push origin main
   ```

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   - Select your repository and set the **Root Directory** to `backend`

3. **Set environment variables** in Railway → your service → **Variables**:
   | Variable | Value |
   |---|---|
   | `PORT` | `3000` (Railway injects `$PORT` automatically — you can omit this) |
   | `PNGME_API_KEY` | Your Pngme API key |
   | `PNGME_WEBHOOK_SECRET` | Your Pngme webhook signing secret |
   | `CORS_ORIGIN` | Your React Native app origin or `*` for development |

4. **Deploy** — Railway auto-deploys on every push to `main`.

5. **Configure Pngme webhook**
   - In the Pngme dashboard, set your webhook URL to:
     `https://<your-railway-domain>/pngme/webhook`
   - Select the `transaction.created` event.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/pngme/webhook` | Receives Pngme transaction events |
| POST | `/api/users` | Register a user with Pngme |
| GET | `/api/users/:userId/connect-url` | Get Pngme widget URL for account linking |
| GET | `/api/transactions/:userId` | List transactions (`?since=ISO_DATE` optional) |

## Local Development

```bash
cp .env.example .env
# Fill in your keys in .env
npm install
npm run dev
```
