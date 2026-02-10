const { EmbedBuilder, PermissionsBitField, Colors } = require("discord.js");

module.exports = {
    name: "setcamps",
    aliases: ["تحديد_خيم", "scamp", "setcampfire", "campadmin"],
    description: "إدارة حدود الخيم للرتب (عرض القائمة أو تعيين حد جديد)",
    category: "Admin",
    usage: "-setcamps [@Role] [Number]",

    async execute(message, args) {
        const { guild, client } = message;
        const sql = client.sql;

        // 1. التحقق من الصلاحيات (أدمن فقط)
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **ليس لديك صلاحية لاستخدام هذا الأمر.**");
        }

        // ============================================================
        // الحالة الأولى: عرض القائمة (إذا لم يحدد رتبة)
        // ============================================================
        if (!args[0]) {
            // جلب البيانات من الجدول
            const allRoles = sql.prepare("SELECT roleID, limitCount FROM role_campfire_limits WHERE guildID = ? ORDER BY limitCount DESC").all(guild.id);

            if (!allRoles || allRoles.length === 0) {
                return message.reply({ 
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("⛺ إعدادات الخيم")
                            .setDescription("❌ **لا توجد رتب مخصصة حالياً.**\nجميع اللاعبين لديهم الحد الافتراضي (خيمة واحدة).")
                            .setColor(Colors.Red)
                            .setFooter({ text: "استخدم الأمر مع رتبة لتخصيص العدد." })
                    ]
                });
            }

            // تنسيق القائمة
            let description = "**قائمة الرتب وعدد الخيم المسموح:**\n\n";
            let foundCount = 0;

            allRoles.forEach((data, index) => {
                const role = guild.roles.cache.get(data.roleID);
                if (role) {
                    description += `**${index + 1}.** ${role} ➔ \`${data.limitCount}\` ⛺\n`;
                    foundCount++;
                } else {
                    // تنظيف الرتب المحذوفة تلقائياً
                    sql.prepare("DELETE FROM role_campfire_limits WHERE guildID = ? AND roleID = ?").run(guild.id, data.roleID);
                }
            });

            if (foundCount === 0) description = "لا توجد بيانات (تم تنظيف الرتب المحذوفة).";

            const listEmbed = new EmbedBuilder()
                .setTitle("⛺ لوحة تحكم الخيم (Campfire Limits)")
                .setColor(Colors.Blue)
                .setDescription(description)
                .addFields({ 
                    name: '💡 طريقة التعديل:', 
                    value: `\`${this.usage || '-setcamps @Role 5'}\`` 
                })
                .setThumbnail("https://i.postimg.cc/KcJ6gtzV/22.jpg");

            return message.reply({ embeds: [listEmbed] });
        }

        // ============================================================
        // الحالة الثانية: تعيين حد جديد لرتبة
        // ============================================================
        
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        const limit = parseInt(args[1]);

        // التحقق من صحة المدخلات
        if (!role) {
            return message.reply("⚠️ **لم يتم العثور على الرتبة!** تأكد من منشن الرتبة أو وضع الآيدي بشكل صحيح.");
        }

        if (isNaN(limit) || limit < 1) {
            return message.reply("⚠️ **الرقم غير صحيح!** يجب أن يكون عدد الخيم 1 أو أكثر.\nمثال: `-setcamps @VIP 5`");
        }

        try {
            // الحفظ في قاعدة البيانات
            sql.prepare("INSERT OR REPLACE INTO role_campfire_limits (guildID, roleID, limitCount) VALUES (?, ?, ?)")
                .run(guild.id, role.id, limit);

            const successEmbed = new EmbedBuilder()
                .setTitle("✅ تم تحديث إعدادات الخيم")
                .setColor(Colors.Green)
                .setDescription(
                    `تم بنجاح تعيين الحد الأقصى للخيم لهذه الرتبة:\n\n` +
                    `🔰 **الرتبة:** ${role}\n` +
                    `🔢 **العدد الجديد:** \`${limit}\` خيم يومياً`
                )
                .setThumbnail("https://i.postimg.cc/KcJ6gtzV/22.jpg")
                .setFooter({ text: `تم التعديل بواسطة: ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            message.reply({ embeds: [successEmbed] });

        } catch (err) {
            console.error(err);
            message.reply("❌ حدث خطأ تقني أثناء حفظ البيانات.");
        }
    }
};
