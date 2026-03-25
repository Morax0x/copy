const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'prefix',
    aliases: ['set-prefix', 'بريفكس'],
    category: "Admin",
    description: "Set server prefix",
    cooldown: 3,

    async execute (message, args) {
        const isSlash = !!message.isChatInputCommand;
        if (isSlash) return;

        const guild = message.guild;
        const client = message.client;
        const member = message.member;
        const db = client.sql; // PostgreSQL / Supabase Database

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`);
        }

        if (!args[0]) return message.reply(`❌ **الرجاء كتابة البريفكس الجديد.**\nمثال: \`-prefix !\``);
        const newPrefix = args[0];

        let currentPrefix = "-";
        try {
            // 🔥 نقرأ البريفكس الحالي من جدول settings (نفس الجدول الذي يستخدمه messageCreate) 🔥
            let res;
            try {
                res = await db.query(`SELECT "prefix" FROM settings WHERE "guild" = $1`, [guild.id]);
            } catch(e) {
                res = await db.query(`SELECT prefix FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]}));
            }
            
            if (res && res.rows.length > 0 && (res.rows[0].prefix || res.rows[0].prefix)) {
                currentPrefix = res.rows[0].prefix || res.rows[0].prefix;
            }
        } catch (e) {
            console.error("Error fetching current prefix:", e);
        }

        if(newPrefix === currentPrefix) {
            return message.reply(`⚠ **هذا هو البريفكس الحالي بالفعل!**`);
        }

        try {
            // 🔥 تحديث البريفكس في جدول settings بدلاً من إنشاء جدول جديد 🔥
            try {
                await db.query(`
                    INSERT INTO settings ("guild", "prefix") 
                    VALUES ($1, $2) 
                    ON CONFLICT("guild") DO UPDATE SET "prefix" = EXCLUDED."prefix"
                `, [guild.id, newPrefix]);
            } catch(e) {
                await db.query(`
                    INSERT INTO settings (guild, prefix) 
                    VALUES ($1, $2) 
                    ON CONFLICT(guild) DO UPDATE SET prefix = EXCLUDED.prefix
                `, [guild.id, newPrefix]).catch(()=>{});
            }
            
            return message.reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error("Prefix change error:", error);
            return message.reply("❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**");
        }
    }
}
