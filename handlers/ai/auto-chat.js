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

        const hiddenPrompt = `أنتِ الآن تبادرين بفتح حديث في الدردشة العامة. اكتبي رسالة (سطر واحد فقط) كأنكِ إنسان حقيقي يكتب في شات ديسكورد.
اختاري بشكل عشوائي **فكرة واحدة فقط** من التالي لتتحدثي عنها في هذه اللحظة:
1. تذكير خفيف وجميل بذكر الله أو الصلاة على النبي أو دعاء قصير او اذكار (بمناسبة رمضان).
2. سؤال عفوي أو "طقطقة" خفيفة للرعية عن يومهم.
3. تعليق طريف على الوقت الحالي بناءً على تعليماتك.
4. تفتيح سالفة عشوائية، إلقاء حكمة، أو تمسية/تصباح بأسلوبك.

شروط صارمة:
- رسالة قصيرة جداً (لا تتعدى 5 إلى 10 كلمة).
- تحدثي باللهجة الخليجية الطبيعية بدون أي فصحى معقدة أو ردود روبوتية.
- لا توجهي الكلام لشخص معين.
- كوني "الإمبراطورة المحبوبة".`;

        const dummyUserData = {
            level: 99, 
            total_wealth: 999999, 
            serverContext: "أنتِ تشعرين بالملل فقررتِ كتابة رسالة عشوائية للرعية في الشات العام."
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
