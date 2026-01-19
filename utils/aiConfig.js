const SQLite = require("better-sqlite3");
const path = require('path');

// ربط مباشر بقاعدة البيانات الرئيسية
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

// ⚡ الذاكرة المؤقتة (Cache) لسرعة الاستجابة
const channelsCache = new Map();
const blacklistCache = new Set();
const restrictedCategoriesCache = new Set(); // كاش للكتاغوريات المقفلة

// 🔥 دالة التهيئة: تسحب البيانات من الملف وتضعها في الذاكرة عند التشغيل
function init() {
    try {
        // 1. تحميل القنوات المفعلة (Ai Channels)
        const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_channels'").get();
        if (tableCheck['count(*)'] > 0) {
            const channels = sql.prepare("SELECT * FROM ai_channels").all();
            channelsCache.clear();
            channels.forEach(row => {
                channelsCache.set(row.channelID, { nsfw: !!row.isNsfw });
            });
            console.log(`[AI Config] ✅ Loaded ${channels.length} channels from DB.`);
        }

        // 2. تحميل المحظورين (Blacklist)
        const blacklistCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_blacklist'").get();
        if (blacklistCheck['count(*)'] > 0) {
            const blocked = sql.prepare("SELECT userID FROM ai_blacklist").all();
            blacklistCache.clear();
            blocked.forEach(row => blacklistCache.add(row.userID));
            console.log(`[AI Config] ✅ Loaded ${blocked.length} blocked users.`);
        }

        // 3. تحميل الكتاغوريات المقفلة (Restricted Categories)
        const catCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_restricted_categories'").get();
        if (catCheck['count(*)'] > 0) {
            const categories = sql.prepare("SELECT categoryID FROM ai_restricted_categories").all();
            restrictedCategoriesCache.clear();
            categories.forEach(row => restrictedCategoriesCache.add(row.categoryID));
            console.log(`[AI Config] ✅ Loaded ${categories.length} restricted categories.`);
        }

    } catch (e) {
        console.error("[AI Config] ⚠️ Error loading cache:", e.message);
    }
}

module.exports = {
    init, // تصدير دالة البدء

    // ==========================================
    // 1. إدارة القنوات الدائمة (Permanent Channels)
    // ==========================================
    addChannel: (channelId, isNsfw = false) => {
        const nsfwInt = isNsfw ? 1 : 0;
        try {
            sql.prepare("INSERT OR REPLACE INTO ai_channels (channelID, isNsfw) VALUES (?, ?)").run(channelId, nsfwInt);
            channelsCache.set(channelId, { nsfw: isNsfw });
        } catch (e) { console.error("[AI Config] Save Error:", e.message); }
    },

    removeChannel: (channelId) => {
        try {
            sql.prepare("DELETE FROM ai_channels WHERE channelID = ?").run(channelId);
            channelsCache.delete(channelId);
        } catch (e) { console.error("[AI Config] Delete Error:", e.message); }
    },

    getChannelSettings: (channelId) => {
        // نبحث في القنوات الدائمة أولاً
        if (channelsCache.has(channelId)) {
            return channelsCache.get(channelId);
        }
        
        // إذا لم توجد، نبحث في القنوات المدفوعة المؤقتة
        // (لا نستخدم الكاش هنا لأنها مؤقتة وتنتهي صلاحيتها بسرعة)
        const paidData = sql.prepare("SELECT * FROM ai_paid_channels WHERE channelID = ?").get(channelId);
        if (paidData) {
            // التحقق من انتهاء الوقت
            if (Date.now() > paidData.expiresAt) {
                sql.prepare("DELETE FROM ai_paid_channels WHERE channelID = ?").run(channelId);
                return null;
            }
            return { nsfw: paidData.mode === 'NSFW' };
        }

        return null;
    },

    getAllChannels: () => {
        const obj = {};
        channelsCache.forEach((val, key) => { obj[key] = val; });
        return obj;
    },

    // ==========================================
    // 2. إدارة البلاك ليست (Blacklist)
    // ==========================================
    blockUser: (userId) => {
        sql.prepare("INSERT OR IGNORE INTO ai_blacklist (userID) VALUES (?)").run(userId);
        blacklistCache.add(userId);
    },
    unblockUser: (userId) => {
        sql.prepare("DELETE FROM ai_blacklist WHERE userID = ?").run(userId);
        blacklistCache.delete(userId);
    },
    isBlocked: (userId) => {
        return blacklistCache.has(userId);
    },

    // ==========================================
    // 3. إدارة الكتاغوريات المقفلة (Restricted Categories)
    // ==========================================
    addRestrictedCategory: (guildId, categoryId) => {
        sql.prepare("INSERT OR REPLACE INTO ai_restricted_categories (guildID, categoryID) VALUES (?, ?)").run(guildId, categoryId);
        restrictedCategoriesCache.add(categoryId);
    },

    removeRestrictedCategory: (categoryId) => {
        sql.prepare("DELETE FROM ai_restricted_categories WHERE categoryID = ?").run(categoryId);
        restrictedCategoriesCache.delete(categoryId);
    },

    isRestrictedCategory: (categoryId) => {
        if (!categoryId) return false;
        return restrictedCategoriesCache.has(categoryId);
    },

    // ==========================================
    // 4. إدارة القنوات المدفوعة (Paid Channels)
    // ==========================================
    setPaidChannel: (guildId, channelId, mode) => {
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 ساعة
        sql.prepare("INSERT OR REPLACE INTO ai_paid_channels (channelID, guildID, mode, expiresAt) VALUES (?, ?, ?, ?)").run(channelId, guildId, mode, expiresAt);
    },

    getPaidChannelStatus: (channelId) => {
        const data = sql.prepare("SELECT * FROM ai_paid_channels WHERE channelID = ?").get(channelId);
        if (!data) return null;
        
        // حذف القناة إذا انتهى الوقت
        if (Date.now() > data.expiresAt) {
            sql.prepare("DELETE FROM ai_paid_channels WHERE channelID = ?").run(channelId);
            return null;
        }
        return data;
    }
};
