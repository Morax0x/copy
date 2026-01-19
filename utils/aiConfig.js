const SQLite = require("better-sqlite3");
const path = require('path');

// ربط مباشر بقاعدة البيانات الرئيسية
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

// الذاكرة المؤقتة (Cache) لسرعة الاستجابة
const channelsCache = new Map();
const blacklistCache = new Set();

// 🔥 دالة التهيئة: تسحب البيانات من الملف وتضعها في الذاكرة عند التشغيل
function init() {
    try {
        // 1. تحميل القنوات
        // تأكد أن الجدول موجود لتجنب الأخطاء في أول تشغيل
        const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_channels'").get();
        
        if (tableCheck['count(*)'] > 0) {
            const channels = sql.prepare("SELECT * FROM ai_channels").all();
            channelsCache.clear();
            channels.forEach(row => {
                channelsCache.set(row.channelID, { nsfw: !!row.isNsfw });
            });
            console.log(`[AI Config] ✅ Loaded ${channels.length} channels from DB.`);
        }

        // 2. تحميل المحظورين
        const blacklistCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_blacklist'").get();
        if (blacklistCheck['count(*)'] > 0) {
            const blocked = sql.prepare("SELECT userID FROM ai_blacklist").all();
            blacklistCache.clear();
            blocked.forEach(row => blacklistCache.add(row.userID));
            console.log(`[AI Config] ✅ Loaded ${blocked.length} blocked users.`);
        }

    } catch (e) {
        console.error("[AI Config] ⚠️ Error loading cache:", e.message);
    }
}

module.exports = {
    init, // تصدير دالة البدء

    // إضافة قناة (حفظ في الداتابيس + الذاكرة)
    addChannel: (channelId, isNsfw = false) => {
        const nsfwInt = isNsfw ? 1 : 0;
        try {
            sql.prepare("INSERT OR REPLACE INTO ai_channels (channelID, isNsfw) VALUES (?, ?)").run(channelId, nsfwInt);
            channelsCache.set(channelId, { nsfw: isNsfw });
        } catch (e) { console.error("[AI Config] Save Error:", e.message); }
    },

    // حذف قناة
    removeChannel: (channelId) => {
        try {
            sql.prepare("DELETE FROM ai_channels WHERE channelID = ?").run(channelId);
            channelsCache.delete(channelId);
        } catch (e) { console.error("[AI Config] Delete Error:", e.message); }
    },

    // الاستعلام (من الذاكرة لسرعة الأداء)
    getChannelSettings: (channelId) => {
        return channelsCache.get(channelId) || null;
    },

    getAllChannels: () => {
        const obj = {};
        channelsCache.forEach((val, key) => { obj[key] = val; });
        return obj;
    },

    // البلاك ليست
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
    }
};
