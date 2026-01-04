const { SlashCommandBuilder } = require("discord.js");

// لاحظ: قمنا بإلغاء استدعاء dungeon-handler.js مؤقتاً
// const { startDungeon } = require("../../handlers/dungeon-handler.js"); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ اختبار الدانجون (Debug Mode)')
        .setDMPermission(false),

    name: 'dungeon',
    category: "Economy",
    description: "Debug Mode",

    async execute(interaction, args) {
        if (interaction.reply) {
            await interaction.reply({ content: "✅ **ملف الدانجون تم تحميله بنجاح!** المشكلة كانت في الملفات المستدعاة (Handlers).", ephemeral: true });
        }
    }
};
