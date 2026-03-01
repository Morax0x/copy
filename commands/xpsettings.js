const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-اكسبي-النص')
        .setDescription('تحديد الحد الأقصى لنقاط الخبرة (XP) للنص لكل دقيقة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addIntegerOption(option =>
            option.setName('الحد-الاقصى')
            .setDescription('الحد الأقصى للـ XP (سيكون التوزيع من 1 إلى هذا الرقم)')
            .setRequired(true)
            .setMinValue(1)),

    name: 'xpsettings',
    aliases: ['setxp', 'set-xp', 'xp-settings'],
    category: "Admin",
    description: "Set custom XP range per minute.",
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

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`You do not have permission to use this command!`);
        }

        let maxXP;
        if (isSlash) {
            maxXP = interaction.options.getInteger('الحد-الاقصى');
        } else {
            if (args.length < 1) {
                return replyError(`Please provide a vaild argument! \`xpsettings (max_xp)\`\n(Example: \`-xpsettings 25\` will give 1-25 XP per minute)`);
            }
            if (isNaN(args[0])) {
                return replyError(`Please provide a vaild argument! \`xpsettings (max_xp)\``);
            }
            maxXP = parseInt(args[0]);
        }

        if(maxXP < 1) {
            return replyError(`XP cannot be less than 1 XP!`);
        }

        const cooldownSeconds = 60;
        const cooldownMS = cooldownSeconds * 1000;

        let checkIf = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
        if(checkIf) {
            sql.prepare(`UPDATE settings SET customXP = ? WHERE guild = ?`).run(maxXP, guild.id);
            sql.prepare(`UPDATE settings SET customCooldown = ? WHERE guild = ?`).run(cooldownMS, guild.id);
        } else {
            sql.prepare(`INSERT OR REPLACE INTO settings (guild, customXP, customCooldown) VALUES (?,?,?)`).run(guild.id, maxXP, cooldownMS);
        }

        return reply(`User from now will gain 1 - ${maxXP} XP / ${cooldownSeconds} seconds`);
    }
}