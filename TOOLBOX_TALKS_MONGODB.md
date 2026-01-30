# Toolbox talks & alerts persistence (MongoDB)

Toolbox talks and alerts are stored **in memory** by default. On Vercel serverless, each request can hit a different instance, so in-memory data is lost and items appear then disappear when you switch tabs (Control ↔ History).

**Fix:** Add **MongoDB** so both toolbox talks and alerts persist.

---

## Step-by-step setup

### 1. Get a MongoDB URI

- Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier), or  
- Reuse the same URI you use for sara-alert-clean if you have one  

Example format: `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/sara-alert`

### 2. Add the variable in Vercel

1. Go to [Vercel Dashboard](https://vercel.com) → your **Sara-alert-backend** project (the one that deploys `backend-pi-wheat-15.vercel.app`).
2. Open **Settings** → **Environment Variables**.
3. Click **Add** (or **Add New**).
4. **Name:** `MONGODB_URI`  
   **Value:** your full connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/sara-alert`).
5. Choose **Production** (and optionally Preview/Development if you use them).
6. Click **Save**.

### 3. Redeploy the backend

1. In the same project, go to **Deployments**.
2. Open the **⋯** menu on the latest deployment.
3. Click **Redeploy** and confirm.

Wait for the redeploy to finish. No code change is required in the repo for this step if the backend already supports MongoDB (it does).

### 4. Verify

- In the app, create a toolbox talk or trigger an alert, then switch between **Control** and **History** a few times. They should stay visible.
- If something fails, check **Vercel** → your backend project → **Logs** (Runtime Logs) for errors (e.g. MongoDB connection or auth).

---

After `MONGODB_URI` is set and the backend is redeployed, toolbox talks and alerts are stored in MongoDB and persist across requests and tab switches.
