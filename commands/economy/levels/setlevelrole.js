const { PermissionsBitField, EmbedBuilder } = require("discord.js");

module.exports = {
    name: 'setlevelrole',
    aliases: ['رتبة-لفل', 'setlvlrole'],
    description: 'لتعيين رتبة يحصل عليها العضو عند وصوله للفل معين',
    category: "Settings", // يمكنك تغييره إلى "Levels" إذا أردت
    permissions: ['ManageRoles'],
    usage: '-setlevelrole <level> <@role>',

    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من صلاحيات المستخدم
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ ليس لديك صلاحية `Manage Roles` لاستخدام هذا الأمر!');
        }

        // 2. التحقق من المدخلات (اللفل)
        const level = parseInt(args[0]);
        if (isNaN(level) || level <= 0) {
            return message.reply('❌ يجب تحديد رقم لفل صحيح (أكبر من 0).\n**مثال:** `-setlevelrole 10 @RoleName`');
        }

        // 3. التحقق من المدخلات (الرتبة)
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ يجب تحديد رول صحيح (منشن أو آي دي).\n**مثال:** `-setlevelrole 10 @RoleName`');
        }

        // 4. التحقق من صلاحيات البوت (أعلى من الرتبة)
        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ لا يمكنني إضافة هذا الرول لأن رتبته أعلى من رتبتي في السيرفر!');
        }

        // 5. التحقق من أن الرتبة ليست @everyone
        if (role.id === message.guild.id) {
             return message.reply('❌ لا يمكنك استخدام رتبة `@everyone` كجائزة لفل.');
        }

        try {
            // 6. حفظ الإعدادات
            // (سيقوم بتحديث الإعداد إذا كان اللفل موجوداً، أو إضافة جديد)
            sql.prepare("INSERT OR REPLACE INTO level_roles (guildID, level, roleID) VALUES (?, ?, ?)")
                .run(message.guild.id, level, role.id);

            const embed = new EmbedBuilder()
                .setColor(0x57F287) // أخضر
                .setTitle('✅ تم تعيين رتبة اللفل بنجاح!')
                .setDescription(`سيتم إعطاء رتبة ${role} تلقائياً لأي عضو يصل إلى **لفل ${level}**.\n(سيتم إزالة الرتب الأقل تلقائياً).`);

            return message.reply({ embeds: [embed] });

        } catch (err) {
            console.error("Error in setlevelrole command:", err);
            return message.reply('❌ حدث خطأ أثناء محاولة حفظ الإعدادات في قاعدة البيانات.');
        }
    }
};