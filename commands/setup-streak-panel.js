const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('نشر-لوحة-الستريك')
        .setDescription('ينشر لوحة التحكم بالستريك (للادمن فقط).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    name: 'setup-streak-panel',
    aliases: ['stp'],
    category: "Admin",
    description: 'ينشر لوحة التحكم بالستريك (للادمن فقط).',
    usage: '-setup-streak-panel',
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ هذا الأمر للمشرفين فقط.");
        }

        if (channel.type !== ChannelType.GuildText) {
            return replyError('❌ يجب أن تكون القناة نصية.');
        }

        const description = [
            "- استعمل اللوحـة للتحـكم بالستريك ومـزايـاه <a:streak:1437152181018034206>",
            "",
            "- يمـكنك اظـهار واخفـاء الستريك او تغيير مظهره وحتى ايقاف اشعـاراتـه"
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(0xFF0000) 
            .setTitle('✶ لـوحـة السـتريـك')
            .setDescription(description)
            .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`streak_panel_menu`)
            .setPlaceholder('- افتح القـائمـة للتحـكم بالستريك')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('اخـفـاء / اظـهـار')
                    .setDescription('يخفي او يظهر الستريك في اسمك')
                    .setValue('streak_panel_toggle')
                    .setEmoji('1435572391190204447'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('تغـييـر')
                    .setDescription('يغير ايقونـة الفـاصلـة')
                    .setValue('streak_panel_change_sep')
                    .setEmoji('1436297148894412862'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('تـوب')
                    .setDescription('يظهـر اعـلى مستعملي الستريك')
                    .setValue('streak_panel_top')
                    .setEmoji('1435572459276337245'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('اشـعـارات')
                    .setDescription('ايـقـاف او تشغيل تلقي اشعارات الستريك بالخاص')
                    .setValue('streak_panel_notifications')
                    .setEmoji('🔔')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await channel.send({ embeds: [embed], components: [row] });

            if (isSlash) {
                await interaction.editReply({ content: '✅ تم نشر لوحة الستريك.', ephemeral: true });
            } else {
                await message.delete().catch(console.error);
            }

        } catch (err) {
            console.error(err);
            await replyError('❌ حدث خطأ أثناء محاولة إرسال اللوحة.');
        }
    }
};