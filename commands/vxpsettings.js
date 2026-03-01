const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-اكسبي-الصوت')
        .setDescription('تحديد نقاط الخبرة (XP) للقنوات الصوتية لكل دقيقة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addIntegerOption(option =>
            option.setName('الكمية')
            .setDescription('كمية الـ XP التي سيتم منحها كل دقيقة (0 لإيقافها)')
            .setRequired(true)
            .setMinValue(0)),

    name: 'vxpsettings',
    aliases: ['setvoicexp', 'voice-xp-settings'],
    category: "Admin",
    description: "Set custom XP for voice channels per minute.",
    cooldown: 3,

    async execute (interactionOrMessage, args) {

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
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; 
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError("You do not have permission to use this command!");
        }

        let xpAmount;
        if (isSlash) {
            xpAmount = interaction.options.getInteger('الكمية');
        } else {
            if (args.length < 1) {
                return replyError("Please provide valid arguments! `vxpsettings (xp)`\n(Example: `-vxpsettings 20` will give 20 XP per minute)");
            }
            if (isNaN(args[0])) {
                return replyError("Please provide valid arguments! `vxpsettings (xp)`");
            }
            xpAmount = parseInt(args[0]);
        }

        if (xpAmount < 0) {
            return replyError("XP cannot be less than 0 XP!");
        }

        const cooldownSeconds = 60;
        const cooldownMS = cooldownSeconds * 1000;

        let checkIf = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
        if (checkIf) {
            sql.prepare(`UPDATE settings SET voiceXP = ? WHERE guild = ?`).run(xpAmount, guild.id);
            sql.prepare(`UPDATE settings SET voiceCooldown = ? WHERE guild = ?`).run(cooldownMS, guild.id);
        } else {
            sql.prepare(`INSERT INTO settings (guild, voiceXP, voiceCooldown) VALUES (?,?,?)`)
               .run(guild.id, xpAmount, cooldownMS);
        }

        return reply(`Users in voice channels will now gain ${xpAmount}XP every ${cooldownSeconds} seconds.`);
    }
}