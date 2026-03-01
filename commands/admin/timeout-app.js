const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('تـايـم اوت') // هذا الاسم الذي سيظهر في القائمة
        .setType(ApplicationCommandType.User) // نوعه: يظهر عند الضغط على مستخدم
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers), // الصلاحية المطلوبة

    async execute(interaction) {
        const targetMember = interaction.targetMember;

        // 1. التحقق من إمكانية معاقبة العضو
        if (!targetMember.moderatable) {
             return interaction.reply({ content: '❌ **لا يمكنني إعطاء تايم أوت لهذا العضو!** (رتبته أعلى مني أو مساوية لي).', ephemeral: true });
        }

        // 2. التحقق من التراتبية
        if (interaction.member.roles.highest.position <= targetMember.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ **لا يمكنك معاقبة شخص رتبته أعلى منك أو مثلك.**', ephemeral: true });
        }

        // 3. فتح النافذة المنبثقة (Modal)
        const modal = new ModalBuilder()
            .setCustomId(`timeout_app_modal_${targetMember.id}`)
            .setTitle(`عقوبة: ${targetMember.user.username}`);

        // خانة المدة
        const durationInput = new TextInputBuilder()
            .setCustomId('timeout_duration')
            .setLabel("المدة (اتركها فارغة لـ 3 ساعات)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("مثال: 10m, 1h, 1d")
            .setRequired(false);

        // خانة السبب
        const reasonInput = new TextInputBuilder()
            .setCustomId('timeout_reason')
            .setLabel("سبب العقوبة (اختياري)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("اكتب سبب المخالفة هنا...")
            .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(durationInput);
        const row2 = new ActionRowBuilder().addComponents(reasonInput);

        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }
};
