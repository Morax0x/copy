const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const aiLimitHandler = require('../../../utils/aiLimitHandler');
const SQLite = require("better-sqlite3");
const path = require('path');

// الاتصال بقاعدة البيانات لجلب القائمة
const dbPath = path.join(__dirname, '../../../mainDB.sqlite');
const sql = new SQLite(dbPath);

module.exports = {
    name: 'set-ai-limit',
    description: '🤖 تحديد حد الرسائل اليومي للذكاء الاصطناعي أو عرض القائمة',
    aliases: ['ailimit', 'setlimit', 'حد-الذكاء'],
    category: 'Admin',

    async execute(message, args) {
        // 1. التحقق من الصلاحيات
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ ليس لديك صلاحية استخدام هذا الأمر.');
        }

        // 2. التحقق مما إذا كان الطلب هو "عرض القائمة"
        // المثال: -ailimit list  أو  -حد-الذكاء قائمة
        if (args[0] && ['list', 'قائمة', 'info'].includes(args[0].toLowerCase())) {
            
            // جلب البيانات من الجدول
            const limits = sql.prepare("SELECT * FROM ai_role_limits WHERE guildID = ? ORDER BY limitCount ASC").all(message.guild.id);

            if (limits.length === 0) {
                return message.reply('ℹ️ **لم يتم تحديد أي حدود للرتب حتى الآن.**');
            }

            // تنسيق القائمة
            const description = limits.map((row, index) => {
                const role = message.guild.roles.cache.get(row.roleID);
                const roleName = role ? role.toString() : `\`Deleted Role (${row.roleID})\``;
                return `**${index + 1}.** ${roleName} ➔ **${row.limitCount}** رسالة/يومياً`;
            }).join('\n');

            const listEmbed = new EmbedBuilder()
                .setColor(0xD4AF37) // ذهبي
                .setTitle('📜 قائمة حدود الذكاء الاصطناعي (AI Limits)')
                .setDescription(description)
                .setFooter({ text: `عدد الرتب المحددة: ${limits.length}`, iconURL: message.guild.iconURL() })
                .setTimestamp();

            return message.reply({ embeds: [listEmbed] });
        }

        // 3. (الكود القديم) إذا لم يكن "list"، ننفذ عملية التعيين
        if (!args[0] || !args[1]) {
            return message.reply(`💡 **طريقة الاستخدام:**\n1️⃣ للتعيين: \`${args.prefix}ailimit [الرتبة] [العدد]\`\n2️⃣ للقائمة: \`${args.prefix}ailimit list\``);
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
        const limit = parseInt(args[1]);

        if (!role) {
            return message.reply('❌ لم أتمكن من العثور على هذه الرتبة.');
        }

        if (isNaN(limit) || limit < 0) {
            return message.reply('❌ يرجى إدخال عدد صحيح للحد اليومي.');
        }

        try {
            aiLimitHandler.setRoleLimit(message.guild.id, role.id, limit);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // أخضر
                .setTitle('✅ تم تحديث الحدود بنجاح')
                .setDescription(`تم تعيين الحد اليومي لرتبة **${role.name}** ليكون **${limit}** رسالة.`)
                .addFields(
                    { name: '🎭 الرتبة', value: `${role}`, inline: true },
                    { name: '🔢 الحد اليومي', value: `${limit} رسالة`, inline: true }
                )
                .setFooter({ text: 'نظام اقتصاد الإمبراطورية', iconURL: message.guild.iconURL() })
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error("[Set AI Limit Error]:", error);
            await message.reply('❌ حدث خطأ أثناء حفظ البيانات.');
        }
    }
};
