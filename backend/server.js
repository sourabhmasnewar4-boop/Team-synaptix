const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const dgram = require('dgram');
const os = require('os');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const { processAssistantChat } = require('./services/aiAssistant');
const { initTelegramBot, getTelegramInfo } = require('./services/telegramBot');
const { initDiscordBot } = require('./services/discordBot');

// Auto-detect the server's local IPv4 address for provisioning
function getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1';
}
const LOCAL_IP = getLocalIp();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// ──────────────────────────────────────────────
// CORS — allow frontend and any local device
// ──────────────────────────────────────────────
app.use(cors({
    origin: '*',   // allow ESP32, frontend, dev tools
    credentials: true,
}));
app.use(express.json());

// ──────────────────────────────────────────────
// FIREBASE ADMIN
// ──────────────────────────────────────────────
if (!admin.apps.length) {
    try {
        const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        const projectId = process.env.FIREBASE_PROJECT_ID || 'tars-5cd1a';

        if (saPath) {
            admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
        } else {
            // Use Application Default Credentials with explicit project
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId,
            });
        }
        console.log('✅ Firebase Admin initialized (project:', projectId, ')');
    } catch (err) {
        console.warn('⚠️  Firebase Admin not configured — using service account key is recommended:', err.message);
        // Try anonymous init as last resort
        try { admin.initializeApp(); } catch (_) { }
    }
}
const db = admin.apps.length > 0 ? admin.firestore() : null;

// ──────────────────────────────────────────────
// WEBSOCKET SERVER
// ──────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map(); // userId -> Set<WebSocket>

function broadcastToUser(userId, data) {
    if (!clients.has(userId)) return;
    const msg = JSON.stringify(data);
    clients.get(userId).forEach(ws => {
        if (ws.readyState === 1) ws.send(msg);
    });
}

wss.on('connection', (ws) => {
    console.log('🔌 WebSocket client connected');

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());

            if (msg.type === 'auth') {
                if (!clients.has(msg.userId)) clients.set(msg.userId, new Set());
                clients.get(msg.userId).add(ws);
                ws.userId = msg.userId;
                ws.send(JSON.stringify({ type: 'auth_success' }));
                console.log(`👤 WS auth: ${msg.userId}`);
            }

            // ⚡ DIRECT CONTROL via WebSocket — bypasses HTTP + Cloudflare Tunnel
            // Frontend sends: { type: 'control', deviceId, channel, action }
            // This saves ~300-800ms vs HTTP fetch through tunnel
            else if (msg.type === 'control' && ws.userId) {
                const { deviceId, channel, action } = msg;
                if (!deviceId || channel === undefined || !action) return;
                const sent = mqttPublish(ws.userId, deviceId, channel, action);
                // Immediately echo optimistic state back to all user's clients
                if (sent) {
                    broadcastToUser(ws.userId, {
                        type: 'device_state_optimistic',
                        deviceId,
                        channel,
                        action,
                    });
                }
            }

            // Control all channels of a device
            else if (msg.type === 'control_all' && ws.userId) {
                const { deviceId, action, numChannels = 4 } = msg;
                if (!deviceId || !action) return;
                for (let ch = 0; ch < numChannels; ch++) {
                    mqttPublish(ws.userId, deviceId, ch, action);
                }
                broadcastToUser(ws.userId, {
                    type: 'device_state_optimistic_all',
                    deviceId,
                    action,
                    numChannels,
                });
            }

        } catch (e) { console.error('WS message error:', e.message); }
    });

    ws.on('close', () => {
        if (ws.userId && clients.has(ws.userId)) {
            clients.get(ws.userId).delete(ws);
            if (clients.get(ws.userId).size === 0) clients.delete(ws.userId);
        }
        console.log('🔌 WebSocket client disconnected');
    });
});

// ──────────────────────────────────────────────
// MQTT SERVICE (graceful — works without broker)
// ──────────────────────────────────────────────
let mqttClient = null;
let mqttConnected = false;

