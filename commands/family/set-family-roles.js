const { PermissionsBitField, EmbedBuilder } = require("discord.js");

module.exports = {
    name: 'set-family-role',
    description: 'تحديد رتب العائلة (يمكن تحديد أكثر من رتبة لنفس الجنس)',
    aliases: ['sfr', 'set-role'],
    
    async execute(message, args) {
        // 1. التحقق من الصلاحيات
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **عذراً، هذا الأمر للمسؤولين (Admins) فقط!**");
        }

        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;

        // 2. التحقق من المدخلات
        const type = args[0] ? args[0].toLowerCase() : null;
        // جلب جميع الرتب المذكورة في الرسالة
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

        // 3. تجهيز الداتابيس
        sql.prepare(`
            CREATE TABLE IF NOT EXISTS family_config (
                guildID TEXT PRIMARY KEY,
                maleRole TEXT,
                femaleRole TEXT,
                divorceFee INTEGER DEFAULT 5000,
                adoptFee INTEGER DEFAULT 2000
            )
        `).run();

        // ضمان وجود سجل للسيرفر
        sql.prepare("INSERT OR IGNORE INTO family_config (guildID) VALUES (?)").run(guildId);

        // 4. تحديد العمود والنص
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

        // 5. حفظ الرتب كقائمة (JSON Array)
        // نحول مجموعة الرتب إلى مصفوفة من الآيديات فقط
        const roleIds = roles.map(r => r.id);
        const rolesJson = JSON.stringify(roleIds); // يحولها لنص مثل "['123','456']"

        try {
            const stmt = sql.prepare(`UPDATE family_config SET ${column} = ? WHERE guildID = ?`);
            stmt.run(rolesJson, guildId);

            // تجهيز قائمة الأسماء للإيمبد
            const roleMentions = roles.map(r => `${r}`).join(' , ');

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('✅ تم تحديث إعدادات العائلة')
                .setDescription(`تم تعيين رتب **${typeText}** بنجاح!\n\n**الرتب المعتمدة:**\n${roleMentions}`)
                .setFooter({ text: `عدد الرتب: ${roles.size}` })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            message.reply("❌ حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.");
        }
    }
};
