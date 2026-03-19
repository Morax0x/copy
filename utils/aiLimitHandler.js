const DEFAULT_DAILY_LIMIT = 20;

const pendingRequests = new Map();

function getTodayDate() {
    return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
}

module.exports = {
    getUserDailyLimit: async (member, db) => {
        if (!member || !member.roles) return DEFAULT_DAILY_LIMIT;

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

        if ((userUsage.lastResetDate || userUsage.lastresetdate) !== today) {
            await db.query('UPDATE ai_user_usage SET "dailyUsage" = 0, "lastResetDate" = $1 WHERE "userID" = $2', [today, userId]);
            userUsage.dailyUsage = 0;
        }

        const maxDailyLimit = await module.exports.getUserDailyLimit(member, db);

        const userPending = pendingRequests.get(userId) || [];
        const pendingFree = userPending.filter(type => type === 'free').length;
        const pendingPurchased = userPending.filter(type => type === 'purchased').length;

        const currentDailyUsage = parseInt(userUsage.dailyUsage || userUsage.dailyusage) + pendingFree;
        const currentPurchasedBalance = parseInt(userUsage.purchasedBalance || userUsage.purchasedbalance) - pendingPurchased;

        if (currentDailyUsage < maxDailyLimit) {
            userPending.push('free');
            pendingRequests.set(userId, userPending);
            return { canChat: true, source: 'free' };
        }

        if (currentPurchasedBalance > 0) {
            userPending.push('purchased');
            pendingRequests.set(userId, userPending);
            return { canChat: true, source: 'purchased' };
        }

        return { canChat: false, reason: 'limit_reached' };
    },

    incrementUsage: async (userId, db) => {
        const userPending = pendingRequests.get(userId) || [];
        const actionType = userPending.shift() || 'free'; 
        
        if (userPending.length === 0) pendingRequests.delete(userId);
        else pendingRequests.set(userId, userPending);

        const userDataRes = await db.query('SELECT * FROM ai_user_usage WHERE "userID" = $1', [userId]);
        const userData = userDataRes.rows[0];
        if (!userData) return;

        if (actionType === 'free') {
            await db.query('UPDATE ai_user_usage SET "dailyUsage" = "dailyUsage" + 1 WHERE "userID" = $1', [userId]);
        } else if (actionType === 'purchased') {
            await db.query('UPDATE ai_user_usage SET "purchasedBalance" = "purchasedBalance" - 1 WHERE "userID" = $1', [userId]);
        }
    },
    
    releasePendingUsage: (userId) => {
        const userPending = pendingRequests.get(userId) || [];
        if (userPending.length > 0) {
            userPending.shift();
            if (userPending.length === 0) pendingRequests.delete(userId);
            else pendingRequests.set(userId, userPending);
        }
    },

    addPurchasedBalance: async (userId, amount, db) => {
        const today = getTodayDate();
        await db.query(`
            INSERT INTO ai_user_usage ("userID", "guildID", "dailyUsage", "purchasedBalance", "lastResetDate") 
            VALUES ($1, 'Unknown', 0, $2, $3) 
            ON CONFLICT("userID") DO UPDATE SET "purchasedBalance" = ai_user_usage."purchasedBalance" + $4
        `, [userId, amount, today, amount]);
    },

    setRoleLimit: async (guildID, roleID, limit, db) => {
        await db.query(`
            INSERT INTO ai_role_limits ("guildID", "roleID", "limitCount") 
            VALUES ($1, $2, $3) 
            ON CONFLICT ("guildID", "roleID") DO UPDATE SET "limitCount" = EXCLUDED."limitCount"
        `, [guildID, roleID, limit]);
    }
};
