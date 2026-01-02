const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp-ignore')
        .setDescription('منع/تفعيل احتساب اللفل في قناة أو كاتيغوري معين.')
        .addChannelOption(option => 
            option.setName('target')
                .setDescription('القناة أو الكاتيغوري')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory, ChannelType.GuildVoice)
        ),

    async execute(interaction) {
        // التحقق من الصلاحيات
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ هذا الأمر للمسؤولين فقط.", ephemeral: true });
        }

        const target = interaction.options.getChannel('target');
        const sql = interaction.client.sql;
        const guildID = interaction.guild.id;

        // التحقق هل القناة موجودة بالفعل في القائمة
        const existing = sql.prepare("SELECT * FROM xp_ignore WHERE guildID = ? AND id = ?").get(guildID, target.id);

        if (existing) {
            // إذا موجودة -> احذفها (تفعيل اللفل)
            sql.prepare("DELETE FROM xp_ignore WHERE guildID = ? AND id = ?").run(guildID, target.id);
            return interaction.reply(`✅ **تم تفعيل** احتساب اللفل في ${target.name} مرة أخرى.`);
        } else {
            // غير موجودة -> أضفها (منع اللفل)
            let type = target.type === ChannelType.GuildCategory ? 'category' : 'channel';
            sql.prepare("INSERT INTO xp_ignore (guildID, id, type) VALUES (?, ?, ?)").run(guildID, target.id, type);
            
            if (type === 'category') {
                return interaction.reply(`🚫 **تم تعطيل** احتساب اللفل في الكاتيغوري **${target.name}** وجميع القنوات داخله.`);
            } else {
                return interaction.reply(`🚫 **تم تعطيل** احتساب اللفل في القناة **${target.name}**.`);
            }
        }
    }
};
