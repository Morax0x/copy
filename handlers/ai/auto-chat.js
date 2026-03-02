const { buildSystemPrompt } = require('./persona');
const { generateResponse } = require('./engine');
const { getLeaderboardKnowledge } = require('./serverLore');
const SQLite = require("better-sqlite3");
const path = require('path');
const config = require('../../config.json');

const dbPath = path.join(__dirname, '../..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

const CHAT_CHANNEL_ID = '1394245421521698837'; 
const GUILD_ID = '848921014141845544'; 

async function triggerAutoChat(client) {
    try {
        const channel = client.channels.cache.get(CHAT_CHANNEL_ID);
        if (!channel) return;

        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const leaderboardInfo = getLeaderboardKnowledge(sql, GUILD_ID);
        const systemInstruction = buildSystemPrompt(false, leaderboardInfo, false);

        const hiddenPrompt = "اكتبي رسالة قصيرة جداً (سطر أو سطرين بالكثير) كأنك تفتحين سالفة أو تمسين/تصبحين على الموجودين في الشات بشكل عشوائي وعفوي، أو تذكرين الله تذكيراً خفيفاً بما أننا في رمضان. لا توجهي الكلام لشخص معين، بل للجميع في القاعة. (تذكري أنك الإمبراطورة، وتذكري حالة الوقت ورمضان المكتوبة في تعليماتك).";

        const dummyUserData = {
            level: 99, 
            total_wealth: 999999, 
            serverContext: "أنتِ الآن تبادرين بالحديث في القاعة العامة."
        };

        const response = await generateResponse(
            apiKey,
            systemInstruction,
            hiddenPrompt,
            dummyUserData,
            client.user.id, 
            "System",
            null,
            false,
            null
        );

        if (response) {
            let finalMessage = response.replace(/\[ACTION:[^\]]+\]/g, '').trim();
            if (finalMessage) {
                await channel.send(finalMessage);
            }
        }

    } catch (error) {
        console.error("[Auto-Chat Error]:", error);
    }
}

function startAutoChat(client) {
    setInterval(() => {
        triggerAutoChat(client);
    }, 1000 * 60 * 60); 
}

module.exports = { startAutoChat, triggerAutoChat };
