const SQLite = require("better-sqlite3");
const path = require('path');

// ربط قاعدة البيانات
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

/**
 * الحصول على تاريخ اليوم بتوقيت السعودية (للتصفير)
 */
function getKsaDate() {
    return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
}

module.exports = {
    /**
     * حساب الحد اليومي للعضو بناءً على رتبه
     */
    getUserDailyLimit: async (member) => {
        const guildID = member.guild.id;
        // جلب كل إعدادات الرتب من الداتابيس
        const allLimits = sql.prepare("SELECT roleID, limitCount FROM ai_role_limits WHERE guildID = ?").all(guildID);
        
        let totalLimit = 0;
        
        // التحقق من رتب العضو وجمع الرصيد (تراكمي)
        // نعطي حد أدنى 5 رسائل للجميع (كرم من الإمبراطورة) إلا لو تبي تخليه 0
        let baseLimit = 2; 

        if (allLimits.length > 0) {
            member.roles.cache.forEach(role => {
                const limitData = allLimits.find(l => l.roleID === role.id);
                if (limitData) {
                    totalLimit += limitData.limitCount;
                }
            });
        }

        return baseLimit + totalLimit;
    },

    /**
     * التحقق من حالة المستخدم (هل يسمح له بالكلام؟)
     */
    checkUserUsage: async (member) => {
        const today = getKsaDate();
        const userID = member.id;
        const guildID = member.guild.id;

        // جلب بيانات المستخدم
        let userData = sql.prepare("SELECT * FROM ai_user_usage WHERE userID = ?").get(userID);

        // إذا لم يوجد سجل، ننشئ واحد جديد
        if (!userData) {
            userData = { userID, guildID, dailyUsage: 0, purchasedBalance: 0, lastResetDate: today };
            sql.prepare("INSERT INTO ai_user_usage (userID, guildID, dailyUsage, purchasedBalance, lastResetDate) VALUES (?, ?, 0, 0, ?)").run(userID, guildID, today);
        }

        // 🔥 التصفير التلقائي (الساعة 12 بليل) 🔥
        if (userData.lastResetDate !== today) {
            userData.dailyUsage = 0;
            userData.lastResetDate = today;
            // نحدث الداتابيس بالتاريخ الجديد ونصفر العداد
            sql.prepare("UPDATE ai_user_usage SET dailyUsage = 0, lastResetDate = ? WHERE userID = ?").run(today, userID);
        }

        // حساب الحد الأقصى المسموح له
        const maxDailyLimit = await module.exports.getUserDailyLimit(member);
        
        // المعادلة: (المستخدم المجاني) + (الرصيد المشترى) - (المستهلك)
        const remainingDaily = Math.max(0, maxDailyLimit - userData.dailyUsage);
        const totalRemaining = remainingDaily + userData.purchasedBalance;

        return {
            canChat: totalRemaining > 0,
            dailyUsed: userData.dailyUsage,
            dailyLimit: maxDailyLimit,
            purchasedRemaining: userData.purchasedBalance,
            totalRemaining: totalRemaining
        };
    },

    /**
     * تسجيل استهلاك رسالة (خصم من الرصيد)
     */
    incrementUsage: (userID) => {
        const userData = sql.prepare("SELECT * FROM ai_user_usage WHERE userID = ?").get(userID);
        if (!userData) return;

        // المنطق: نخصم من اليومي أولاً، إذا خلص نخصم من المشترى
        // لكن هنا سنزيد عداد الاستخدام اليومي فقط، والتحقق يتم في الدالة السابقة
        
        // تحديث بسيط: نزيد الاستخدام اليومي.
        // (ملاحظة: إذا تجاوز الحد اليومي، سنقوم بإنقاص الرصيد المشترى في معادلة أخرى لو أردت، 
        // لكن الأسهل هو زيادة العداد والتحقق يعتمد على (الحد + المشترى > الاستهلاك)
        
        sql.prepare("UPDATE ai_user_usage SET dailyUsage = dailyUsage + 1 WHERE userID = ?").run(userID);
        
        // إذا تعدى الحد اليومي، ننقص من الرصيد المشترى (اختياري، أو نعتمد المعادلة الفوق)
        // الطريقة الأفضل:
        // نعتمد المعادلة في checkUserUsage، وإذا الشخص اشترى رصيد، نزيد خانة purchasedBalance
        // ولما يجي بكرة، الـ dailyUsage يتصفر، بس purchasedBalance يبقى معه.
    },

    /**
     * شراء رصيد إضافي
     */
    addPurchasedBalance: (userID, amount) => {
        sql.prepare("INSERT INTO ai_user_usage (userID, guildID, dailyUsage, purchasedBalance, lastResetDate) VALUES (?, ?, 0, ?, ?) ON CONFLICT(userID) DO UPDATE SET purchasedBalance = purchasedBalance + ?").run(userID, 'GUILD_ID', amount, getKsaDate(), amount);
    },
    
    /**
     * أمر إداري لتعيين حد لرتبة معينة
     */
    setRoleLimit: (guildID, roleID, limit) => {
        sql.prepare("INSERT OR REPLACE INTO ai_role_limits (guildID, roleID, limitCount) VALUES (?, ?, ?)").run(guildID, roleID, limit);
    }
};
