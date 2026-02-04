// handlers/weekly-role.js

const { OWNER_ID } = require('./dungeon/constants.js'); // تأكد ان مسار ملف الثوابت صح

// ⚙️ الإعدادات الخاصة بالسيرفر والرتبة
const CONFIG = {
    GUILD_ID: "848921014141845544", // آيدي السيرفر الرئيسي
    ROLE_ID: "1408766278570872934", // آيدي رتبة ولي العهد
    UPDATE_INTERVAL: 10 * 60 * 1000 // التحديث كل 10 دقائق
};

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
        if (!guild) return; // السيرفر غير موجود او البوت مب فيه

        const role = guild.roles.cache.get(CONFIG.ROLE_ID);
        if (!role) return console.log("[WeeklyRole] Role not found!");

        const sql = client.sql;
        const weekStart = getWeekStartDateString();

        // 1. جلب التوب 1 حالياً (باستخدام نفس معادلة السكور)
        // (messages * 15 + vc_minutes * 10)
        const topUser = sql.prepare(`
            SELECT userID, (messages * 15 + vc_minutes * 10) as score 
            FROM user_weekly_stats 
            WHERE guildID = ? AND userID != ? AND weekStartDate = ? AND score > 0 
            ORDER BY score DESC 
            LIMIT 1
        `).get(CONFIG.GUILD_ID, OWNER_ID, weekStart);

        if (!topUser) return; // لا يوجد متصدرين بعد

        // 2. التحقق من صاحب الرتبة الحالي
        // نبحث عن أي شخص معه الرتبة حالياً
        const currentHolders = role.members;

        // هل المتصدر الحالي يملك الرتبة بالفعل؟
        if (currentHolders.has(topUser.userID) && currentHolders.size === 1) {
            // كل شيء تمام، هو معه الرتبة ومافي غيره
            return;
        }

        console.log(`[WeeklyRole] Updating Prince Role. New King: ${topUser.userID}`);

        // 3. سحب الرتبة من الجميع (المتصدرين السابقين)
        for (const [memberID, member] of currentHolders) {
            if (memberID !== topUser.userID) {
                await member.roles.remove(role).catch(e => console.error(`Failed to remove role from ${memberID}:`, e.message));
            }
        }

        // 4. إعطاء الرتبة للمتصدر الجديد
        const winnerMember = await guild.members.fetch(topUser.userID).catch(() => null);
        if (winnerMember) {
            await winnerMember.roles.add(role).catch(e => console.error(`Failed to add role to ${topUser.userID}:`, e.message));
        }

    } catch (error) {
        console.error("[WeeklyRole] Error:", error);
    }
}

// دالة التشغيل التي سنستدعيها في الملف الرئيسي
module.exports = (client) => {
    // تشغيل أول مرة عند بدء البوت
    setTimeout(() => updateWeeklyRole(client), 5000); 

    // تشغيل دوري كل 10 دقائق
    setInterval(() => {
        updateWeeklyRole(client);
    }, CONFIG.UPDATE_INTERVAL);
};
