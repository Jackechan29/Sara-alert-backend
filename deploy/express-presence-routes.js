/**
 * Express `/api/site-users*` routes for production (MongoDB).
 * Intended for **Sara-alert-backend** (Vercel Express) when mounted after DB connection.
 *
 * Usage:
 *   const createPresenceRoutes = require('./deploy/express-presence-routes');
 *   app.use('/api', createPresenceRoutes({ getDb }));
 *
 * `getDb` must return a Promise resolving to a MongoDB `Db` instance (same URI as incidents/alerts).
 */

'use strict';

const express = require('express');

const TOKEN_FIELDS = [
  'pushToken',
  'expo_push_token',
  'expoPushToken',
  'apns_device_token',
  'apnsDeviceToken',
];

function carryTokens(existing, body) {
  const out = {};
  for (const k of TOKEN_FIELDS) {
    if (body[k] != null && String(body[k]).length > 0) out[k] = body[k];
    else if (existing && existing[k] != null) out[k] = existing[k];
  }
  return out;
}

function httpStatus(err) {
  return err.statusCode || err.status || 500;
}

module.exports = function createPresenceRoutes({ getDb }) {
  if (typeof getDb !== 'function') {
    throw new Error('createPresenceRoutes({ getDb }) requires getDb() => Promise<Db>');
  }

  let indexEnsured = false;
  async function siteUsersColl() {
    const db = await getDb();
    if (!db) {
      const e = new Error('MongoDB not configured (MONGODB_URI required for personnel)');
      e.statusCode = 503;
      throw e;
    }
    const coll = db.collection('siteUsers');
    if (!indexEnsured) {
      indexEnsured = true;
      await coll.createIndex({ id: 1, siteId: 1 }, { unique: true }).catch(() => {});
    }
    return coll;
  }

  const router = express.Router();

  router.get('/site-users', async (req, res) => {
    try {
      const siteId = req.query.siteId || req.query.site_id;
      const coll = await siteUsersColl();
      const filter = { on_site: true };
      if (siteId) filter.siteId = siteId;
      const rows = await coll.find(filter).toArray();
      const clean = rows.map((u) => {
        const { _id, ...rest } = u;
        return rest;
      });
      res.json(clean);
    } catch (err) {
      console.error('[site users list failed]', err?.message || err);
      res.status(httpStatus(err)).json({ error: 'Failed to get site users', message: err.message });
    }
  });

  router.post('/site-users', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = body.id ?? body.user_id;
      const siteId = body.siteId ?? body.site_id;
      const name = body.name;
      const role = body.role;
      if (!userId || !siteId || !name || !role) {
        return res.status(400).json({
          error: 'Missing required fields: id (or user_id), siteId (or site_id), name, role',
        });
      }
      const validRoles = ['manager', 'worker', 'visitor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role; must be manager, worker, or visitor' });
      }

      const coll = await siteUsersColl();
      const now = new Date();
      const existing = await coll.findOne({ id: userId, siteId });
      const isNew = !existing;
      const tokens = carryTokens(existing, body);

      const userToSave = {
        id: userId,
        name,
        role,
        siteId,
        siteName: body.siteName ?? body.site_name ?? 'Unknown Site',
        on_site: true,
        active: true,
        last_seen_at: now,
        acknowledged: body.acknowledged ?? false,
        needsHelp: body.needsHelp ?? false,
        temporarilyLeftSite: body.temporarilyLeftSite ?? false,
        leftSiteAt: body.leftSiteAt ?? null,
        lastActive: body.lastActive ?? Date.now(),
        joinedAt: body.joinedAt ?? existing?.joinedAt ?? now,
        reachedSafePoint: body.reachedSafePoint ?? false,
        reachedSafePointAt: body.reachedSafePointAt ?? null,
        updatedAt: now,
        ...tokens,
      };
      if (isNew) userToSave.checked_in_at = now;

      await coll.updateOne(
        { id: userId, siteId },
        { $set: userToSave, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );

      const saved = await coll.findOne({ id: userId, siteId });
      const raw = saved || userToSave;
      const { _id, ...site_user } = raw;

      console.log('presence.checkin.success', { user_id: userId, site_id: siteId, role });
      res.status(201).json({ success: true, site_user });
    } catch (err) {
      console.error('[site user check-in failed]', err?.message || err);
      res.status(httpStatus(err)).json({ error: 'Failed to create/update site user', message: err.message });
    }
  });

  router.post('/site-users/heartbeat', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = body.user_id ?? body.id;
      const siteId = body.site_id ?? body.siteId;
      if (!userId || !siteId) {
        return res.status(400).json({ error: 'Missing user_id and site_id (or id and siteId)' });
      }
      const coll = await siteUsersColl();
      const result = await coll.updateOne(
        { id: userId, siteId, on_site: true },
        { $set: { last_seen_at: new Date(), updatedAt: new Date() } }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'No on-site record found for this user/site' });
      }
      console.log('presence.heartbeat', { user_id: userId, site_id: siteId });
      res.json({ success: true });
    } catch (err) {
      console.error('[heartbeat failed]', err?.message || err);
      res.status(httpStatus(err)).json({ error: 'Failed to update heartbeat', message: err.message });
    }
  });

  router.post('/site-users/checkout', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = body.user_id ?? body.id;
      const siteId = body.site_id ?? body.siteId;
      if (!userId || !siteId) {
        return res.status(400).json({ error: 'Missing user_id and site_id (or id and siteId)' });
      }
      const coll = await siteUsersColl();
      const now = new Date();
      const result = await coll.updateOne(
        { id: userId, siteId },
        { $set: { on_site: false, active: false, checked_out_at: now, updatedAt: now } }
      );
      console.log('presence.checkout', { user_id: userId, site_id: siteId, matched: result.matchedCount });
      res.json({ success: true });
    } catch (err) {
      console.error('[checkout failed]', err?.message || err);
      res.status(httpStatus(err)).json({ error: 'Failed to checkout', message: err.message });
    }
  });

  return router;
};
