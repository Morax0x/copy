const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'setlevelchannel',
    description: 'تحديد القناة التي سيتم إرسال رسائل الترقية (Level Up) فيها.',
    aliases: ['setlvlchannel', 'setlevel-channel', 'تحديد-روم-اللفل', 'روم-اللفل'],
    category: 'Admin',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;

        // التحقق من صلاحيات الأدمن
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ ليس لديك صلاحيات إدارية لاستخدام هذا الأمر.");
        }

        const embed = new EmbedBuilder().setColor(Colors.Green).setTimestamp();

        // الخيار 1: إعادة التعيين إلى الوضع الافتراضي (الإرسال في نفس روم الرسالة)
        if (args[0] && (args[0].toLowerCase() === 'reset' || args[0].toLowerCase() === 'default' || args[0] === 'افتراضي' || args[0] === 'تصفير')) {
            try {
                // 🔥 التعديل هنا: الحفظ في جدول settings وعمود levelChannel بقيمة NULL للوضع الافتراضي
                sql.prepare("INSERT INTO settings (guild, levelChannel) VALUES (?, NULL) ON CONFLICT(guild) DO UPDATE SET levelChannel = NULL")
                    .run(message.guild.id);

                embed.setDescription("✅ تم إعادة تعيين إعدادات قناة الترقية. سيتم الآن إرسال البطاقة في نفس القناة التي يتفاعل فيها العضو.");
                return message.reply({ embeds: [embed] });
            } catch (err) {
                console.error("Error resetting level channel:", err);
                return message.reply("❌ حدث خطأ أثناء محاولة إعادة تعيين الإعدادات.");
            }
        }

        // الخيار 2: تحديد قناة جديدة
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);

        if (!targetChannel) {
            embed.setColor(Colors.Red)
                 .setTitle("❌ خطأ في الاستخدام")
                 .setDescription("الرجاء منشن القناة أو وضع الـ ID الخاص بها.\n\n" +
                               "**للتحديد:**\n" +
                               "`-setlevelchannel #الروم`\n\n" +
                               "**لإعادة التعيين (الإرسال في نفس القناة):**\n" +
                               "`-setlevelchannel reset`");
            return message.reply({ embeds: [embed] });
        }

        // التأكد من أن البوت يستطيع الكتابة في القناة
        const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
        if (!botPermissions.has(PermissionsBitField.Flags.SendMessages) || !botPermissions.has(PermissionsBitField.Flags.EmbedLinks) || !botPermissions.has(PermissionsBitField.Flags.AttachFiles)) {
            embed.setColor(Colors.Red)
                 .setDescription(`❌ ليس لدي الصلاحيات الكافية في القناة ${targetChannel}.\nأحتاج إلى: \`SendMessages\`, \`EmbedLinks\`, \`AttachFiles\`.`);
            return message.reply({ embeds: [embed] });
        }

        // حفظ الإعدادات
        try {
            // 🔥 التعديل هنا: الحفظ في جدول settings وعمود levelChannel
            sql.prepare("INSERT INTO settings (guild, levelChannel) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET levelChannel = excluded.levelChannel")
                .run(message.guild.id, targetChannel.id);

            embed.setDescription(`✅ تم تحديد قناة ${targetChannel} كقناة رسمية لبطاقات الترقية (Level Up).`);
            await message.reply({ embeds: [embed] });

        } catch (err) {
            console.error("Error setting level channel:", err);
            return message.reply("❌ حدث خطأ أثناء حفظ الإعدادات في قاعدة البيانات.");
        }
    },
};
