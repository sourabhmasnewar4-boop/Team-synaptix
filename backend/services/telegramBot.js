const TelegramBot = require('node-telegram-bot-api');
const { processAssistantChat } = require('./aiAssistant');
const { getFirestore } = require('firebase-admin/firestore');

let bot = null;
let botInfo = { enabled: false, username: null };

function initTelegramBot({ mqttPublish, broadcastToUser }) {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        console.log('ℹ️  Telegram Bot disabled (TELEGRAM_BOT_TOKEN missing)');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: true });

        bot.getMe().then(me => {
            botInfo = { enabled: true, username: me.username };
            console.log(`🤖 Telegram Bot started as @${me.username}`);
        });

        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';
            const db = getFirestore();

            // Check if this chat is linked to a Firebase User
            const linkRef = db.collection('telegram_links').doc(chatId.toString());
            const linkSnap = await linkRef.get();
            let userId = linkSnap.exists ? linkSnap.data().userId : null;

            if (text.startsWith('/start ')) {
                const parts = text.split(' ');
                const uid = parts[1];
                if (uid) {
                    await linkRef.set({ userId: uid });
                    return bot.sendMessage(chatId, '🎉 Successfully linked to your AutoHome account! You can now send commands like "Turn on the lights."');
                }
            }

            if (text === '/start') {
                return bot.sendMessage(chatId, '🏠 Welcome to AutoHome!\nPlease link your account from the AutoHome Dashboard Integrations page first.');
            }

            if (!userId) {
                return bot.sendMessage(chatId, '⚠️ Unauthorized. Please link your account from the AutoHome Dashboard.');
            }

            await bot.sendChatAction(chatId, 'typing');

            try {
                const response = await processAssistantChat(userId, text, { mqttPublish, broadcastToUser });
                bot.sendMessage(chatId, `🤖 ${response.reply}`);
            } catch (error) {
                console.error('Telegram AI Error:', error);
                bot.sendMessage(chatId, '⚠️ Sorry, I could not process that request.');
            }
        });

        bot.on('polling_error', (error) => {
            console.log('Telegram Polling Error:', error.message);
        });
    } catch (err) {
        console.error('⚠️ Telegram Bot init failed:', err.message);
    }
}

function getTelegramInfo() {
    return botInfo;
}

module.exports = { initTelegramBot, getTelegramInfo };
