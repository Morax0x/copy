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

        // 1. 💰 أمر إعطاء المورا
        if (actionCode === 'GIVE_MORA') {
            try {
                const userData = sql.prepare("SELECT mora, bank FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
                const totalWealth = (userData?.mora || 0) + (userData?.bank || 0);
                
                if (totalWealth > 1000) {
                    console.log("[AI Action] Give Mora Rejected: User is too rich.");
                    return false; 
                }

                sql.prepare("INSERT INTO levels (user, guild, mora) VALUES (?, ?, 100) ON CONFLICT(user, guild) DO UPDATE SET mora = mora + 100").run(userID, guildID);
                await message.react('💸').catch(e => console.error("Failed to react:", e));
                console.log("[AI Action] Give Mora Success.");
                return true;
            } catch (e) {
                console.error("[AI Action Error] Give Mora:", e);
            }
        }

        // 2. 🚫 أمر التايم أوت
        if (actionCode === 'TIMEOUT_5M') {
            try {
                // 🛑 فحص الأمان 1: هل العضو موجود؟
                if (!message.member) {
                    console.log("[AI Timeout] Failed: Member object not found.");
                    return false;
                }

                // 🛑 فحص الأمان 2: هل البوت يقدر عليه؟ (أهم فحص)
                if (!message.member.moderatable) {
                    console.log(`[AI Timeout] Failed: Bot cannot punish ${message.author.tag}. (User role is higher or is Owner).`);
                    await message.reply("ما أقدر أعاقبك.. رتبتك أعلى مني يا قوي! 😤").catch(() => {});
                    return false;
                }

                // تنفيذ العقاب
                await message.member.timeout(5 * 60 * 1000, "بأمر من الإمبراطورة (إزعاج/تطاول)");
                await message.react('🤐').catch(() => {});
                console.log(`[AI Timeout] Success: ${message.author.tag} muted for 5 mins.`);
                return true;

            } catch (e) {
                console.error("[AI Action Error] Timeout:", e);
                // في حال نقص الصلاحيات
                if (e.code === 50013) {
                    console.log("⚠️ Missing Permissions: Please give the bot 'Moderate Members' permission.");
                }
            }
        }

        return false;
    }
};
