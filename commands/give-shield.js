const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// تم حذف السطرين الخاصين بـ new SQlite

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعطاء-درع-ستريك')
        .setDescription('يعطي درع حماية ستريك (لمرة واحدة) لمستخدم.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي سيحصل على الدرع')
            .setRequired(true)),

    name: 'give-shield',
    aliases: ['giveshield'],
    category: "Admin", // تم التغيير من Leveling إلى Admin
    description: "يعطي درع حماية ستريك (لمرة واحدة) لمستخدم.",

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
        }

        // --- ( 🌟 تم التصحيح هنا 🌟 ) ---
        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; // جعل الرد عام
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        // --- توحيد جلب المستخدم ---
        let user;
        if (isSlash) {
            user = interaction.options.getMember('المستخدم');
        } else {
            user = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        }

        if (!user) {
            return replyError("الاستخدام: `/اعطاء-درع-ستريك <@user>`");
        }

        // --- المنطق الأساسي (كما هو) ---
        const getStreak = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?");
        const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield);");

        let streakData = getStreak.get(guild.id, user.id);

        if (!streakData) {
            streakData = {
                id: `${guild.id}-${user.id}`,
                guildID: guild.id,
                userID: user.id,
                streakCount: 0,
                lastMessageTimestamp: Date.now(),
                hasGracePeriod: 1, 
                hasItemShield: 1
            };
        } else {
            streakData.hasItemShield = 1;
        }

        setStreak.run(streakData);

        return reply(`🛡️ تم إعطاء درع حماية ستريك إلى ${user.toString()}.`);
    }
};