const { EmbedBuilder, PermissionsBitField, Colors } = require("discord.js");

module.exports = {
    name: "setcamps",
    aliases: ["تحديد_خيم", "scamp", "setcampfire"],
    description: "تحديد الحد الأقصى للخيم لرتبة معينة",
    category: "Admin",
    usage: "-setcamps @Role [Number]",

    async execute(message, args) {
        const { guild, client } = message;
        const sql = client.sql;

        // 1. التحقق من الصلاحيات (أدمن فقط)
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **ليس لديك صلاحية لاستخدام هذا الأمر.**");
        }

        // 2. التحقق من المدخلات
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        const limit = parseInt(args[1]);

        if (!role || isNaN(limit)) {
            return message.reply({ 
                content: `**⚠️ طريقة الاستخدام الخاطئة!**\nالصحيح: \`${this.usage}\`\nمثال: \`-setcamps @VIP 5\`` 
            });
        }

        if (limit < 1) {
            return message.reply("⚠️ **الحد الأدنى هو خيمة واحدة.**");
        }

        // 3. الحفظ في قاعدة البيانات
        try {
            sql.prepare("INSERT OR REPLACE INTO role_campfire_limits (guildID, roleID, limitCount) VALUES (?, ?, ?)")
                .run(guild.id, role.id, limit);

            const embed = new EmbedBuilder()
                .setTitle("⛺ تم تحديث نظام الخيم")
                .setColor(Colors.Green)
                .setDescription(
                    `✅ **تم بنجاح!**\n\n` +
                    `🔰 **الرتبة:** ${role}\n` +
                    `🔢 **عدد الخيم المسموح:** \`${limit}\` خيم يومياً`
                )
                .setThumbnail("https://i.postimg.cc/KcJ6gtzV/22.jpg")
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            message.reply("❌ حدث خطأ أثناء حفظ البيانات.");
        }
    }
};
