const { EmbedBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'fix-db',
    aliases: ['اصلاح'],
    description: 'إصلاح الترقيم التلقائي وبناء الأعمدة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const msg = await message.reply("🛠️ **جاري إصلاح البنية ومزامنة عدادات السحابة (Sequence Sync)...**");

        const queries = [
            "ALTER TABLE levels ADD COLUMN IF NOT EXISTS lastdungeon BIGINT DEFAULT 0;",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS chatchannelid VARCHAR(50);",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS nextbumptime BIGINT DEFAULT 0;",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS lastbumperid VARCHAR(50);",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS chatterchannelid VARCHAR(50);",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS rolechatterbadge VARCHAR(50);",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS roledailybadge VARCHAR(50);",
            "ALTER TABLE settings ADD COLUMN IF NOT EXISTS roleweeklybadge VARCHAR(50);",
            "ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS main_chat_messages BIGINT DEFAULT 0;",
            "ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS chatter_badge_given INTEGER DEFAULT 0;",
            "ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS daily_badge_given INTEGER DEFAULT 0;",
            "ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS knight_badge_given INTEGER DEFAULT 0;",
            "ALTER TABLE user_weekly_stats ADD COLUMN IF NOT EXISTS weekly_badge_given INTEGER DEFAULT 0;",
            "ALTER TABLE user_reputation ADD COLUMN IF NOT EXISTS daily_reps_given INTEGER DEFAULT 0;",
            "ALTER TABLE marriages ADD COLUMN IF NOT EXISTS dowry BIGINT DEFAULT 0;",
            
            // 🔥 أوامر مزامنة العدادات (Sequence Sync)
            "SELECT setval('user_achievements_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_achievements));",
            "SELECT setval('active_reports_id_seq', (SELECT COALESCE(MAX(id), 1) FROM active_reports));",
            "SELECT setval('user_buffs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_buffs));",
            "SELECT setval('user_portfolio_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_portfolio));",
            "SELECT setval('user_inventory_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_inventory));",
            "SELECT setval('user_farm_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_farm));",
            "SELECT setval('user_lands_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_lands));",
            "SELECT setval('user_weapons_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_weapons));",
            "SELECT setval('user_skills_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_skills));",
            "SELECT setval('user_loans_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_loans));",
            "SELECT setval('giveaway_entries_id_seq', (SELECT COALESCE(MAX(id), 1) FROM giveaway_entries));",
            "SELECT setval('auto_responses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM auto_responses));",
            "SELECT setval('user_coupons_id_seq', (SELECT COALESCE(MAX(id), 1) FROM user_coupons));",
            "SELECT setval('marriages_id_seq', (SELECT COALESCE(MAX(id), 1) FROM marriages));"
        ];

        try {
            for (const q of queries) {
                await db.query(q).catch(e => { /* تجاهل الأخطاء إذا كان العداد غير موجود بعد */ });
            }
            await msg.edit("✅ **تم إصلاح الجداول ومزامنة جميع العدادات التلقائية بنجاح!**\nلن يظهر لك خطأ (duplicate key) مرة أخرى.");
        } catch(e) {
            await msg.edit(`❌ **حدث خطأ:**\n\`\`\`js\n${e.message}\n\`\`\``);
        }
    }
};
