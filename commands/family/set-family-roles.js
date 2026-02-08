const { PermissionsBitField, EmbedBuilder } = require("discord.js");

module.exports = {
    name: 'set-family-role',
    description: 'تحديد رتب العائلة بشكل منفصل (للإدارة)',
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
        // الطريقة المتوقعة: !sfr [نوع] [منشن الرتبة]
        // الأنواع: male, boy, ولد | female, girl, بنت

        const type = args[0] ? args[0].toLowerCase() : null;
        const role = message.mentions.roles.first();

        if (!type || !role) {
            return message.reply(`
❌ **طريقة الاستخدام خطأ!**
حدد النوع (ولد/بنت) ثم منشن الرتبة.

**أمثلة:**
\`${message.content.split(' ')[0]} ولد @MaleRole\`
\`${message.content.split(' ')[0]} بنت @FemaleRole\`
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

        // ضمان وجود سجل للسيرفر قبل التعديل
        sql.prepare("INSERT OR IGNORE INTO family_config (guildID) VALUES (?)").run(guildId);

        // 4. تحديد العملية بناءً على الكلمة الأولى
        let column = "";
        let typeText = "";

        if (['male', 'boy', 'ولد', 'ذكر'].includes(type)) {
            column = "maleRole";
            typeText = "👨 الذكور (Male)";
        } else if (['female', 'girl', 'بنت', 'انثى'].includes(type)) {
            column = "femaleRole";
            typeText = "👩 الإناث (Female)";
        } else {
            return message.reply("❌ **النوع غير معروف!** اكتب (ولد) أو (بنت).");
        }

        // 5. التنفيذ والحفظ
        try {
            // تحديث العمود المحدد فقط دون المساس بالآخر
            const stmt = sql.prepare(`UPDATE family_config SET ${column} = ? WHERE guildID = ?`);
            stmt.run(role.id, guildId);

            const embed = new EmbedBuilder()
                .setColor(column === "maleRole" ? 0x00a8ff : 0xff0055) // أزرق للولد، وردي للبنت
                .setTitle('✅ تم تحديث الإعدادات')
                .setDescription(`تم تعيين رتبة **${typeText}** بنجاح:\n\n**الرتبة:** ${role}`)
                .setTimestamp();

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            message.reply("❌ حدث خطأ أثناء حفظ البيانات.");
        }
    }
};