function initMQTT() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    try {
        const options = {
            clientId: `autohome-server-${Date.now()}`,
            connectTimeout: 5000,
            reconnectPeriod: 10000,
        };

        if (process.env.MQTT_USERNAME) {
            options.username = process.env.MQTT_USERNAME;
            options.password = process.env.MQTT_PASSWORD;
        }

        mqttClient = mqtt.connect(brokerUrl, options);

        mqttClient.on('connect', () => {
            mqttConnected = true;
            console.log('📡 MQTT connected to:', brokerUrl);
            mqttClient.subscribe('autohome/+/+/state', { qos: 1 });
            mqttClient.subscribe('autohome/+/+/status', { qos: 1 });
        });

        mqttClient.on('message', (topic, payload) => handleMQTTMessage(topic, payload.toString()));
        mqttClient.on('error', (err) => { mqttConnected = false; /* silent retry */ });
        mqttClient.on('offline', () => { mqttConnected = false; });
        mqttClient.on('reconnect', () => console.log('🔄 MQTT reconnecting...'));
    } catch (err) {
        console.warn('⚠️  MQTT init failed:', err.message);
    }
}

async function handleMQTTMessage(topic, payload) {
    try {
        // topic: autohome/{userId}/{deviceId}/{type}
        const parts = topic.split('/');
        if (parts.length !== 4 || parts[0] !== 'autohome') return;
        const [, userId, deviceId, msgType] = parts;
        const data = JSON.parse(payload);

        if (msgType === 'state' && db) {
            // ① Broadcast to browsers instantly (before DB write)
            if (data.channels) {
                broadcastToUser(userId, {
                    type: 'device_state_update',
                    deviceId,
                    channelStates: data.channels,
                });
            }
            console.log(`📩 State from ${deviceId}:`, data.channels);
            // ② Write DB in background
            db.collection('devices').doc(deviceId).update({
                status: 'online',
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                ...(data.channels ? { channelStates: data.channels } : {}),
            }).catch(e => console.error('MQTT DB write:', e.message));
        }

        if (msgType === 'status') {
            const isOnline = data.status === 'online';
            // ① Broadcast immediately
            broadcastToUser(userId, {
                type: isOnline ? 'device_online' : 'device_offline',
                deviceId,
            });
            console.log(`${isOnline ? '🟢' : '🔴'} Device ${deviceId}: ${data.status}`);
            // ② Update DB in background
            if (db) {
                db.collection('devices').doc(deviceId).update({
                    status: isOnline ? 'online' : 'offline',
                    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                }).catch(e => console.error('MQTT status DB:', e.message));
            }
        }
    } catch (err) {
        console.error('MQTT message error:', err.message);
    }
}

function mqttPublish(userId, deviceId, channel, action) {
    if (!mqttClient || !mqttConnected) {
        console.warn(`⚠️  MQTT offline — command ch${channel}:${action} not delivered to ${deviceId}`);
        return false;
    }
    const topic = `autohome/${userId}/${deviceId}/command`;
    // QoS 0 = fire-and-forget, no ACK wait — saves ~150ms vs QoS 1
    mqttClient.publish(topic, JSON.stringify({ channel, action, ts: Date.now() }), { qos: 0, retain: false });
    console.log(`📤 MQTT→ ${deviceId} ch${channel}: ${action}`);
    return true;
}

// ──────────────────────────────────────────────
// SCHEDULER (node-cron — runs routines)
// ──────────────────────────────────────────────
const cron = require('node-cron');

