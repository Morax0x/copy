const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Timeout Member') // الاسم في القائمة
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    async execute(interaction) {
        const targetMember = interaction.targetMember;

        // التحقق من الصلاحيات
        if (!targetMember.moderatable) {
             return interaction.reply({ content: '❌ **لا يمكنني معاقبة هذا العضو (رتبته أعلى مني).**', ephemeral: true });
        }

        if (interaction.member.roles.highest.position <= targetMember.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ **لا يمكنك معاقبة شخص رتبته أعلى منك.**', ephemeral: true });
        }

        // بناء النافذة (Modal)
        const modal = new ModalBuilder()
            .setCustomId(`timeout_app_modal_${targetMember.id}`)
            .setTitle(`عقوبة: ${targetMember.user.username}`);

        // المدة (اختياري)
        const durationInput = new TextInputBuilder()
            .setCustomId('timeout_duration')
            .setLabel("المدة (اتركها فارغة لـ 3 ساعات)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("مثال: 1h, 30m, 1d")
            .setRequired(false); // غير اجباري

        // السبب (اختياري)
        const reasonInput = new TextInputBuilder()
            .setCustomId('timeout_reason')
            .setLabel("السبب (اختياري)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("سبب العقوبة...")
            .setRequired(false); // غير اجباري

        const row1 = new ActionRowBuilder().addComponents(durationInput);
        const row2 = new ActionRowBuilder().addComponents(reasonInput);

        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }
};
