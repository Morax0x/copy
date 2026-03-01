const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('وزن-القيفاواي')
        .setDescription('يحدد وزن (فرصة) الرتبة في الفوز بالقيفاواي.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addRoleOption(option =>
            option.setName('الرتبة')
                .setDescription('الرتبة التي تريد تحديد وزنها')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('الوزن')
                .setDescription('عدد التذاكر (الوزن) الذي ستحصل عليه هذه الرتبة (أقل شيء 1)')
                .setRequired(true)
                .setMinValue(1)),

    name: 'setgweights',
    aliases: ['setgiveawayweight', 'وزن-القيفاواي'],
    description: 'يحدد وزن (فرصة) الرتبة في الفوز بالقيفاواي.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let role, weight;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            role = interaction.options.getRole('الرتبة');
            weight = interaction.options.getInteger('الوزن');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            role = message.mentions.roles.first();
            weight = parseInt(args[1]);
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply("❌ ليس لديك صلاحيات.", true);
        }

        if (!role || isNaN(weight) || weight < 1) {
            return reply("❌ الاستخدام: `!setgweights <@Role> <Weight>`\nمثال: `!setgweights @VIP 5` (يحصل على 5 تذاكر).", true);
        }

        try {
            sql.prepare("INSERT OR REPLACE INTO giveaway_weights (guildID, roleID, weight) VALUES (?, ?, ?)")
               .run(guild.id, role.id, weight);

            await reply(`✅ تم تحديد وزن رتبة ${role.name} إلى **${weight}** تذكرة.`);
        } catch (err) {
            console.error(err);
            await reply("❌ حدث خطأ أثناء تحديث قاعدة البيانات.", true);
        }
    }
};