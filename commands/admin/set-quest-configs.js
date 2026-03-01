const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-المهمات-الخاصة')
        .setDescription('تحديد إعدادات المهام المتقدمة (للمطور/الادمن).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('بوت-الشجرة')
            .setDescription('تحديد بوت الشجرة للمراقبة.')
            .addStringOption(opt => opt.setName('id-البوت').setDescription('ID الخاص بالبوت').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-الشجرة')
            .setDescription('تحديد قناة الشجرة للمراقبة.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('رسالة-الشجرة')
            .setDescription('تحديد رسالة الشجرة للمراقبة.')
            .addStringOption(opt => opt.setName('id-الرسالة').setDescription('ID الرسالة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-العد')
            .setDescription('تحديد قناة العد للمراقبة.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-المهمات')
            .setDescription('تحديد قناة إشعارات المهام.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('رول-القيصر')
            .setDescription('تحديد رول إنجاز القيصر.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('رول-الشجرة')
            .setDescription('تحديد رول إنجاز الشجرة.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة').setRequired(true))),

    name: 'set-quest-configs',
    aliases: ['setquest', 'sqc'],
    category: "Admin",
    description: 'تحديد إعدادات المهام (للادمن فقط).',

    async execute(interactionOrMessage, args) {
        // (دعم هجين للسلاش والبريفكس)
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            const message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) {
                payload.ephemeral = false; 
                return interaction.editReply(payload);
            }
            return interactionOrMessage.reply(payload);
        };
        
        const replyError = async (content) => {
            if (isSlash) {
                 return interaction.editReply({ content, ephemeral: true });
            }
            return interactionOrMessage.reply(content);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ هذا الأمر للمشرفين فقط.");
        }

        let method, value;

        if (isSlash) {
            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
                case 'بوت-الشجرة': method = 'treebot'; value = interaction.options.getString('id-البوت'); break;
                case 'قناة-الشجرة': method = 'treechannel'; value = interaction.options.getChannel('القناة').id; break;
                case 'رسالة-الشجرة': method = 'treemessage'; value = interaction.options.getString('id-الرسالة'); break;
                case 'قناة-العد': method = 'countchannel'; value = interaction.options.getChannel('القناة').id; break;
                case 'قناة-المهمات': method = 'questchannel'; value = interaction.options.getChannel('القناة').id; break;
                case 'رول-القيصر': method = 'caesarrole'; value = interaction.options.getRole('الرتبة').id; break;
                case 'رول-الشجرة': method = 'treerole'; value = interaction.options.getRole('الرتبة').id; break;
            }
        } else {
            method = args[0] ? args[0].toLowerCase() : null;
            value = args[1];
        }

        if (!method) {
            return replyError(
                "الاستخدام:\n" +
                "`-sqc treebot <Bot_ID>`\n" +
                "`-sqc treechannel <Channel_ID>`\n" +
                "`-sqc treemessage <Message_ID>`\n" +
                "`-sqc countchannel <Channel_ID>`\n" +
                "`-sqc questchannel <Channel_ID>`\n" +
                "`-sqc caesarrole <Role_ID>`\n" +
                "`-sqc treerole <Role_ID>`"
            );
        }

        const guildID = guild.id;

        if (method === 'caesarrole') {
            if (!value) return replyError("يرجى تحديد ID الرول.");
            try {
                sql.prepare("DELETE FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").run(guildID, 'ach_caesar_role');
                sql.prepare("INSERT INTO quest_achievement_roles (guildID, roleID, achievementID) VALUES (?, ?, ?)")
                   .run(guildID, value, 'ach_caesar_role');
                return reply(`✅ تم تحديد رول القيصر لإنجاز: <@&${value}>`);
            } catch (e) { console.error(e); return replyError("حدث خطأ."); }
        }

        if (method === 'treerole') {
            if (!value) return replyError("يرجى تحديد ID الرول.");
            try {
                sql.prepare("DELETE FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").run(guildID, 'ach_tree_role');
                sql.prepare("INSERT INTO quest_achievement_roles (guildID, roleID, achievementID) VALUES (?, ?, ?)")
                   .run(guildID, value, 'ach_tree_role');
                return reply(`✅ تم تحديد رول إشعار الشجرة لإنجاز: <@&${value}>`);
            } catch (e) { console.error(e); return replyError("حدث خطأ."); }
        }

        if (!value) return replyError("يرجى تحديد قيمة (ID).");

        let dbColumn;
        let successMessage;

        switch (method) {
            case 'treebot': dbColumn = 'treeBotID'; successMessage = `✅ تم تحديد بوت الشجرة: <@${value}>`; break;
            case 'treechannel': dbColumn = 'treeChannelID'; successMessage = `✅ تم تحديد قناة الشجرة: <#${value}>`; break;
            case 'treemessage': dbColumn = 'treeMessageID'; successMessage = `✅ تم تحديد رسالة الشجرة للمراقبة: \`${value}\``; break;
            case 'countchannel': dbColumn = 'countingChannelID'; successMessage = `✅ تم تحديد قناة العد: <#${value}>`; break;
            case 'questchannel': dbColumn = 'questChannelID'; successMessage = `✅ تم تحديد قناة نشر المهام والإنجازات: <#${value}>`; break;
            default: return replyError("أمر غير معروف.");
        }

        try {
            sql.prepare(`INSERT INTO settings (guild, ${dbColumn}) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET ${dbColumn} = excluded.${dbColumn}`).run(guildID, value);
            reply(successMessage);
        } catch (e) {
            console.error(e);
            replyError("حدث خطأ أثناء تحديث الإعدادات.");
        }
    }
};