function startScheduler() {
    if (!db) { console.warn('⚠️  Scheduler skipped: no DB'); return; }

    // Every minute: run matching routines + detect offline devices
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
        const timeStr = formatter.format(now); // "HH:mm"
        const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
        const today = dayFormatter.format(now); // "Mon", "Tue"
        // removed

        try {
            // --- Run routines ---
            const snap = await db.collection('routines')
                .where('enabled', '==', true)
                .where('time', '==', timeStr).get();

            for (const rdoc of snap.docs) {
                const r = rdoc.data();
                if (r.days && !r.days.includes(today)) continue;

                console.log(`⏰ Running routine "${r.name}" → ${r.action} on ${r.deviceId} ch${r.channel}`);

                try {
                    const devRef = db.collection('devices').doc(r.deviceId);
                    const devSnap = await devRef.get();
                    if (!devSnap.exists) continue;

                    const states = [...(devSnap.data().channelStates || []).map(Boolean)];
                    const ch = parseInt(r.channel);

                    if (r.action === 'on') states[ch] = true;
                    else if (r.action === 'off') states[ch] = false;
                    else if (r.action === 'toggle') states[ch] = !states[ch];

                    // Fire everything simultaneously for zero-lag mirroring
                    mqttPublish(r.userId, r.deviceId, ch, r.action);

                    broadcastToUser(r.userId, {
                        type: 'device_state_update',
                        deviceId: r.deviceId,
                        channelStates: states
                    });

                    // Update DB in background
                    devRef.update({ channelStates: states }).catch(e =>
                        console.error('Routine DB update error:', e.message)
                    );
                } catch (e) {
                    console.error(`Routine execution error for ${r.name}:`, e.message);
                }
            }

            // --- Mark offline devices (no heartbeat > 2 min) ---
            const twoMin = new Date(now.getTime() - 2 * 60000);
            const onlineSnap = await db.collection('devices')
                .where('status', '==', 'online').get();

            const twoMinTs = admin.firestore.Timestamp.fromDate(twoMin);
            const batch = db.batch();
            let offlineCount = 0;

            onlineSnap.forEach(d => {
                const dev = d.data();
                if (dev.lastSeen && dev.lastSeen.toMillis() < twoMinTs.toMillis()) {
                    batch.update(d.ref, { status: 'offline' });
                    offlineCount++;
                    // Broadcast offline status to owner
                    if (dev.userId) {
                        broadcastToUser(dev.userId, { type: 'device_offline', deviceId: d.id });
                    }
                }
            });

            if (offlineCount > 0) {
                await batch.commit();
                console.log(`🔴 Marked ${offlineCount} device(s) offline`);
            }
        } catch (err) {
            console.error('Scheduler error:', err.message);
        }
    });

    console.log('⏰ Scheduler started');
}

// ──────────────────────────────────────────────
// AUTO-DISCOVERY (UDP Listener)
// ──────────────────────────────────────────────
const discoveredDevices = new Map();
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        if (data.app !== 'AutoHome' || !data.device_id) return;

        const entry = {
            deviceId: data.device_id,
            ip: rinfo.address,
            channels: data.channels || 4,
            seenAt: Date.now(),
        };

        const isNew = !discoveredDevices.has(data.device_id);
        discoveredDevices.set(data.device_id, entry);

        if (isNew) {
            console.log(`📡 Discovered ESP32: ${data.device_id} at ${rinfo.address}`);
            // Broadcast to all connected dashboard users
            clients.forEach((sockets) => {
                sockets.forEach(ws => {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ type: 'device_discovered', ...entry }));
                    }
                });
            });
        }
    } catch (e) { /* ignore garbage */ }
});

udpServer.on('error', (err) => console.error('UDP error:', err.message));
try {
    udpServer.bind(5555, '0.0.0.0', () => console.log('📡 UDP discovery listening on port 5555'));
} catch (e) { console.error('UDP bind failed:', e.message); }

// Clean up stale discovered devices every 10s
setInterval(() => {
    const now = Date.now();
    for (const [id, dev] of discoveredDevices.entries()) {
        if (now - dev.lastSeen > 15000) discoveredDevices.delete(id); // 15s timeout
    }
}, 10000);

// API ROUTES
// ──────────────────────────────────────────────

// Health
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        firebase: db ? 'connected' : 'not configured',
        mqtt: mqttConnected ? 'connected' : 'offline',
        websocketClients: [...clients.values()].reduce((a, s) => a + s.size, 0),
    });
});

