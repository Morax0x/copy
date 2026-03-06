const { PermissionsBitField, EmbedBuilder } = require("discord.js");

module.exports = {
    name: 'set-family-role',
    description: 'تحديد رتب العائلة (يمكن تحديد أكثر من رتبة لنفس الجنس)',
    aliases: ['sfr', 'set-role'],
    
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **عذراً، هذا الأمر للمسؤولين (Admins) فقط!**");
        }

        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        const type = args[0] ? args[0].toLowerCase() : null;
        const roles = message.mentions.roles;

        if (!type || roles.size === 0) {
            return message.reply(`
❌ **طريقة الاستخدام خطأ!**
حدد النوع (ولد/بنت) ثم منشن رتبة واحدة أو أكثر.

**أمثلة:**
\`${message.content.split(' ')[0]} ولد @Male1 @Male2\`
\`${message.content.split(' ')[0]} بنت @Female\`
            `);
        }

        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS family_config (
                    guildID TEXT PRIMARY KEY,
                    maleRole TEXT,
                    femaleRole TEXT,
                    divorceFee BIGINT DEFAULT 5000,
                    adoptFee BIGINT DEFAULT 2000
                )
            `);

            await db.query("INSERT INTO family_config (guildID) VALUES ($1) ON CONFLICT (guildID) DO NOTHING", [guildId]);
        } catch (e) {
            console.error("Family Config DB Error:", e);
        }

        let column = "";
        let typeText = "";
        let color = 0x000000;

        if (['male', 'boy', 'ولد', 'ذكر'].includes(type)) {
            column = "maleRole";
            typeText = "👨 الذكور (Males)";
            color = 0x00a8ff;
        } else if (['female', 'girl', 'بنت', 'انثى'].includes(type)) {
            column = "femaleRole";
            typeText = "👩 الإناث (Females)";
            color = 0xff0055;
        } else {
            return message.reply("❌ **النوع غير معروف!** اكتب (ولد) أو (بنت).");
        }

        const roleIds = Array.from(roles.values()).map(r => r.id);
        const rolesJson = JSON.stringify(roleIds); 

        try {
            await db.query(`UPDATE family_config SET "${column}" = $1 WHERE guildID = $2`, [rolesJson, guildId]);

            const roleMentions = Array.from(roles.values()).map(r => `<@&${r.id}>`).join(' , ');

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('✅ تم تحديث إعدادات العائلة')
                .setDescription(`تم تعيين رتب **${typeText}** بنجاح!\n\n**الرتب المعتمدة:**\n${roleMentions}`)
                .setFooter({ text: `عدد الرتب: ${roles.size}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            message.reply("❌ حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.");
        }
    }
};
