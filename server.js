const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Get all sites
app.get('/api/sites', (req, res) => {
  res.json(sites);
});

// Create a new site
app.post('/api/sites', (req, res) => {
  const { name, managerId } = req.body;
  
  if (!name || !managerId) {
    return res.status(400).json({ error: 'Name and managerId are required' });
  }

  const newSite = {
    id: uuidv4(),
    name: name.trim(),
    siteCode: generateSiteCode(),
    createdAt: Date.now(),
    managerId,
    companyId: 'default-company'
  };

  sites.push(newSite);
  res.json(newSite);
});

// Get site by code
app.get('/api/sites/code/:code', (req, res) => {
  const { code } = req.params;
  const site = sites.find(s => s.siteCode === code.toUpperCase());
  
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }
  
  res.json(site);
});

// Get site by ID
app.get('/api/sites/:id', (req, res) => {
  const { id } = req.params;
  const site = sites.find(s => s.id === id);
  
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }
  
  res.json(site);
});

// Join a site
app.post('/api/sites/:id/join', (req, res) => {
  const { id } = req.params;
  const { userId, userName, role } = req.body;
  
  const site = sites.find(s => s.id === id);
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  // Add user to site users
  const existingUser = users.find(u => u.id === userId);
  if (existingUser) {
    existingUser.siteId = id;
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
});

// Get site users
app.get('/api/sites/:id/users', (req, res) => {
  const { id } = req.params;
  const siteUsers = users.filter(u => u.siteId === id);
  res.json(siteUsers);
});

// Send alert
app.post('/api/alerts', (req, res) => {
  const { siteId, type, userId } = req.body;
  
  if (!siteId || !type || !userId) {
    return res.status(400).json({ error: 'siteId, type, and userId are required' });
  }

  const newAlert = {
    id: uuidv4(),
    siteId,
    type,
    timestamp: Date.now(),
    active: true,
    date: new Date().toISOString().split('T')[0]
  };

  // Deactivate any existing active alerts for this site
  alerts = alerts.map(alert => {
    if (alert.siteId === siteId && alert.active) {
      return { ...alert, active: false };
    }
    return alert;
  });

  alerts.push(newAlert);
  res.json(newAlert);
});

// Get all alerts
app.get('/api/alerts', (req, res) => {
  res.json(alerts);
});

// Get site alerts
app.get('/api/sites/:id/alerts', (req, res) => {
  const { id } = req.params;
  const siteAlerts = alerts.filter(a => a.siteId === id);
  res.json(siteAlerts);
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    sites: sites.length,
    users: users.length,
    alerts: alerts.length
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SARA Alert Backend Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
});

module.exports = app;
