const { getFirestore } = require('firebase-admin/firestore');
const { controlSpotify } = require('./spotify');

const tools = [
    {
        type: "function",
        function: {
            name: "control_device",
            description: "Turns a specific channel of a device ON or OFF. ONLY use this when the user wants to change a device state. Do NOT use this to check status.",
            parameters: {
                type: "object",
                properties: {
                    deviceId: { type: "string", description: "ID of the device" },
                    channel: { type: "number", description: "Channel index (0 for single channel)" },
                    action: { type: "string", enum: ["on", "off"] }
                },
                required: ["deviceId", "channel", "action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_device_status",
            description: "Gets the current on/off status of all channels of a specific device. Use this when the user asks things like 'is the lamp on?', 'status of fan', 'what is the state of living room lights?'",
            parameters: {
                type: "object",
                properties: {
                    deviceId: { type: "string", description: "ID of the device to check status for" }
                },
                required: ["deviceId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "control_room",
            description: "Turns all devices in a room ON or OFF.",
            parameters: {
                type: "object",
                properties: {
                    roomId: { type: "string", description: "ID of the room" },
                    action: { type: "string", enum: ["on", "off"] }
                },
                required: ["roomId", "action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_routine",
            description: "Creates an automated schedule for a device.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the routine (e.g., 'Morning Lights')" },
                    time: { type: "string", description: "Time of day in HH:mm format" },
                    deviceId: { type: "string", description: "ID of the device" },
                    channel: { type: "number", description: "Channel index (default 0)" },
                    action: { type: "string", enum: ["on", "off"] }
                },
                required: ["name", "time", "deviceId", "channel", "action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "control_all",
            description: "Turns EVERY device in the entire home ON or OFF. Use this when the user says 'turn on all lights' or 'turn off everything'.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["on", "off"] }
                },
                required: ["action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Gets the current weather and temperature at the user's home location.",
            parameters: {
                type: "object",
                properties: {
                    location: { type: "string", description: "City name, defaults to 'Delhi'" }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "control_spotify",
            description: "Controls Spotify playback (play music, pause, skip track, previous track).",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["play", "pause", "next", "prev"] },
                    query: { type: "string", description: "The name of the song or artist to play (only used with 'play' action)" }
                },
                required: ["action"]
            }
        }
    }
];

// Reusable function to map natural language to smart home actions
async function processAssistantChat(userId, message, { mqttPublish, broadcastToUser }) {
    if (!userId || !message) throw new Error('Missing userId or message');

    const db = getFirestore();
    const API_KEY = process.env.OPEN_SOURCE_API_KEY || '';
    const BASE_URL = process.env.OPEN_SOURCE_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = process.env.OPEN_SOURCE_MODEL || 'llama-3.3-70b-versatile';
    // Detect if using local Ollama (no auth header needed)
    const isOllama = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes('ollama');

    const [devicesSnap, roomsSnap] = await Promise.all([
        db.collection('devices').where('userId', '==', userId).get(),
        db.collection('rooms').where('userId', '==', userId).get()
    ]);

    const devices = devicesSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name,
        channels: d.data().channels,
        channelNames: d.data().channelNames,
        channelStates: d.data().channelStates,
        roomId: d.data().roomId
    }));
    const rooms = roomsSnap.docs.map(r => ({ id: r.id, name: r.data().name }));

    const systemPrompt = `You are AutoHome Assistant, an intelligent smart home AI like Alexa. Be concise and conversational (e.g. "Got it, turning off the lamp."). 
RULES:
- To check if device is on/off: use get_device_status (NEVER use control_device with action='status')
- To turn on/off: use control_device
- Do NOT ask the user for device IDs - map device names from the list below
Current Rooms: ${JSON.stringify(rooms)}
Current Devices: ${JSON.stringify(devices)}`;

    const payload = {
        model: MODEL_NAME,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
        ],
        tools: tools,
        tool_choice: "auto",
    };

    const headers = { 'Content-Type': 'application/json' };
    if (!isOllama && API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    const response = await fetch(BASE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (response.status === 401) {
        throw new Error('API Key Invalid! Check your OPEN_SOURCE_API_KEY.');
    }

    if (!response.ok) {
        throw new Error(`Cloud API Limit Error: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    const responseMessage = data.choices[0].message;

    let actionTakenText = null;
    let finalReply = responseMessage.content;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            if (functionName === 'get_device_status') {
                const docRef = db.collection('devices').doc(args.deviceId);
                const s = await docRef.get();
                if (s.exists) {
                    const data = s.data();
                    const states = data.channelStates || [];
                    const channelNames = data.channelNames || [];
                    const statusLines = states.map((st, i) => `${channelNames[i] || `Channel ${i}`}: ${st ? 'ON 🟢' : 'OFF 🔴'}`);
                    finalReply = `${data.name} status:\n${statusLines.join('\n')}`;
                    actionTakenText = `Checked status of ${args.deviceId}`;
                } else {
                    finalReply = `I couldn't find that device.`;
                }
            }
            else if (functionName === 'control_device') {
                const docRef = db.collection('devices').doc(args.deviceId);
                const s = await docRef.get();
                if (s.exists) {
                    const st = s.data().channelStates || Array(s.data().channels).fill(false);
                    st[args.channel] = args.action === 'on';
                    await docRef.update({ channelStates: st });

                    if (mqttPublish) mqttPublish(userId, args.deviceId, args.channel, args.action);
                    if (broadcastToUser) broadcastToUser(userId, { type: 'device_state_update', deviceId: args.deviceId, channelStates: st });
                }
                actionTakenText = `Set device ${args.deviceId} channel ${args.channel} to ${args.action}`;
                finalReply = `Got it, turned ${args.action} the device.`;
            }
            else if (functionName === 'control_room') {
                const roomDevs = devicesSnap.docs.filter(d => d.data().roomId === args.roomId);
                for (const rd of roomDevs) {
                    const numChannels = rd.data().channels || 1;
                    const st = Array(numChannels).fill(args.action === 'on');
                    await db.collection('devices').doc(rd.id).update({ channelStates: st });

                    for (let c = 0; c < numChannels; c++) {
                        if (mqttPublish) mqttPublish(userId, rd.id, c, args.action);
                    }
                    if (broadcastToUser) broadcastToUser(userId, { type: 'device_state_update', deviceId: rd.id, channelStates: st });
                }
                actionTakenText = `Set room ${args.roomId} to ${args.action}`;
                finalReply = `I have turned ${args.action} the room.`;
            }
            else if (functionName === 'control_all') {
                for (const rd of devicesSnap.docs) {
                    const numChannels = rd.data().channels || 1;
                    const st = Array(numChannels).fill(args.action === 'on');
                    await db.collection('devices').doc(rd.id).update({ channelStates: st });

                    for (let c = 0; c < numChannels; c++) {
                        if (mqttPublish) mqttPublish(userId, rd.id, c, args.action);
                    }
                    if (broadcastToUser) broadcastToUser(userId, { type: 'device_state_update', deviceId: rd.id, channelStates: st });
                }
                actionTakenText = `Set all devices to ${args.action}`;
                finalReply = `I have turned ${args.action} all devices.`;
            }
            else if (functionName === 'create_routine') {
                await db.collection('routines').add({
                    userId,
                    name: args.name,
                    time: args.time,
                    deviceId: args.deviceId,
                    channel: args.channel,
                    action: args.action,
                    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    enabled: true
                });
                actionTakenText = `Created routine ${args.name} at ${args.time}`;
                finalReply = `I have scheduled the routine for ${args.time}.`;
            }
            else if (functionName === 'get_weather') {
                try {
                    // Defaulting to Delhi coordinates if location isn't accurately parsed
                    // 28.61, 77.20 (New Delhi)
                    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.20&current_weather=true`);
                    const weatherData = await res.json();
                    if (weatherData && weatherData.current_weather) {
                        const temp = Math.round(weatherData.current_weather.temperature);
                        const code = weatherData.current_weather.weathercode;
                        const isClear = code <= 1;
                        const isCloudy = code > 1 && code <= 3;
                        let cond = isClear ? 'Clear' : isCloudy ? 'Cloudy' : 'Rain/Storm';

                        finalReply = `The current weather is ${temp}°C and ${cond}.`;
                        actionTakenText = "Checked weather";
                    } else {
                        throw new Error("No data");
                    }
                } catch (e) {
                    finalReply = "I couldn't fetch the weather right now.";
                }
            }
            else if (functionName === 'control_spotify') {
                try {
                    finalReply = await controlSpotify(userId, args.action, args.query);
                    actionTakenText = `Spotify: ${args.action} ${args.query || ''}`;
                } catch (e) {
                    finalReply = e.message;
                    actionTakenText = "Spotify interaction failed";
                }
            }
        }
    }

    return { reply: finalReply || "Done!", action: actionTakenText };
}

module.exports = { processAssistantChat };
