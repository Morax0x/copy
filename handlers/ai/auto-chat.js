const { buildSystemPrompt } = require('./persona');
const { generateResponse } = require('./engine');
const { getLeaderboardKnowledge } = require('./serverLore');
const SQLite = require("better-sqlite3");
const path = require('path');
const config = require('../../config.json');

const dbPath = path.join(__dirname, '../..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

const CHAT_CHANNEL_ID = '1478254814973395055'; 
const GUILD_ID = '848921014141845544'; 

async function triggerAutoChat(client) {
    try {
        const channel = client.channels.cache.get(CHAT_CHANNEL_ID);
        if (!channel) return;

        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const leaderboardInfo = getLeaderboardKnowledge(sql, GUILD_ID);
        const systemInstruction = buildSystemPrompt(false, leaderboardInfo, false);

        const hiddenPrompt = `أنتِ الآن تبادرين بالحديث في الدردشة العامة بمناسبة شهر رمضان المبارك.
المطلوب منكِ **فقط حصرياً** كتابة تذكير بذكر الله، دعاء قصير، صلاة على النبي، أو استغفار. 

شروط صارمة جداً:
- يمنع منعاً باتاً السوالف العشوائية أو الطقطقة أو الحديث عن النفس (مثل الأكل، الجوع، الطفش، الخ). فقط أذكار وأدعية.
- نوعي دائماً وابتكري في الأذكار والأدعية ولا تكرري نفس العبارات، واربطيها بوقت اليوم بذكاء (مثلاً تذكير بالوتر في الليل، دعاء للصباح، أو للصائمين قبل الإفطار).
- رسالة قصيرة جداً (لا تتعدى 5 إلى 10 كلمات).
- تحدثي بلطف وبأسلوب خليجي راقي يليق بـ "الإمبراطورة المحبوبة".
- لا توجهي الكلام لشخص معين.`;

        const dummyUserData = {
            level: 99, 
            total_wealth: 999999, 
            serverContext: "أنتِ ترغبين بتذكير الرعية بذكر الله وكسب الأجر في هذا الشهر الفضيل بأسلوب متجدد."
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
    }, 1000 * 60 * 40); // ⏱️ تم التعديل هنا: 40 دقيقة
}

module.exports = { startAutoChat, triggerAutoChat };
