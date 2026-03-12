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
        const allLimitsRes = await db.query('SELECT "roleID", "limitCount" FROM ai_role_limits WHERE "guildID" = $1', [guildID]);
        const allLimits = allLimitsRes.rows;
        
        let totalLimit = 0;
        let baseLimit = DEFAULT_DAILY_LIMIT; 

        if (allLimits.length > 0) {
            member.roles.cache.forEach(role => {
                const limitData = allLimits.find(l => (l.roleID || l.roleid) === role.id);
                if (limitData) {
                    totalLimit += parseInt(limitData.limitCount || limitData.limitcount);
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

        let userUsageRes = await db.query('SELECT * FROM ai_user_usage WHERE "userID" = $1', [userId]);
        let userUsage = userUsageRes.rows[0];

        if (!userUsage) {
            userUsage = { userID: userId, guildID: guildId, dailyUsage: 0, purchasedBalance: 0, lastResetDate: today };
            await db.query('INSERT INTO ai_user_usage ("userID", "guildID", "dailyUsage", "purchasedBalance", "lastResetDate") VALUES ($1, $2, 0, 0, $3)', [userId, guildId, today]);
        }

        // تصفير العداد اليومي
        if ((userUsage.lastResetDate || userUsage.lastresetdate) !== today) {
            await db.query('UPDATE ai_user_usage SET "dailyUsage" = 0, "lastResetDate" = $1 WHERE "userID" = $2', [today, userId]);
            userUsage.dailyUsage = 0;
        }

        const maxDailyLimit = await module.exports.getUserDailyLimit(member, db);

        // هل بقي لديه رصيد مجاني؟
        if (parseInt(userUsage.dailyUsage || userUsage.dailyusage) < maxDailyLimit) {
            return { canChat: true, source: 'free' };
        }

        // هل لديه رصيد مدفوع؟
        if (parseInt(userUsage.purchasedBalance || userUsage.purchasedbalance) > 0) {
            return { canChat: true, source: 'purchased' };
        }

        return { canChat: false, reason: 'limit_reached' };
    },

    /**
     * تسجيل استهلاك رسالة (الخصم الفعلي)
     */
    incrementUsage: async (userId, db) => {
        // البحث عن بيانات المستخدم
        const userDataRes = await db.query('SELECT * FROM ai_user_usage WHERE "userID" = $1', [userId]);
        const userData = userDataRes.rows[0];
        if (!userData) return;

        // زيادة الاستخدام اليومي دائماً
        await db.query('UPDATE ai_user_usage SET "dailyUsage" = "dailyUsage" + 1 WHERE "userID" = $1', [userId]);

        // إذا كان الاستخدام اليومي يتجاوز الحد الافتراضي ولديه رصيد مدفوع، نخصم منه
        if (parseInt(userData.dailyUsage || userData.dailyusage) >= DEFAULT_DAILY_LIMIT && parseInt(userData.purchasedBalance || userData.purchasedbalance) > 0) {
             await db.query('UPDATE ai_user_usage SET "purchasedBalance" = "purchasedBalance" - 1 WHERE "userID" = $1', [userId]);
        }
    },
    
    /**
     * إضافة رصيد مشترى للعضو
     */
    addPurchasedBalance: async (userId, amount, db) => {
        const today = getTodayDate();
        await db.query(`
            INSERT INTO ai_user_usage ("userID", "guildID", "dailyUsage", "purchasedBalance", "lastResetDate") 
            VALUES ($1, 'Unknown', 0, $2, $3) 
            ON CONFLICT("userID") DO UPDATE SET "purchasedBalance" = ai_user_usage."purchasedBalance" + $4
        `, [userId, amount, today, amount]);
    },

    /**
     * تحديد حد الاستخدام اليومي لرتبة معينة
     */
    setRoleLimit: async (guildID, roleID, limit, db) => {
        await db.query(`
            INSERT INTO ai_role_limits ("guildID", "roleID", "limitCount") 
            VALUES ($1, $2, $3) 
            ON CONFLICT ("guildID", "roleID") DO UPDATE SET "limitCount" = EXCLUDED."limitCount"
        `, [guildID, roleID, limit]);
    }
};
