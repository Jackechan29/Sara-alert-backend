const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

// MongoDB for toolbox talks (optional – only load when MONGODB_URI is set to avoid Vercel crash)
let mongoClient = null;
let mongoDb = null;
async function getDb() {
  if (mongoDb) return mongoDb;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) return null;
  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    let dbName = 'sara-alert';
    try {
      const withoutQuery = uri.split('?')[0];
      const parts = withoutQuery.split('/').filter(Boolean);
      if (parts.length > 0) dbName = parts[parts.length - 1];
    } catch (_) {}
    mongoDb = mongoClient.db(dbName);
    console.log('MongoDB connected for toolbox talks');
    return mongoDb;
  } catch (e) {
    console.warn('MongoDB not available, toolbox talks in-memory only:', e.message);
    return null;
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Simple tRPC-like endpoint for compatibility
app.get('/api/trpc/example.hi', (req, res) => {
  res.json({ result: { data: "Hello from tRPC!" } });
});

// In-memory storage (in production, use a real database)
let sites = [];
let users = [];
let alerts = [];
let toolboxTalks = [];

// Generate a short site code (5 characters)
const generateSiteCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Routes

// Get all sites (MongoDB if MONGODB_URI set, else in-memory)
app.get('/api/sites', async (req, res) => {
  try {
    const db = await getDb();
    if (db) {
      const list = await db.collection('sites').find({}).sort({ createdAt: 1 }).toArray();
      return res.json(list.map(({ _id, ...s }) => s));
    }
    res.json(sites);
  } catch (e) {
    console.error('GET sites error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create a new site (MongoDB if MONGODB_URI set, else in-memory)
app.post('/api/sites', async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    const managerId = body.managerId != null ? String(body.managerId) : '';
    if (!name || !managerId) {
      return res.status(400).json({ error: 'Name and managerId are required' });
    }
    const newSite = {
      id: generateId(),
      name,
      siteCode: generateSiteCode(),
      createdAt: Date.now(),
      managerId,
      companyId: 'default-company'
    };
    const db = await getDb();
    if (db) {
      await db.collection('sites').insertOne(newSite);
      return res.json(newSite);
    }
    sites.push(newSite);
    res.json(newSite);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : (e != null && typeof e.toString === 'function' ? e.toString() : 'Unknown error');
    console.error('POST /api/sites error:', errMsg, e);
    res.status(500).json({ error: 'Failed to create site', message: errMsg });
  }
});

// Get site by code (MongoDB if set, else in-memory)
app.get('/api/sites/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const db = await getDb();
    if (db) {
      const site = await db.collection('sites').findOne({ siteCode: code.toUpperCase() });
      if (!site) return res.status(404).json({ error: 'Site not found' });
      const { _id, ...s } = site;
      return res.json(s);
    }
    const site = sites.find(s => s.siteCode === code.toUpperCase());
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (e) {
    console.error('GET site by code error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get site by ID (MongoDB if set, else in-memory)
app.get('/api/sites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (db) {
      const site = await db.collection('sites').findOne({ id });
      if (!site) return res.status(404).json({ error: 'Site not found' });
      const { _id, ...s } = site;
      return res.json(s);
    }
    const site = sites.find(s => s.id === id);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (e) {
    console.error('GET site by id error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Join a site (MongoDB if MONGODB_URI set, else in-memory) – registers worker/visitor so counter works
app.post('/api/sites/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, role } = req.body || {};
    if (!userId || !userName || !role) {
      return res.status(400).json({ error: 'userId, userName, and role are required' });
    }
    const db = await getDb();
    if (db) {
      const site = await db.collection('sites').findOne({ id });
      if (!site) return res.status(404).json({ error: 'Site not found' });
      const userDoc = {
        id: userId,
        name: String(userName),
        role: String(role),
        siteId: id,
        acknowledged: false,
        needsHelp: false,
        lastActive: Date.now()
      };
      await db.collection('users').updateOne(
        { id: userId },
        { $set: userDoc },
        { upsert: true }
      );
      const { _id, ...s } = site;
      return res.json({ success: true, site: s });
    }
    const site = sites.find(s => s.id === id);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const existingUser = users.find(u => u.id === userId);
    if (existingUser) {
      existingUser.siteId = id;
      existingUser.name = userName;
      existingUser.role = role;
      existingUser.lastActive = Date.now();
    } else {
      users.push({
        id: userId,
        name: userName,
        role,
        siteId: id,
        acknowledged: false,
        needsHelp: false,
        lastActive: Date.now()
      });
    }
    res.json({ success: true, site });
  } catch (e) {
    console.error('POST join site error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get all users (MongoDB if set, else in-memory)
app.get('/api/users', async (req, res) => {
  try {
    const db = await getDb();
    if (db) {
      const list = await db.collection('users').find({}).toArray();
      return res.json(list.map(({ _id, ...u }) => u));
    }
    res.json(users);
  } catch (e) {
    console.error('GET users error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create or update user (MongoDB if set, else in-memory)
app.post('/api/users', async (req, res) => {
  try {
    const { id, name, role, siteId } = req.body || {};
    if (!id || !name || !role) {
      return res.status(400).json({ error: 'id, name, and role are required' });
    }
    const userDoc = {
      id,
      name,
      role,
      siteId: siteId || null,
      acknowledged: false,
      needsHelp: false,
      lastActive: Date.now()
    };
    const db = await getDb();
    if (db) {
      await db.collection('users').updateOne(
        { id },
        { $set: userDoc },
        { upsert: true }
      );
      return res.json(userDoc);
    }
    const existingUser = users.find(u => u.id === id);
    if (existingUser) {
      existingUser.name = name;
      existingUser.role = role;
      existingUser.siteId = siteId || null;
      existingUser.lastActive = Date.now();
      res.json(existingUser);
    } else {
      users.push({ ...userDoc });
      res.json(userDoc);
    }
  } catch (e) {
    console.error('POST users error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get user by ID (MongoDB if set, else in-memory)
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (db) {
      const user = await db.collection('users').findOne({ id });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { _id, ...u } = user;
      return res.json(u);
    }
    const u = users.find(u => u.id === id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(u);
  } catch (e) {
    console.error('GET user error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get site users (MongoDB if set, else in-memory) – used for personnel counter
app.get('/api/sites/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (db) {
      const list = await db.collection('users').find({ siteId: id }).toArray();
      return res.json(list.map(({ _id, ...u }) => u));
    }
    const siteUsers = users.filter(u => u.siteId === id);
    res.json(siteUsers);
  } catch (e) {
    console.error('GET site users error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Send alert (MongoDB if MONGODB_URI set, else in-memory)
app.post('/api/alerts', async (req, res) => {
  try {
    const { siteId, type, userId } = req.body;
    if (!siteId || !type || !userId) {
      return res.status(400).json({ error: 'siteId, type, and userId are required' });
    }
    const newAlert = {
      id: generateId(),
      siteId,
      type,
      userId,
      timestamp: Date.now(),
      active: true,
      date: new Date().toISOString().split('T')[0]
    };
    const db = await getDb();
    if (db) {
      await db.collection('alerts').updateMany(
        { siteId, active: true },
        { $set: { active: false } }
      );
      await db.collection('alerts').insertOne(newAlert);
      return res.json(newAlert);
    }
    alerts = alerts.map(alert => {
      if (alert.siteId === siteId && alert.active) return { ...alert, active: false };
      return alert;
    });
    alerts.push(newAlert);
    res.json(newAlert);
  } catch (e) {
    console.error('POST alerts error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get all alerts (MongoDB if MONGODB_URI set, else in-memory)
app.get('/api/alerts', async (req, res) => {
  try {
    const db = await getDb();
    if (db) {
      const list = await db.collection('alerts').find({}).sort({ timestamp: -1 }).toArray();
      return res.json(list.map(({ _id, ...a }) => a));
    }
    res.json(alerts);
  } catch (e) {
    console.error('GET alerts error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get site alerts (MongoDB if MONGODB_URI set, else in-memory)
app.get('/api/sites/:id/alerts', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (db) {
      const siteAlerts = await db.collection('alerts').find({ siteId: id }).sort({ timestamp: -1 }).toArray();
      return res.json(siteAlerts.map(({ _id, ...a }) => a));
    }
    const siteAlerts = alerts.filter(a => a.siteId === id);
    res.json(siteAlerts);
  } catch (e) {
    console.error('GET site alerts error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Acknowledge alert
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const { userId, needsHelp } = req.body;
  
  const user = users.find(u => u.id === userId);
  if (user) {
    user.acknowledged = true;
    user.needsHelp = needsHelp || false;
  }
  
  res.json({ success: true });
});

// Toolbox talks - GET by site (MongoDB if MONGODB_URI set, else in-memory)
app.get('/api/toolbox-talks', async (req, res) => {
  try {
    const siteId = req.query.siteId;
    if (!siteId) {
      return res.status(400).json({ error: 'Missing required parameter: siteId' });
    }
    const db = await getDb();
    if (db) {
      const talks = await db.collection('toolboxTalks').find({ siteId }).sort({ timestamp: -1 }).toArray();
      return res.json(talks.map(({ _id, ...t }) => t));
    }
    const talks = toolboxTalks.filter(t => t.siteId === siteId);
    talks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json(talks);
  } catch (e) {
    console.error('GET toolbox-talks error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Toolbox talks - POST create (MongoDB if MONGODB_URI set, else in-memory)
app.post('/api/toolbox-talks', async (req, res) => {
  try {
    const { siteId, type, message } = req.body;
    if (!siteId || !type || !message) {
      return res.status(400).json({ error: 'Missing required fields: siteId, type, message' });
    }
    const newTalk = {
      id: `talk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      siteId,
      type,
      message,
      timestamp: Date.now(),
      isActive: true,
      acknowledgedBy: [],
      createdBy: siteId,
      createdAt: new Date().toISOString()
    };
    const db = await getDb();
    if (db) {
      await db.collection('toolboxTalks').insertOne(newTalk);
      return res.json({ success: true, id: newTalk.id, ...newTalk, message: 'Toolbox talk created' });
    }
    toolboxTalks.push(newTalk);
    res.json({ success: true, id: newTalk.id, ...newTalk, message: 'Toolbox talk created' });
  } catch (e) {
    console.error('POST toolbox-talks error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    sites: sites.length,
    users: users.length,
    alerts: alerts.length,
    toolboxTalks: toolboxTalks.length
  });
});

// Initialize sample sites (for Vercel deployment)
app.post('/api/init-samples', (req, res) => {
  if (sites.length === 0) {
    initializeSampleSites();
    res.json({ success: true, message: 'Sample sites initialized', sites: sites.length });
  } else {
    res.json({ success: true, message: 'Sample sites already initialized', sites: sites.length });
  }
});

// Initialize with sample sites
const initializeSampleSites = () => {
  const sampleSites = [
    {
      id: 'sample-1',
      name: 'Test Construction Site',
      siteCode: 'TEST1',
      createdAt: Date.now(),
      managerId: 'system',
      companyId: 'default-company'
    },
    {
      id: 'sample-2',
      name: 'Demo Building Project',
      siteCode: 'DEMO2',
      createdAt: Date.now(),
      managerId: 'system',
      companyId: 'default-company'
    },
    {
      id: 'sample-3',
      name: 'Sample Renovation',
      siteCode: 'SAMP3',
      createdAt: Date.now(),
      managerId: 'system',
      companyId: 'default-company'
    }
  ];
  
  sites = [...sites, ...sampleSites];
  console.log('Sample sites initialized:', sampleSites.map(s => s.siteCode));
};

// Initialize sample sites immediately for Vercel
initializeSampleSites();

// Global error handler – prevent serverless function crash on uncaught errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message || 'Something went wrong' });
});

// Start server only when not on Vercel (serverless uses exported app only)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 SARA Alert Backend Server running on port ${PORT}`);
    console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  });
}

module.exports = app;
