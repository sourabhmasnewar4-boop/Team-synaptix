/**
 * MQTT Service — Bridge between MQTT broker and backend
 * 
 * This handles:
 * - Connecting to Mosquitto MQTT broker
 * - Subscribing to device state topics
 * - Publishing commands to devices
 * - Updating Firestore when device states change
 */

const mqtt = require('mqtt');

class MQTTService {
    constructor(brokerUrl, options = {}) {
        this.brokerUrl = brokerUrl || 'mqtt://localhost:1883';
        this.options = {
            clientId: `autohome-server-${Date.now()}`,
            clean: true,
            connectTimeout: 4000,   // reduced: fail fast, reconnect fast
            reconnectPeriod: 3000,  // retry every 3s instead of 5s
            keepalive: 30,
            ...options,
        };
        this.client = null;
        this.db = null;
        this.broadcastToUser = null;
        this.subscriptions = new Set();
    }

    /**
     * Initialize MQTT connection
     * @param {Object} db - Firestore instance
     * @param {Function} broadcastToUser - WebSocket broadcast function
     */
    init(db, broadcastToUser) {
        this.db = db;
        this.broadcastToUser = broadcastToUser;

        try {
            this.client = mqtt.connect(this.brokerUrl, this.options);

            this.client.on('connect', () => {
                console.log('📡 MQTT connected to broker:', this.brokerUrl);

                // Subscribe to all device state/status topics
                // IMPORTANT: topic prefix must be 'autohome/' — matches ESP32 firmware
                this.client.subscribe('autohome/+/+/state',  { qos: 0 });
                this.client.subscribe('autohome/+/+/status', { qos: 0 });
                console.log('📥 MQTT subscribed to autohome device topics');
            });

            this.client.on('message', (topic, payload) => {
                this.handleMessage(topic, payload.toString());
            });

            this.client.on('error', (error) => {
                console.error('❌ MQTT error:', error.message);
            });

            this.client.on('offline', () => {
                console.log('⚠️  MQTT disconnected — will auto-reconnect');
            });

            this.client.on('reconnect', () => {
                console.log('🔄 MQTT reconnecting...');
            });
        } catch (error) {
            console.error('❌ MQTT init failed:', error.message);
            console.log('ℹ️  MQTT broker not available. Device commands will use HTTP fallback.');
        }
    }

    /**
     * Handle incoming MQTT messages from ESP32 devices
     */
    async handleMessage(topic, payload) {
        try {
            // Parse topic: autohome/{userId}/{deviceId}/{type}
            const parts = topic.split('/');
            if (parts.length !== 4 || parts[0] !== 'autohome') return;

            const [, userId, deviceId, messageType] = parts;
            const data = JSON.parse(payload);

            if (messageType === 'state') {
                // Device reported its state
                console.log(`📩 State from ${deviceId}:`, data);

                if (this.db) {
                    const deviceRef = this.db.collection('devices').doc(deviceId);
                    const updateData = {
                        status: 'online',
                        lastSeen: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
                    };

                    if (data.channels) {
                        updateData.channelStates = data.channels;
                    }

                    await deviceRef.update(updateData);
                }

                // Broadcast state to user's WebSocket clients
                if (this.broadcastToUser) {
                    this.broadcastToUser(userId, {
                        type: 'device_state_update',
                        deviceId,
                        channelStates: data.channels,
                        rssi: data.rssi,
                        uptime: data.uptime,
                    });
                }
            } else if (messageType === 'status') {
                // Device online/offline status
                const isOnline = data.status === 'online';
                console.log(`${isOnline ? '🟢' : '🔴'} Device ${deviceId}: ${data.status}`);

                if (this.db) {
                    await this.db.collection('devices').doc(deviceId).update({
                        status: isOnline ? 'online' : 'offline',
                        lastSeen: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
                    });
                }

                if (this.broadcastToUser) {
                    this.broadcastToUser(userId, {
                        type: isOnline ? 'device_online' : 'device_offline',
                        deviceId,
                    });
                }
            }
        } catch (error) {
            console.error('MQTT message handling error:', error.message);
        }
    }

    /**
     * Send a command to an ESP32 device via MQTT
     * @param {string} userId - Owner's user ID
     * @param {string} deviceId - Device MAC/ID
     * @param {number} channel - Relay channel to control
     * @param {string} action - "on", "off", or "toggle"
     */
    sendCommand(userId, deviceId, channel, action) {
        if (!this.client || !this.client.connected) {
            console.warn('⚠️  MQTT not connected, command won\'t reach device');
            return false;
        }

        // QoS 0 = fire-and-forget, lowest latency (~50ms vs ~200ms for QoS 1)
        // QoS 1 adds an ACK round-trip — not needed for relay commands
        const topic = `autohome/${userId}/${deviceId}/command`;
        const payload = JSON.stringify({
            channel,
            action,
            timestamp: Date.now(),
        });

        this.client.publish(topic, payload, { qos: 0, retain: false });
        console.log(`📤 MQTT → ${deviceId}: ch${channel} → ${action}`);
        return true;
    }

    /**
     * Check if MQTT is connected
     */
    isConnected() {
        return this.client && this.client.connected;
    }

    /**
     * Gracefully disconnect
     */
    disconnect() {
        if (this.client) {
            this.client.end(true);
            console.log('📡 MQTT disconnected');
        }
    }
}

module.exports = MQTTService;
