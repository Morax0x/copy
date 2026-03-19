const config = require('../../config.json');
const { buildSystemPrompt } = require('./persona');
const { generateResponse } = require('./engine');
const { getLeaderboardKnowledge } = require('./serverLore');

const CHAT_CHANNEL_ID = '1478254814973395055'; 
const GUILD_ID = '848921014141845544'; 

async function triggerAutoChat(client) {
    try {
        const channel = client.channels.cache.get(CHAT_CHANNEL_ID);
        if (!channel) return;

        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const db = client.sql;

        const leaderboardInfo = await getLeaderboardKnowledge(db, GUILD_ID);
        const systemInstruction = buildSystemPrompt(false, leaderboardInfo, false);

        // 🔥 نظام اختيار عشوائي: 50% أذكار، 50% سوالف خفيفة 🔥
        const isAthkarMode = Math.random() < 0.5;
        
        let hiddenPrompt = "";
        let serverContext = "";

        if (isAthkarMode) {
            // 🛑 وضع الأذكار فقط 🛑
            hiddenPrompt = `أنتِ الآن تبادرين بالحديث في الدردشة العامة.
المطلوب منكِ **فقط حصرياً** كتابة تذكير بذكر الله، دعاء قصير، صلاة على النبي، أو استغفار. 

شروط صارمة جداً:
- يمنع منعاً باتاً السوالف العشوائية أو الطقطقة أو الحديث عن النفس في هذه الرسالة. فقط أذكار وأدعية.
- نوعي دائماً وابتكري في الأذكار والأدعية ولا تكرري نفس العبارات، واربطيها بوقت اليوم بذكاء (مثلاً تذكير بالوتر في الليل، أو دعاء للصباح).
- رسالة قصيرة جداً (لا تتعدى 5 إلى 10 كلمات).
- تحدثي بلطف وبأسلوب خليجي راقي يليق بـ "الإمبراطورة المحبوبة".
- لا توجهي الكلام لشخص معين.`;
            
            serverContext = "أنتِ ترغبين بتذكير الرعية بذكر الله بأسلوب راقٍ ومتجدد.";
        } else {
            // 🛑 وضع السوالف وكسر الهدوء فقط 🛑
            hiddenPrompt = `أنتِ الآن تبادرين بالحديث في الدردشة العامة لكسر الهدوء.
المطلوب منكِ فتح سالفة خفيفة، أو طرح سؤال ممتع على الأعضاء، أو الطقطقة بشكل لطيف، أو الحديث عن الأجواء.

شروط صارمة جداً:
- يمنع منعاً باتاً كتابة أدعية أو أذكار في هذه الرسالة. فقط سوالف ودردشة عادية.
- تحدثي بأسلوب خليجي عفوي، مرح، وفيه ثقة "الإمبراطورة المحبوبة".
- رسالة قصيرة جداً (لا تتعدى 10 إلى 15 كلمة).
- لا توجهي الكلام لشخص معين، بل للجميع في الروم.
- اطرحي سؤالاً أو افتحي موضوعاً خفيفاً يشجع الأعضاء على الرد والتفاعل معكِ.`;
            
            serverContext = "أنتِ تشعرين بالملل وتريدين فتح نقاش أو سالفة ممتعة مع الرعية.";
        }

        const dummyUserData = {
            level: 99, 
            total_wealth: 999999, 
            serverContext: serverContext
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
    }, 1000 * 60 * 40); 
}

module.exports = { startAutoChat, triggerAutoChat };
