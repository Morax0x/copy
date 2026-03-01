const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require("discord.js");
const { getReportSettings } = require("../../handlers/report-handler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-البلاغات')
        .setDescription('إدارة إعدادات نظام البلاغات.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('الاعدادات-الاساسية')
            .setDescription('تحديد القنوات والرتب الأساسية لنظام البلاغات.')
            .addChannelOption(opt => opt.setName('قناة-السجلات').setDescription('قناة لسجلات البلاغات والسجن (Log)').setRequired(true))
            .addChannelOption(opt => opt.setName('قناة-البلاغات').setDescription('القناة التي يُسمح فيها بأمر !بلاغ').setRequired(true))
            .addRoleOption(opt => opt.setName('رتبة-السجن').setDescription('الرتبة التي تمنح للعضو عند السجن').setRequired(true))
            .addRoleOption(opt => opt.setName('رتبة-المستثنيين').setDescription('رتبة تسمح بالتبليغ غير المحدود (Cooldown=صفر)').setRequired(true))
            .addRoleOption(opt => opt.setName('رتبة-الساحة').setDescription('رتبة اختيارية يتم سحبها عند سجن العضو').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('رتبة-الاختبار')
            .setDescription('تحديد رتبة بصلاحيات تبليغ غير محدودة للاختبار.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المخصصة للاختبار').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('صلاحيات-التبليغ')
            .setDescription('تحديد الرتب المسموح لها بالتبليغ (اتركها فارغة للسماح للجميع).')
            .addStringOption(opt => opt.setName('ids-الرتب').setDescription('IDs الرتب مفصولة بمسافة (مثال: 123 456)'))
        )
        .addSubcommand(sub => sub
            .setName('عرض-الاعدادات')
            .setDescription('عرض الإعدادات الحالية لنظام البلاغات.')
        ),

    name: 'report-settings',
    aliases: ['reportsettings', 'rset'],
    category: "Admin",
    description: "إدارة إعدادات نظام البلاغات.",

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
            return message.reply("هذا الأمر متاح كأمر سلاش (/) فقط.");
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
        };
        const replyError = async (content) => {
            if (isSlash) return interaction.editReply({ content, ephemeral: true });
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'الاعدادات-الاساسية') {
                const logChannel = interaction.options.getChannel('قناة-السجلات');
                const reportChannel = interaction.options.getChannel('قناة-البلاغات');
                const jailRole = interaction.options.getRole('رتبة-السجن');
                const unlimitedRole = interaction.options.getRole('رتبة-المستثنيين');
                const arenaRole = interaction.options.getRole('رتبة-الساحة'); // (اختياري)

                const arenaRoleID = arenaRole ? arenaRole.id : null;

                sql.prepare("INSERT OR REPLACE INTO report_settings (guildID, logChannelID, reportChannelID, jailRoleID, arenaRoleID, unlimitedRoleID) VALUES (?, ?, ?, ?, ?, ?)")
                   .run(guild.id, logChannel.id, reportChannel.id, jailRole.id, arenaRoleID, unlimitedRole.id);

                const embed = new EmbedBuilder()
                    .setTitle("✅ تـم حفـظ الإعـدادات بنجاح!")
                    .setDescription(
                        `✶ قناة السجلات: ${logChannel}\n` +
                        `✶ قناة البلاغات: ${reportChannel}\n` +
                        `✶ رتبة السجن: ${jailRole}\n` +
                        `✶ رتبة الساحة: ${arenaRole || '`(لم تحدد)`'}\n` +
                        `✶ رتبة المستثنيين: ${unlimitedRole}`
                    )
                    .setColor(Colors.Green);
                return reply({ embeds: [embed] });

            } else if (subcommand === 'رتبة-الاختبار') {
                const testRole = interaction.options.getRole('الرتبة');
                sql.prepare("INSERT INTO report_settings (guildID, testRoleID) VALUES (?, ?) ON CONFLICT(guildID) DO UPDATE SET testRoleID = excluded.testRoleID")
                   .run(guild.id, testRole.id);

                const embed = new EmbedBuilder()
                    .setTitle("✅ تـم حفـظ رتبـة الاختـبـار بنجاح!")
                    .setDescription(`الرتبة المحددة لـ **صلاحيات التبليغ غير المحدودة (التجريب)** هي: ${testRole}`)
                    .setColor(Colors.Blue);
                return reply({ embeds: [embed] });

            } else if (subcommand === 'صلاحيات-التبليغ') {
                const rolesInput = interaction.options.getString('ids-الرتب');

                // (حذف الإعدادات القديمة أولاً)
                sql.prepare("DELETE FROM report_permissions WHERE guildID = ?").run(guild.id);

                if (!rolesInput) {
                    return reply({ content: "✅ **تم مسح** جميع الرتب المسموح لها بالتبليغ. **الجميع يستطيع التبليغ الآن** (إذا تم إعداد البوت)." });
                }

                const roleIDs = rolesInput.replace(/,/g, ' ').split(/\s+/).filter(id => id.match(/^\d+$/));
                if (roleIDs.length === 0) {
                     return replyError("لم أجد أي IDs صالحة في الإدخال.");
                }

                const insert = sql.prepare("INSERT INTO report_permissions (guildID, roleID) VALUES (?, ?)");
                const transaction = sql.transaction(() => {
                    for (const roleID of roleIDs) {
                        insert.run(guild.id, roleID);
                    }
                });
                transaction();

                const rolesMention = roleIDs.map(id => `<@&${id}>`).join('\n');
                const embed = new EmbedBuilder()
                    .setTitle("✅ تـم حفـظ صلاحـيات التبليغ بنجاح!")
                    .setDescription("الرتب المسموح لها الآن بتقديم البلاغات اليدوية والتفاعلية:\n" + rolesMention)
                    .setColor(Colors.Green);
                return reply({ embeds: [embed] });

            } else if (subcommand === 'عرض-الاعدادات') {
                const settings = getReportSettings(sql, guild.id);
                const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(guild.id);

                const embed = new EmbedBuilder()
                    .setTitle("⚙️ الإعدادات الحالية لنظام البلاغات")
                    .setColor(Colors.Greyple)
                    .addFields(
                        { name: "قناة السجلات (Log)", value: settings.logChannelID ? `<#${settings.logChannelID}>` : "لم تحدد" },
                        { name: "قناة البلاغات (البريفكس)", value: settings.reportChannelID ? `<#${settings.reportChannelID}>` : "لم تحدد" },
                        { name: "رتبة السجن", value: settings.jailRoleID ? `<@&${settings.jailRoleID}>` : "لم تحدد" },
                        { name: "رتبة الساحة (اختياري)", value: settings.arenaRoleID ? `<@&${settings.arenaRoleID}>` : "لم تحدد" },
                        { name: "رتبة المستثنيين (Cooldown)", value: settings.unlimitedRoleID ? `<@&${settings.unlimitedRoleID}>` : "لم تحدد" },
                        { name: "رتبة الاختبار (Test)", value: settings.testRoleID ? `<@&${settings.testRoleID}>` : "لم تحدد" },
                        { name: "الرتب المسموحة بالتبليغ", value: allowedRoles.length > 0 ? allowedRoles.map(r => `<@&${r.roleID}>`).join(', ') : "الجميع مسموح له" }
                    );
                return reply({ embeds: [embed] });
            }

        } catch (e) {
            console.error("Report settings error:", e);
            return replyError("حدث خطأ أثناء تنفيذ الأمر.");
        }
    }
};