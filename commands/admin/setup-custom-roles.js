const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-الرتب-المخصصة')
        .setDescription('إدارة نظام الرتب المخصصة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('تحديد-الرتبة-الثابتة')
            .setDescription('تحديد الرتبة التي ستوضع الرتب الجديدة تحتها (عادة رتبة البوت).')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة الثابتة').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('اضافة-رتبة-مسموحة')
            .setDescription('إضافة رتبة (مثل بوستر أو VIP) للسماح لأصحابها بإنشاء رتب.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المسموحة').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('ازالة-رتبة-مسموحة')
            .setDescription('إزالة رتبة من قائمة الرتب المسموحة.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المراد إزالتها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('عرض-الرتب-المسموحة')
            .setDescription('عرض جميع الرتب المسموح لها بإنشاء رتب مخصصة.')
        ),

    name: 'setup-custom-roles',
    aliases: ['scr'],
    category: "Admin",
    description: "إدارة نظام الرتب المخصصة.",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            if (isSlash) return interaction.editReply({ content, ephemeral: true });
            return message.reply({ content, ephemeral: true });
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        let subcommand, targetRole;
        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
            targetRole = interaction.options.getRole('الرتبة');
        } else {
            const method = args[0] ? args[0].toLowerCase() : null;
            const roleArg = args[1];
            if (roleArg) targetRole = message.mentions.roles.first() || guild.roles.cache.get(roleArg);

            if (method === 'anchor') subcommand = 'تحديد-الرتبة-الثابتة';
            else if (method === 'add') subcommand = 'اضافة-رتبة-مسموحة';
            else if (method === 'remove') subcommand = 'ازالة-رتبة-مسموحة';
            else if (method === 'list') subcommand = 'عرض-الرتب-المسموحة';
            else return replyError("أمر غير معروف. استخدم `-scr <anchor|add|remove|list> [role]`");
        }


        try {
            switch (subcommand) {
                case 'تحديد-الرتبة-الثابتة':
                    if (!targetRole) return replyError("يجب تحديد رتبة.");
                    sql.prepare("INSERT INTO settings (guild, customRoleAnchorID) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET customRoleAnchorID = excluded.customRoleAnchorID")
                       .run(guild.id, targetRole.id);
                    return reply(`✅ تم تحديد الرتبة الثابتة. جميع الرتب الجديدة ستكون تحت ${targetRole}.`);

                case 'اضافة-رتبة-مسموحة':
                    if (!targetRole) return replyError("يجب تحديد رتبة.");
                    sql.prepare("INSERT OR IGNORE INTO custom_role_permissions (guildID, roleID) VALUES (?, ?)")
                       .run(guild.id, targetRole.id);
                    return reply(`✅ تم إضافة ${targetRole} إلى الرتب المسموحة.`);

                case 'ازالة-رتبة-مسموحة':
                    if (!targetRole) return replyError("يجب تحديد رتبة.");
                    const result = sql.prepare("DELETE FROM custom_role_permissions WHERE guildID = ? AND roleID = ?").run(guild.id, targetRole.id);
                    if (result.changes > 0) {
                        return reply(`✅ تم إزالة ${targetRole} من الرتب المسموحة.`);
                    } else {
                        return replyError("❌ هذه الرتبة غير موجودة في القائمة أصلاً.");
                    }

                case 'عرض-الرتب-المسموحة':
                    const roles = sql.prepare("SELECT roleID FROM custom_role_permissions WHERE guildID = ?").all(guild.id);
                    if (roles.length === 0) {
                        return reply("لا توجد رتب مسموحة محددة حالياً.");
                    }
                    const roleList = roles.map(r => `<@&${r.roleID}>`).join('\n');
                    const embed = new EmbedBuilder()
                        .setTitle("📜 الرتب المسموح لها بإنشاء رتب مخصصة")
                        .setColor(Colors.Blue)
                        .setDescription(roleList);
                    return reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error(err);
            return replyError("حدث خطأ في قاعدة البيانات.");
        }
    }
};