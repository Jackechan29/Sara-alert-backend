# Toolbox talks persistence (MongoDB)

Toolbox talks are stored **in memory** by default. On Vercel serverless, each request can hit a different instance, so in-memory data is lost and talks appear then disappear.

**Fix:** Add **MongoDB** so talks persist.

1. **Get a MongoDB URI**  
   - Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier)  
   - Or reuse the same URI you use for sara-alert-clean if you have one

2. **Add it in Vercel**  
   - Vercel → your **backend** project → **Settings** → **Environment Variables**  
   - Add: **Name** `MONGODB_URI`, **Value** your connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/sara-alert`)  
   - Save

3. **Redeploy**  
   - Deployments → latest → ⋯ → **Redeploy**

After that, toolbox talks will be stored in MongoDB and will persist across requests and reloads.
