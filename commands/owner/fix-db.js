const { EmbedBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'fix-db',
    aliases: ['اصلاح'],
    description: 'إنشاء الأعمدة المفقودة في السحابة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const msg = await message.reply("🛠️ **جاري بناء الأعمدة المفقودة في السحابة لإنقاذ البيانات...**");

        // الأوامر التي ستجبر السحابة على إضافة الصناديق الناقصة بناءً على تقريرك
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
            "ALTER TABLE marriages ADD COLUMN IF NOT EXISTS dowry BIGINT DEFAULT 0;"
        ];

        try {
            for (const q of queries) {
                await db.query(q);
            }
            await msg.edit("✅ **تم بناء جميع الأعمدة الـ 15 بنجاح! السحابة الآن متطابقة 100% مع ملفك الإمبراطوري.**\n\nالآن أنت جاهز للهجرة الأخيرة، اكتب `-mc`!");
        } catch(e) {
            await msg.edit(`❌ **حدث خطأ أثناء الإصلاح:**\n\`\`\`js\n${e.message}\n\`\`\``);
        }
    }
};
