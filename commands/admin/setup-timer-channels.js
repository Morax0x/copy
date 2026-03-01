const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تثبيت-قنوات-التوقيت')
        .setDescription('إنشاء قنوات صوتية تعرض الوقت المتبقي للستريك والمهام.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    name: 'setup-timer-channels',
    category: "Admin",
    description: "إنشاء قنوات التوقيت.",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return; 
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const sql = interaction.client.sql;

        try {
            const category = await guild.channels.create({
                name: '⌚ التوقيت والمهام',
                type: ChannelType.GuildCategory,
            });

            const streakChannel = await guild.channels.create({
                name: '🔥〢الـستـريـك: جارِ الحساب...',
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
            });

            const dailyChannel = await guild.channels.create({
                name: '🏆〢مهام يومية: جارِ الحساب...',
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
            });

            const weeklyChannel = await guild.channels.create({
                name: '🔮〢مهام اسبوعية: جارِ الحساب...',
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
            });

            sql.prepare(`
                INSERT INTO settings (guild, streakTimerChannelID, dailyTimerChannelID, weeklyTimerChannelID) 
                VALUES (?, ?, ?, ?) 
                ON CONFLICT(guild) DO UPDATE SET 
                streakTimerChannelID = excluded.streakTimerChannelID,
                dailyTimerChannelID = excluded.dailyTimerChannelID,
                weeklyTimerChannelID = excluded.weeklyTimerChannelID
            `).run(guild.id, streakChannel.id, dailyChannel.id, weeklyChannel.id);

            await interaction.editReply('✅ تم إنشاء القنوات بنجاح! سيتم تحديث أسمائها تلقائياً كل 5 دقائق.');

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ حدث خطأ أثناء إنشاء القنوات.');
        }
    },
};
