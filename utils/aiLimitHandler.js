// utils/aiLimitHandler.js

const DEFAULT_DAILY_LIMIT = 20; // الحد المجاني للكل

function getTodayDate() {
    return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
}

module.exports = {
    /**
     * حساب الحد اليومي (أساسي + رتب)
     */
    getUserDailyLimit: async (member, db) => {
        const guildID = member.guild.id;
        const allLimitsRes = await db.query("SELECT roleid, limitcount FROM ai_role_limits WHERE guildid = $1", [guildID]);
        const allLimits = allLimitsRes.rows;
        
        let totalLimit = 0;
        let baseLimit = DEFAULT_DAILY_LIMIT; 

        if (allLimits.length > 0) {
            member.roles.cache.forEach(role => {
                const limitData = allLimits.find(l => l.roleid === role.id);
                if (limitData) {
                    totalLimit += parseInt(limitData.limitcount);
                }
            });
        }

        return baseLimit + totalLimit;
    },

    /**
     * فحص هل يسمح للعضو بالتحدث؟
     */
    checkUserUsage: async (member) => {
        const db = member.client.sql;
        const userId = member.id;
        const guildId = member.guild.id;
        const today = getTodayDate();

        let userUsageRes = await db.query("SELECT * FROM ai_user_usage WHERE userid = $1", [userId]);
        let userUsage = userUsageRes.rows[0];

        if (!userUsage) {
            userUsage = { userid: userId, guildid: guildId, dailyusage: 0, purchasedbalance: 0, lastresetdate: today };
            await db.query("INSERT INTO ai_user_usage (userid, guildid, dailyusage, purchasedbalance, lastresetdate) VALUES ($1, $2, 0, 0, $3)", [userId, guildId, today]);
        }

        // تصفير العداد اليومي
        if (userUsage.lastresetdate !== today) {
            await db.query("UPDATE ai_user_usage SET dailyusage = 0, lastresetdate = $1 WHERE userid = $2", [today, userId]);
            userUsage.dailyusage = 0;
        }

        const maxDailyLimit = await module.exports.getUserDailyLimit(member, db);

        // هل بقي لديه رصيد مجاني؟
        if (parseInt(userUsage.dailyusage) < maxDailyLimit) {
            return { canChat: true, source: 'free' };
        }

        // هل لديه رصيد مدفوع؟
        if (parseInt(userUsage.purchasedbalance) > 0) {
            return { canChat: true, source: 'purchased' };
        }

        return { canChat: false, reason: 'limit_reached' };
    },

    /**
     * تسجيل استهلاك رسالة (الخصم الفعلي)
     */
    incrementUsage: async (userId, db) => {
        // البحث عن بيانات المستخدم
        const userDataRes = await db.query("SELECT * FROM ai_user_usage WHERE userid = $1", [userId]);
        const userData = userDataRes.rows[0];
        if (!userData) return;

        // زيادة الاستخدام اليومي دائماً
        await db.query("UPDATE ai_user_usage SET dailyusage = dailyusage + 1 WHERE userid = $1", [userId]);

        // إذا كان الاستخدام اليومي يتجاوز الحد الافتراضي ولديه رصيد مدفوع، نخصم منه
        if (parseInt(userData.dailyusage) >= DEFAULT_DAILY_LIMIT && parseInt(userData.purchasedbalance) > 0) {
             await db.query("UPDATE ai_user_usage SET purchasedbalance = purchasedbalance - 1 WHERE userid = $1", [userId]);
        }
    },
    
    /**
     * إضافة رصيد مشترى للعضو
     */
    addPurchasedBalance: async (userId, amount, db) => {
        const today = getTodayDate();
        await db.query(`
            INSERT INTO ai_user_usage (userid, guildid, dailyusage, purchasedbalance, lastresetdate) 
            VALUES ($1, 'Unknown', 0, $2, $3) 
            ON CONFLICT(userid) DO UPDATE SET purchasedbalance = ai_user_usage.purchasedbalance + $4
        `, [userId, amount, today, amount]);
    },

    /**
     * تحديد حد الاستخدام اليومي لرتبة معينة
     */
    setRoleLimit: async (guildID, roleID, limit, db) => {
        await db.query(`
            INSERT INTO ai_role_limits (guildid, roleid, limitcount) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (guildid, roleid) DO UPDATE SET limitcount = EXCLUDED.limitcount
        `, [guildID, roleID, limit]);
    }
};