// ── Integrations Settings ──
app.get('/api/integrations/status', async (req, res) => {
    const { userId } = req.query;
    let userHasSpotify = false;

    if (userId && db) {
        const docSnap = await db.collection('user_integrations').doc(userId).get();
        if (docSnap.exists && docSnap.data().spotify) {
            userHasSpotify = true;
        }
    }

    res.json({
        telegram: getTelegramInfo(),
        discord: { enabled: !!process.env.DISCORD_BOT_TOKEN },
        spotify: { enabled: !!process.env.SPOTIFY_CLIENT_ID, linked: userHasSpotify }
    });
});

// ── Spotify OAuth Routes ──
app.get('/api/spotify/login', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).send('Missing userId');

    const { SPOTIFY_CLIENT_ID } = process.env;
    if (!SPOTIFY_CLIENT_ID) return res.status(500).send('Spotify not configured in .env');

    const redirectUri = encodeURIComponent('http://localhost:4000/api/spotify/callback');
    const scope = encodeURIComponent('user-modify-playback-state user-read-playback-state user-read-currently-playing');

    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${scope}&redirect_uri=${redirectUri}&state=${userId}`;
    res.redirect(authUrl);
});

app.get('/api/spotify/callback', async (req, res) => {
    const { code, state: userId, error } = req.query;
    if (error) return res.redirect('http://localhost:3000/dashboard/integrations?error=spotify_login_failed');

    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: 'http://localhost:4000/api/spotify/callback'
            })
        });

        const result = await response.json();

        if (result.access_token && db) {
            const docRef = db.collection('user_integrations').doc(userId);
            await docRef.set({
                spotify: {
                    accessToken: result.access_token,
                    refreshToken: result.refresh_token,
                    expiresAt: Date.now() + (result.expires_in * 1000)
                }
            }, { merge: true });
        }
        res.redirect('http://localhost:3000/dashboard/integrations?success=spotify');
    } catch (e) {
        console.error('Spotify Auth Error:', e);
        res.redirect('http://localhost:3000/dashboard/integrations?error=spotify_token_exchange');
    }
});

// ── Cloud Seamless Device Announcement ──
app.post('/api/devices/announce', (req, res) => {
    const { device_id, channels } = req.body;
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp.includes('::ffff:')) clientIp = clientIp.split('::ffff:')[1];
    
    discoveredDevices.set(device_id, {
        deviceId: device_id,
        publicIp: clientIp,
        channels: channels || 4,
        timestamp: Date.now()
    });
    console.log(`📡 Device ${device_id} announced from Public IP: ${clientIp}`);
    res.json({ status: 'announced' });
});

// ── Cloud Seamless Discovery (IP Match) ──
app.get('/api/devices/discover', (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp.includes('::ffff:')) clientIp = clientIp.split('::ffff:')[1];
    
    const matchingDevices = [];
    const now = Date.now();
    
    for (const [id, device] of discoveredDevices.entries()) {
        if (now - device.timestamp > 10 * 60 * 1000) {
            discoveredDevices.delete(id); // Clean up old (10m)
            continue;
        }
        
        // Match public IPs (allow localhost matching for local dev)
        const isLocal = (clientIp === '127.0.0.1' || clientIp === '::1');
        const devIsLocal = (device.publicIp === '127.0.0.1' || device.publicIp === '::1');
        
        if (device.publicIp === clientIp || (isLocal && devIsLocal)) {
            matchingDevices.push(device);
        }
    }
    res.json(matchingDevices);
});

// ── Cloud Seamless Provisioning (Claim Device via MQTT) ──
app.post('/api/devices/provision', async (req, res) => {
    const { deviceId, userId, name, roomId, channels } = req.body;
    if (!db || !userId) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const numCh = parseInt(channels) || 1;

        // 1. Pre-register in Firestore so it's locked to the user
        const devRef = db.collection('devices').doc(deviceId);
        await devRef.set({
            userId,
            name: name || `Device ${deviceId.slice(-6).toUpperCase()}`,
            type: 'relay',
            channels: numCh,
            channelStates: Array(numCh).fill(false),
            channelNames: Array.from({ length: numCh }, (_, i) => `Channel ${i + 1}`),
            roomId: roomId || null,
            status: 'online',
            ipAddress: 'cloud-matched',
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Tell the ESP32 it has been claimed via MQTT!
        if (typeof mqttClient !== 'undefined' && mqttClient.connected) {
            mqttClient.publish(`autohome/unclaimed/${deviceId}`, JSON.stringify({
                action: 'claimed',
                userId: userId
            }));
            console.log(`📤 Sent MQTT claim to autohome/unclaimed/${deviceId}`);
        }

        // Broadcast to UI
        broadcastToUser(userId, { type: 'new_device', deviceId });

        // Remove from discovery list
        discoveredDevices.delete(deviceId);

        console.log(`✨ Provisioned device ${deviceId} to user ${userId}`);
        res.json({ status: 'provisioned', deviceId });

    } catch (err) {
        console.error('Provisioning failed:', err.message);
        res.status(500).json({ error: 'Failed to provision device. Ensure it is online.' });
    }
});

// ── Device Registration (Legacy / Fallback ESP32 calls this on boot) ──
app.post('/api/devices/register', async (req, res) => {
    const { device_id, device_type, firmware_version, channels, user_id, ip_address } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });
    if (!db) return res.status(503).json({ error: 'DB not configured' });

    try {
        const ref = db.collection('devices').doc(device_id);
        const snap = await ref.get();

        if (snap.exists) {
            await ref.update({
                status: 'online',
                ipAddress: ip_address || '',
                firmwareVersion: firmware_version || '',
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            });
            broadcastToUser(snap.data().userId, { type: 'device_online', deviceId: device_id });
            console.log(`📡 Device ${device_id} reconnected`);
            return res.json({ status: 'reconnected', device_id });
        }

        // Brand new device
        const numCh = parseInt(channels) || 1;
        await ref.set({
            userId: user_id || '',
            name: `Device ${device_id.slice(-6).toUpperCase()}`,
            type: device_type || 'relay',
            channels: numCh,
            channelStates: Array(numCh).fill(false),
            channelNames: Array.from({ length: numCh }, (_, i) => `Channel ${i + 1}`),
            roomId: null,
            status: 'online',
            firmwareVersion: firmware_version || '',
            ipAddress: ip_address || '',
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (user_id) broadcastToUser(user_id, { type: 'new_device', deviceId: device_id });
        console.log(`🆕 New device registered: ${device_id}`);
        res.json({ status: 'registered', device_id });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Device Control (frontend button click) ──
// PERFORMANCE: broadcast WS + MQTT FIRST, write DB in background
// This makes the UI and ESP32 respond in <10ms instead of waiting for Firestore
app.post('/api/devices/:deviceId/control', async (req, res) => {
    const { deviceId } = req.params;
    const { channel, action } = req.body;
    if (!db) return res.status(503).json({ error: 'DB not configured' });

    try {
        const ref = db.collection('devices').doc(deviceId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Device not found' });

        const device = snap.data();
        const states = [...(device.channelStates || []).map(Boolean)];
        const ch = parseInt(channel);
        if (action === 'on') states[ch] = true;
        else if (action === 'off') states[ch] = false;
        else if (action === 'toggle') states[ch] = !states[ch];

        // ① Send to ESP32 via MQTT immediately (fastest path ~1-5ms)
        mqttPublish(device.userId, deviceId, ch, action);

        // ② Push to all open browser tabs via WebSocket immediately
        broadcastToUser(device.userId, {
            type: 'device_state_update',
            deviceId,
            channelStates: states,
        });

        // ③ Respond to frontend immediately (don't wait for DB)
        res.json({ status: 'ok', channelStates: states });

        // ④ Write to Firestore in background (doesn't block response)
        ref.update({ channelStates: states }).catch(err =>
            console.error('DB write error (non-blocking):', err.message)
        );

        console.log(`⚡ ${deviceId} ch${ch}: ${action}`);
    } catch (err) {
        console.error('Control error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Device Control ALL (frontend Master Button click) ──
app.post('/api/devices/:deviceId/control-all', async (req, res) => {
    const { deviceId } = req.params;
    const { action } = req.body; // 'on' or 'off'
    if (!db) return res.status(503).json({ error: 'DB not configured' });

    try {
        const ref = db.collection('devices').doc(deviceId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Device not found' });

        const device = snap.data();
        const numCh = device.channels || 1;
        const states = Array(numCh).fill(action === 'on');

        // Fire MQTT for every channel quickly
        for (let ch = 0; ch < numCh; ch++) {
            mqttPublish(device.userId, deviceId, ch, action);
        }

        // Push via WS immediately
        broadcastToUser(device.userId, {
            type: 'device_state_update',
            deviceId,
            channelStates: states,
        });

        res.json({ status: 'ok', channelStates: states });

        // Write to DB in background
        ref.update({ channelStates: states }).catch(err =>
            console.error('DB write error (control-all):', err.message)
        );

        console.log(`⚡ ${deviceId} ALL: ${action}`);
    } catch (err) {
        console.error('Control ALL error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Heartbeat (ESP32 pings every 30s) ──
app.post('/api/devices/:deviceId/heartbeat', async (req, res) => {
    const { deviceId } = req.params;
    const { channel_states, rssi } = req.body;
    if (!db) return res.status(503).json({ error: 'DB not configured' });

    // Respond immediately, handle DB in background
    res.json({ status: 'ok' });

    try {
        const ref = db.collection('devices').doc(deviceId);
        const snap = await ref.get();
        if (!snap.exists) return;

        const device = snap.data();
        const updates = {
            status: 'online',
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        };

        // If ESP32 reported channel states, check if they differ from DB
        if (channel_states) {
            const changed = channel_states.some((s, i) => s !== (device.channelStates || [])[i]);
            updates.channelStates = channel_states;
            if (changed) {
                // Push real-time update if ESP32 state differs from DB (physical switch used)
                broadcastToUser(device.userId, {
                    type: 'device_state_update',
                    deviceId,
                    channelStates: channel_states,
                });
            }
        }

        // Broadcast online status
        broadcastToUser(device.userId, {
            type: 'device_heartbeat',
            deviceId,
            rssi: rssi || null,
        });

        await ref.update(updates);
    } catch (err) {
        console.error('Heartbeat error:', err.message);
    }
});

// ── Get pending commands for a device (polling fallback) ──
app.get('/api/devices/:deviceId/state', async (req, res) => {
    const { deviceId } = req.params;
    if (!db) return res.status(503).json({ error: 'DB not configured' });
    try {
        const snap = await db.collection('devices').doc(deviceId).get();
        if (!snap.exists) return res.status(404).json({ error: 'Not found' });
        const data = snap.data();
        res.json({ channelStates: data.channelStates, status: data.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── AI ASSISTANT CHAT ROUTE (OPEN SOURCE EDITION) ──
app.post('/api/assistant/chat', async (req, res) => {
    try {
        const { userId, message } = req.body;
        const response = await processAssistantChat(userId, message, { mqttPublish, broadcastToUser });
        res.json(response);
    } catch (err) {
        console.error('Assistant Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║      🏠 AutoHome Backend Server         ║
  ╠══════════════════════════════════════════╣
  ║  API:     http://localhost:${PORT}          ║
  ║  WS:      ws://localhost:${PORT}/ws         ║
  ║  Health:  http://localhost:${PORT}/api/health║
  ╚══════════════════════════════════════════╝
  `);

    initMQTT();
    startScheduler();

    // Start Social Bots
    initTelegramBot({ mqttPublish, broadcastToUser });
    initDiscordBot({ mqttPublish, broadcastToUser });
});
