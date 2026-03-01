const { PermissionsBitField, EmbedBuilder, SlashCommandBuilder, ChannelType, Colors } = require("discord.js");

const SETTINGS_MAP = new Map([
    ['title', 'dropTitle'],
    ['description', 'dropDescription'],
    ['color', 'dropColor'],
    ['footer', 'dropFooter'],
    ['button_label', 'dropButtonLabel'],
    ['button_emoji', 'dropButtonEmoji'],
    ['content', 'dropMessageContent']
]);

const SETTINGS_CHOICES = Array.from(SETTINGS_MAP.keys()).map(key => ({ name: key, value: key }));

const DEFAULTS = {
    dropTitle: "🎉 قيفاواي مفاجئ! 🎉",
    dropDescription: "تفاعلكم رائع! إليكم قيفاواي سريع:\n\n✦ الـجـائـزة: **{prize}**\n✦ الـفـائـزون: `{winners}`\n✦ ينتهي بعـد: {time}",
    dropColor: "Gold",
    dropFooter: "اضغط الزر للدخول!",
    dropButtonLabel: "ادخل السحب!",
    dropButtonEmoji: "🎁",
    dropMessageContent: "✨ **قيفاواي مفاجئ ظهر!** ✨"
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تصميم-المفاجآت')
        .setDescription('تخصيص شكل ورسائل القيفاوايات المفاجئة (Drops)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('عرض')
                .setDescription('عرض الإعدادات الحالية لتصميم الدروب'))
        .addSubcommand(sub =>
            sub.setName('اعادة-ضبط')
                .setDescription('إعادة تعيين إعدادات التصميم إلى الافتراضي')
                .addStringOption(opt =>
                    opt.setName('الخيار')
                        .setDescription('إعادة تعيين خيار معين فقط (اختياري)')
                        .setRequired(false)
                        .addChoices(...SETTINGS_CHOICES)))
        .addSubcommand(sub =>
            sub.setName('تعديل')
                .setDescription('تعديل خيار معين في تصميم الدروب')
                .addStringOption(opt =>
                    opt.setName('الخيار')
                        .setDescription('الخيار الذي تريد تعديله')
                        .setRequired(true)
                        .addChoices(...SETTINGS_CHOICES))
                .addStringOption(opt =>
                    opt.setName('القيمة')
                        .setDescription('القيمة الجديدة التي تريد تعيينها')
                        .setRequired(true))),

    name: 'setdropstyle',
    aliases: ['setdropdesign', 'تصميم-المفاجآت'],
    description: 'تخصيص شكل ورسائل القيفاوايات المفاجئة (Drops)',
    category: "Settings",
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, guild, client, sql;
        let action, option, value;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            action = interaction.options.getSubcommand();
            if (action === 'تعديل') {
                option = interaction.options.getString('الخيار');
                value = interaction.options.getString('القيمة');
            } else if (action === 'اعادة-ضبط') {
                option = interaction.options.getString('الخيار');
            }
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            const prefixSubcommand = args[0] ? args[0].toLowerCase() : 'show';
            if (prefixSubcommand === 'show' || prefixSubcommand === 'view') {
                action = 'عرض';
            } else if (prefixSubcommand === 'reset') {
                action = 'اعادة-ضبط';
                option = args[1] ? args[1].toLowerCase() : null;
            } else if (SETTINGS_MAP.has(prefixSubcommand)) {
                action = 'تعديل';
                option = prefixSubcommand;
                value = args.slice(1).join(' ');
            } else {
                action = 'help';
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (typeof payload === 'string') payload = { content: payload };
                if (payload.ephemeral === undefined) payload.ephemeral = true;
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply({ content: '❌ ليس لديك صلاحية `إدارة السيرفر`!', ephemeral: true });
        }

        sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(guild.id);

        const embed = new EmbedBuilder().setColor(Colors.Green).setTimestamp();

        switch (action) {
            case 'عرض': {
                const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);

                const displayEmbed = new EmbedBuilder()
                    .setTitle("🎨 إعدادات تصميم القيفاواي المفاجئ")
                    .setDescription("هذه هي الإعدادات الحالية لشكل القيفاوايات المفاجئة. استخدم الأمر لتغييرها.")
                    .setColor(settings.dropColor || DEFAULTS.dropColor)
                    .addFields(
                        { name: "1. النص العلوي (content)", value: `\`\`\`${settings.dropMessageContent || DEFAULTS.dropMessageContent}\`\`\`` },
                        { name: "2. عنوان الإمبد (title)", value: `\`\`\`${settings.dropTitle || DEFAULTS.dropTitle}\`\`\`` },
                        { name: "3. الوصف (description)", value: `\`\`\`${settings.dropDescription || DEFAULTS.dropDescription}\`\`\`` },
                        { name: "4. اللون (color)", value: `\`${settings.dropColor || DEFAULTS.dropColor}\``, inline: true },
                        { name: "5. الفوتر (footer)", value: `\`${settings.dropFooter || DEFAULTS.dropFooter}\``, inline: true },
                        { name: "6. نص الزر (button_label)", value: `\`${settings.dropButtonLabel || DEFAULTS.dropButtonLabel}\``, inline: true },
                        { name: "7. إيموجي الزر (button_emoji)", value: `\`${settings.dropButtonEmoji || DEFAULTS.dropButtonEmoji}\``, inline: true }
                    )
                    .setFooter({ text: "المتغيرات المتاحة: {prize}, {winners}, {time} (فقط للوصف)" });

                return reply({ embeds: [displayEmbed], ephemeral: false });
            }

            case 'اعادة-ضبط': {
                const columnToReset = SETTINGS_MAP.get(option);

                if (columnToReset) {
                    sql.prepare(`UPDATE settings SET ${columnToReset} = ? WHERE guild = ?`).run(null, guild.id);
                    return reply(`✅ تم إعادة تعيين \`${option}\` إلى الإعداد الافتراضي.`);
                }

                sql.prepare(`
                    UPDATE settings SET 
                    dropTitle = NULL, dropDescription = NULL, dropColor = NULL, dropFooter = NULL, 
                    dropButtonLabel = NULL, dropButtonEmoji = NULL, dropMessageContent = NULL 
                    WHERE guild = ?
                `).run(guild.id);
                return reply(`✅ تم إعادة تعيين **جميع** إعدادات تصميم القيفاواي إلى الافتراضي.`);
            }

            case 'تعديل': {
                const columnName = SETTINGS_MAP.get(option);
                if (!columnName) {
                    return reply("❌ خيار غير صالح.", true);
                }

                if (!value) {
                    return reply(`❌ يجب عليك كتابة القيمة. مثال: \`/تصميم-المفاجآت تعديل ${option} النص الجديد\``, true);
                }

                try {
                    sql.prepare(`UPDATE settings SET ${columnName} = ? WHERE guild = ?`).run(value, guild.id);
                    const successEmbed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ تم تحديث التصميم')
                        .setDescription(`**تم تغيير \`${option}\` بنجاح إلى:**\n\`\`\`${value}\`\`\``);

                    return reply({ embeds: [successEmbed] });

                } catch (err) {
                    console.error("Error in setdropstyle:", err);
                    return reply({ content: "❌ حدث خطأ أثناء تحديث الإعدادات.", ephemeral: true });
                }
            }

            default:
                return reply({ embeds: [this.getHelpEmbed()], ephemeral: true });
        }
    },

    getHelpEmbed() {
        return new EmbedBuilder()
            .setTitle('❌ خطأ في الاستخدام - تصميم المفاجآت')
            .setColor(Colors.Red)
            .setDescription(
                "الرجاء استخدام الأمر بالطريقة الصحيحة:\n\n" +
                "`/تصميم-المفاجآت عرض`\n" +
                "`/تصميم-المفاجآت اعادة-ضبط` `[الخيار]`\n" +
                "`/تصميم-المفاجآت تعديل` `[الخيار]` `[القيمة]`\n\n" +
                "**أو أوامر البريفكس:**\n" +
                "`-setdropstyle show`\n" +
                "`-setdropstyle reset [الخيار]`\n" +
                "`-setdropstyle [الخيار] [القيمة]`\n\n" +
                "**الخيارات المتاحة:** `title`, `description`, `color`, `footer`, `button_label`, `button_emoji`, `content`"
            );
    }
};