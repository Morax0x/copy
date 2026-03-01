const { PermissionsBitField, SlashCommandBuilder } = require('discord.js');
const SQLite = require("better-sqlite3");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-رتبة-vip')
        .setDescription('يحدد رتبة الـ VIP التي يحصل عليها اللاعبون من المتجر.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addRoleOption(option =>
            option.setName('الرتبة')
                .setDescription('الرتبة التي تريد تحديدها')
                .setRequired(true)),

    name: 'set-vip-role',
    aliases: ['setvip', 'تحديد-رتبة-vip'],
    category: "Leveling", 
    description: 'يحدد رتبة الـ VIP التي يحصل عليها اللاعبون من المتجر.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let role;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            role = interaction.options.getRole('الرتبة');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild` لاستخدام هذا الأمر.', true);
        }

        if (!role) {
            return reply('**الاستخدام:** `-set-vip-role <@Role>`\n(قم بعمل منشن للرتبة التي تريد تحديدها).', true);
        }

        try {
            sql.prepare(`
                INSERT INTO settings (guild, vipRoleID) 
                VALUES (@guild, @vipRoleID) 
                ON CONFLICT(guild) DO UPDATE SET 
                vipRoleID = excluded.vipRoleID
            `).run({
                guild: guild.id,
                vipRoleID: role.id
            });

            return reply(`✅ | تم تحديد رتبة الـ VIP بنجاح إلى: ${role.name}`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};