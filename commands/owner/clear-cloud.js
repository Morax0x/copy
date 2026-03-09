const { EmbedBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'clear-cloud',
    aliases: ['تفريغ-السحابة'],
    description: 'مسح جميع بيانات السحابة استعداداً لهجرة جديدة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const msg = await message.reply("⚠️ **تحذير: جاري تفريغ جميع البيانات في السحابة (بدون حذف الصناديق)...**");

        try {
            // هذا أمر متقدم في PostgreSQL يقوم بتفريغ كل الجداول دفعة واحدة
            await db.query(`
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            `);
            
            await msg.edit("✅ **تم مسح جميع البيانات من السحابة بنجاح!**\nالسحابة الآن فارغة ونظيفة وجاهزة تماماً لاستقبال الملف الجديد.\n\nاكتب `-mc` للبدء في الهجرة الجديدة!");
        } catch(e) {
            await msg.edit(`❌ **حدث خطأ أثناء التفريغ:**\n\`\`\`js\n${e.message}\n\`\`\``);
        }
    }
};
