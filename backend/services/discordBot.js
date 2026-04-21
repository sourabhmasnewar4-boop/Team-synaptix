const { Client, GatewayIntentBits } = require('discord.js');
const { processAssistantChat } = require('./aiAssistant');

let client = null;

function initDiscordBot({ mqttPublish, broadcastToUser }) {
    const token = process.env.DISCORD_BOT_TOKEN;

    if (!token) {
        console.log('ℹ️  Discord Bot disabled (DISCORD_BOT_TOKEN missing)');
        return;
    }

    try {
        client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

        client.once('ready', () => {
            console.log(`🎮 Discord Bot logged in as ${client.user.tag}`);
        });

        client.on('messageCreate', async (msg) => {
            if (msg.author.bot) return;

            // Only respond to @mentions or specific trigger words if in a group chat/server
            if (!msg.content.startsWith('!home') && !msg.mentions.has(client.user)) {
                return; // Ignore general chatter
            }

            const ownerUserId = process.env.FIREBASE_OWNER_USER_ID;

            if (!ownerUserId) {
                return msg.reply('⚠️ Admin must set FIREBASE_OWNER_USER_ID in the backend server to link devices.');
            }

            // Clean up the `@bot_name` or `!home` prefix if present
            const textToProcess = msg.content.replace(/<@!?\d+>/g, '').replace('!home', '').trim();

            if (!textToProcess) {
                return msg.reply('Hi! I am your AutoHome AI. Ask me to turn on the lights or check states.');
            }

            try {
                msg.channel.sendTyping();
                const response = await processAssistantChat(ownerUserId, textToProcess, { mqttPublish, broadcastToUser });
                msg.reply(`🤖 ${response.reply}`);
            } catch (error) {
                console.error('Discord AI Error:', error);
                msg.reply('⚠️ Sorry, I could not process your smart home request.');
            }
        });

        client.login(token).catch(err => {
            console.error('⚠️ Discord Login failed:', err.message);
        });
    } catch (err) {
        console.error('⚠️ Discord Bot init failed:', err.message);
    }
}

module.exports = { initDiscordBot };
