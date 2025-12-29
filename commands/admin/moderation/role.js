const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'role',
    description: 'إعطاء أو إزالة رتبة من عضو',
    aliases: ['ر'''رول', 'رتبة'],
    category: 'Admin',
    usage: 'role <@user> <role name/id>',

    async execute(message, args) {
        // 1. التحقق من صلاحيات العضو
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ **ليس لديك صلاحية التحكم بالرتب (Manage Roles).**');
        }

        // 2. التحقق من صلاحيات البوت
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ **لا أملك صلاحية التحكم بالرتب.**');
        }

        // 3. جلب العضو المستهدف
        const targetArg = args[0];
        if (!targetArg) return message.reply('❓ **منشن العضو أو ضع الآيدي.**');

        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            return message.reply('❌ **لم يتم العثور على العضو.**');
        }

        // 4. جلب الرتبة (بحث ذكي)
        // نأخذ باقي النص بعد منشن العضو للبحث عن الرتبة
        const roleQuery = args.slice(1).join(" "); 
        if (!roleQuery) return message.reply('❓ **حدد الرتبة: بالاسم، المنشن، أو الآيدي.**');

        // أولويات البحث: منشن > آيدي > تطابق الاسم بالكامل > جزء من الاسم
        let role = message.mentions.roles.first() || 
                   message.guild.roles.cache.get(args[1]) || 
                   message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase()) ||
                   message.guild.roles.cache.find(r => r.name.toLowerCase().includes(roleQuery.toLowerCase()));

        if (!role) {
            return message.reply('❌ **لم يتم العثور على الرتبة.**');
        }

        // 5. التحقق من الهرمية (Hierarchy)
        // التأكد أن رتبة البوت أعلى من الرتبة المراد إعطاؤها
        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ **لا يمكنني التحكم بهذه الرتبة لأنها أعلى مني أو مساوية لي.**');
        }
        // التأكد أن رتبة المشرف أعلى من الرتبة المراد إعطاؤها (إلا إذا كان المالك)
        if (message.author.id !== message.guild.ownerId && role.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك التحكم برتبة أعلى من رتبتك.**');
        }

        // 6. التنفيذ (إعطاء أو إزالة)
        try {
            if (targetMember.roles.cache.has(role.id)) {
                // العضو يملك الرتبة -> إزالة
                await targetMember.roles.remove(role);
                // الرد بدون منشن الرتبة
                message.reply({ 
                    content: `✥ تـم ازالـة الرتـبـة ${role.name}`, 
                    allowedMentions: { roles: [], repliedUser: false } 
                });
            } else {
                // العضو لا يملك الرتبة -> منح
                await targetMember.roles.add(role);
                // الرد بدون منشن الرتبة
                message.reply({ 
                    content: `✥ تـم منـح رتـبـة ${role.name}`, 
                    allowedMentions: { roles: [], repliedUser: false } 
                });
            }
        } catch (error) {
            console.error(error);
            message.reply('❌ **حدث خطأ أثناء تعديل الرتب.**');
        }
    }
};
