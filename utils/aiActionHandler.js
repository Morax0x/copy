const SQLite = require("better-sqlite3");
const path = require('path');

const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

module.exports = {
    /**
     * تنفيذ الأوامر المرفقة في رد الذكاء الاصطناعي
     */
    executeActions: async (message, actionCode) => {
        const userID = message.author.id;
        const guildID = message.guild.id;

        console.log(`[AI Action] Received request: ${actionCode} for user: ${message.author.tag}`);

        // =========================================================
        // 1. 💰 أمر إعطاء المورا (معدل)
        // =========================================================
        if (actionCode === 'GIVE_MORA') {
            try {
                const userData = sql.prepare("SELECT mora, bank FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
                const totalWealth = (userData?.mora || 0) + (userData?.bank || 0);
                
                // 🔥 التعديل 1: الحد الأقصى للثروة صار 10,000
                if (totalWealth >= 10000) {
                    console.log("[AI Action] Give Mora Rejected: User is too rich (>10k).");
                    return false; 
                }

                // 🔥 التعديل 2: المبلغ الممنوح صار 1000
                sql.prepare("INSERT INTO levels (user, guild, mora) VALUES (?, ?, 1000) ON CONFLICT(user, guild) DO UPDATE SET mora = mora + 1000").run(userID, guildID);
                
                await message.react('💸').catch(e => console.error("Failed to react:", e));
                console.log("[AI Action] Give Mora Success (1000 added).");
                return true;
            } catch (e) {
                console.error("[AI Action Error] Give Mora:", e);
            }
        }

        // =========================================================
        // 2. 🚫 أمر التايم أوت (معدل لدقيقة واحدة)
        // =========================================================
        // نتحقق من الكلمتين عشان نضمن يشتغل مع أي برومبت
        if (actionCode === 'TIMEOUT' || actionCode === 'TIMEOUT_5M') {
            try {
                // 🛑 فحص الأمان 1: هل العضو موجود؟
                if (!message.member) {
                    console.log("[AI Timeout] Failed: Member object not found.");
                    return false;
                }

                // 🛑 فحص الأمان 2: هل البوت يقدر عليه؟
                if (!message.member.moderatable) {
                    console.log(`[AI Timeout] Failed: Bot cannot punish ${message.author.tag}.`);
                    await message.reply("ما أقدر أعاقبك.. رتبتك أعلى مني! 😤").catch(() => {});
                    return false;
                }

                // 🔥 التعديل 3: المدة دقيقة واحدة (60 ثانية)
                await message.member.timeout(60 * 1000, "بأمر من الإمبراطورة (إزعاج/تطاول)");
                
                await message.react('🤐').catch(() => {});
                console.log(`[AI Timeout] Success: ${message.author.tag} muted for 1 min.`);
                return true;

            } catch (e) {
                console.error("[AI Action Error] Timeout:", e);
                if (e.code === 50013) {
                    console.log("⚠️ Missing Permissions: Please give the bot 'Moderate Members' permission.");
                }
            }
        }

        return false;
    }
};
