// handlers/weekly-role.js

const path = require('path');
const rootDir = process.cwd(); // ضمان المسار الصحيح دائماً

// استدعاء الثوابت بشكل آمن
let OWNER_ID = "1145327691772481577"; 
try {
    const constants = require(path.join(rootDir, 'handlers', 'dungeon', 'constants.js'));
    OWNER_ID = constants.OWNER_ID;
} catch (e) { console.log("[WeeklyRole] Warning: Constants file not found, using default ID."); }

// ⚙️ الإعدادات
const CONFIG = {
    GUILD_ID: "848921014141845544", 
    ROLE_ID: "1408766278570872934", 
    UPDATE_INTERVAL: 10 * 60 * 1000 
};

// دالة حساب بداية الأسبوع (الجمعة) بدقة UTC لتطابق الداتابيس
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7;
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0);
    return friday.toISOString().split('T')[0];
}

async function updateWeeklyRole(client) {
    try {
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        if (!guild) return; 

        const role = guild.roles.cache.get(CONFIG.ROLE_ID);
        if (!role) return console.log("[WeeklyRole] ❌ Role not found!");

        const sql = client.sql;
        const weekStart = getWeekStartDateString();

        // 1. 🔥 الاستعلام المحسن (الدقيق) 🔥
        // - COALESCE: تحول القيم الفارغة (NULL) إلى 0 عشان الحساب ما يخرب
        // - الترتيب: بالنقاط أولاً، ثم بعدد الرسائل ككسر تعادل
        const topUser = sql.prepare(`
            SELECT userID, 
                   (COALESCE(messages, 0) * 15 + COALESCE(vc_minutes, 0) * 10) as score 
            FROM user_weekly_stats 
            WHERE guildID = ? AND userID != ? AND weekStartDate = ? 
            ORDER BY score DESC, messages DESC
            LIMIT 1
        `).get(CONFIG.GUILD_ID, OWNER_ID, weekStart);

        if (!topUser || topUser.score <= 0) {
            // console.log("[WeeklyRole] No active users this week yet.");
            return; 
        }

        // جلب العضو من الديسكورد للتأكد أنه موجود بالسيرفر
        const winnerMember = await guild.members.fetch(topUser.userID).catch(() => null);
        if (!winnerMember) return; // العضو غادر السيرفر

        // 2. التحقق من أصحاب الرتبة الحاليين
        const currentHolders = role.members;

        // هل الفائز الحالي هو نفسه اللي معه الرتبة؟
        if (currentHolders.has(topUser.userID) && currentHolders.size === 1) {
            // نعم هو نفسه، ولا يوجد أحد غيره معه الرتبة -> لا تفعل شيئاً
            return;
        }

        console.log(`👑 [WeeklyRole] New King Detected: ${winnerMember.user.tag} (Score: ${topUser.score})`);

        // 3. سحب الرتبة من القدامى
        for (const [memberID, member] of currentHolders) {
            if (memberID !== topUser.userID) {
                await member.roles.remove(role).catch(e => console.error(`[WeeklyRole] Failed to remove role from ${memberID}:`, e.message));
            }
        }

        // 4. إعطاء الرتبة للفائز الجديد
        if (!currentHolders.has(topUser.userID)) {
            await winnerMember.roles.add(role).catch(e => console.error(`[WeeklyRole] Failed to add role to ${topUser.userID}:`, e.message));
            
            // (اختياري) إرسال رسالة في شات عام تبارك له
            // const chat = guild.channels.cache.get("آيدي_شات_عام");
            // if(chat) chat.send(`👑 **تغير الحكم!**\nالآن <@${topUser.userID}> هو **ولي العهد** الجديد بتفاعل الأسبوع!`);
        }

    } catch (error) {
        console.error("[WeeklyRole] Error:", error);
    }
}

module.exports = (client) => {
    setTimeout(() => updateWeeklyRole(client), 5000); 
    setInterval(() => {
        updateWeeklyRole(client);
    }, CONFIG.UPDATE_INTERVAL);
};
