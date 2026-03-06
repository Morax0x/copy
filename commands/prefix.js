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
        const db = client.sql;

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`);
        }

        if (!args[0]) return message.reply(`❌ **الرجاء كتابة البريفكس الجديد.**\nمثال: \`-prefix !\``);
        const newPrefix = args[0];

        let currentPrefix = "-";
        try {
            const res = await db.query("SELECT prefix FROM settings WHERE guild = $1", [guild.id]);
            if (res.rows.length > 0 && res.rows[0].prefix) currentPrefix = res.rows[0].prefix;
        } catch (e) {
            
        }

        if(newPrefix === currentPrefix) {
            return message.reply(`⚠ **هذا هو البريفكس الحالي بالفعل!**`);
        }

        try {
            await db.query(`
                INSERT INTO settings (guild, prefix) 
                VALUES ($1, $2) 
                ON CONFLICT(guild) DO UPDATE SET prefix = EXCLUDED.prefix
            `, [guild.id, newPrefix]);
            
            return message.reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error("Prefix change error:", error);
            return message.reply("❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**");
        }
    }
}
