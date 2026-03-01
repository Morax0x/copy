const { PermissionsBitField, EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const weaponsConfig = require('../json/weapons-config.json');
// ( 1 ) تم حذف السطرين الخاصين بـ new SQLite

const validRaces = weaponsConfig.map(w => w.race);

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('ربط-عرق')
        .setDescription('إدارة الرتب المرتبطة بالأعراق لنظام الأسلحة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('إضافة')
            .setDescription('ربط رتبة بعرق معين.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المراد ربطها').setRequired(true))
            .addStringOption(opt => opt.setName('اسم-العرق').setDescription('اسم العرق (مثل Dragon أو Dark Elf)').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub => sub
            .setName('إزالة')
            .setDescription('إزالة ربط رتبة بعرق معين.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المراد إزالتها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('عرض')
            .setDescription('عرض جميع الرتب المرتبطة بالأعراق.')
        ),
    // ---------------------------------

    // --- ( 3 ) إضافة دالة الإكمال التلقائي ---
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const filtered = validRaces.filter(race => race.toLowerCase().includes(focusedValue));
            await interaction.respond(
                filtered.slice(0, 25).map(race => ({ name: race, value: race }))
            );
        } catch (e) {
            console.error('Autocomplete error in set-race-role:', e);
        }
    },
    // ---------------------------------

    name: 'set-race-role',
    aliases: ['setrace', 'srr'],
    category: "Admin", // ( 4 ) تم التغيير إلى فئة الادمن
    description: 'إدارة الرتب المرتبطة بالأعراق لنظام الأسلحة.',

    async execute(interactionOrMessage, args) {

        // --- ( 5 ) إضافة معالج الأوامر الهجينة ---
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

        // --- ( 6 ) إصلاح اتصال قاعدة البيانات ---
        const sql = client.sql;

        // --- ( 7 ) توحيد دوال الرد ---
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
        // ------------------------------------

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ هذا الأمر للمشرفين فقط.");
        }

        // --- ( 8 ) توحيد المدخلات ---
        let subcommand, targetRole, raceName;

        if (isSlash) {
            subcommand = interaction.options.getSubcommand(); // 'إضافة', 'إزالة', 'عرض'
            targetRole = interaction.options.getRole('الرتبة');
            raceName = interaction.options.getString('اسم-العرق');
        } else {
            const method = args[0] ? args[0].toLowerCase() : null; // 'add', 'remove', 'list'
            const roleArg = args[1];
            raceName = args.slice(2).join(' '); // (الكود الأصلي كان صحيحاً هنا)

            if (method === 'add') subcommand = 'إضافة';
            else if (method === 'remove') subcommand = 'إزالة';
            else if (method === 'list') subcommand = 'عرض';

            if (roleArg) {
                targetRole = message.mentions.roles.first() || guild.roles.cache.get(roleArg);
            }
        }
        // ------------------------------------

        // (عرض رسالة المساعدة لأمر البريفكس فقط)
        if (!isSlash && !subcommand) {
            const usageEmbed = new EmbedBuilder()
                .setTitle("🛠️ المساعدة: أمر ربط الأعراق")
                .setColor(Colors.Blue)
                .setDescription("يستخدم هذا الأمر لربط رتب السيرفر بالأعراق المحددة في ملف `weapons-config.json`.")
                .addFields(
                    { name: " لإضافة عرق:", value: "`-srr add <@Role/RoleID> <RaceName>`" },
                    { name: " لحذف عرق:", value: "`-srr remove <@Role/RoleID>`" },
                    { name: " لعرض الأعراق:", value: "`-srr list`" },
                    { name: "\u200B", value: "**الأعراق المتاحة:**\n" + `\`${validRaces.join('`, `')}\`` }
                );
            return message.reply({ embeds: [usageEmbed] });
        }

        const guildID = guild.id;

        // --- ( 9 ) استخدام 'subcommand' الموحد ---
        switch (subcommand) {
            case 'إضافة': {
                if (!targetRole) return replyError("❌ لم أتمكن من العثور على هذا الرول.");
                if (!raceName) return replyError("❌ يجب تحديد اسم العرق."); // (احتياط لأمر البريفكس)

                const validRaceName = validRaces.find(r => r.toLowerCase() === raceName.toLowerCase());
                if (!validRaceName) {
                    return replyError(`❌ اسم العرق غير صالح. الأعراق المتاحة هي: \`${validRaces.join(', ')}\``);
                }

                try {
                    sql.prepare("INSERT OR REPLACE INTO race_roles (guildID, roleID, raceName) VALUES (?, ?, ?)")
                       .run(guildID, targetRole.id, validRaceName);
                    return reply(`✅ تم ربط العرق **${validRaceName}** بالرول ${targetRole}.`);
                } catch (e) {
                    console.error(e);
                    return replyError("حدث خطأ أثناء إضافة الرول.");
                }
            }

            case 'إزالة': {
                if (!targetRole) return replyError("❌ لم أتمكن من العثور على هذا الرول.");
                try {
                    const result = sql.prepare("DELETE FROM race_roles WHERE guildID = ? AND roleID = ?").run(guildID, targetRole.id);
                    if (result.changes > 0) {
                        return reply(`✅ تم حذف الرول ${targetRole} من قائمة الأعراق.`);
                    } else {
                        return replyError("❌ هذا الرول غير موجود في القائمة أصلاً.");
                    }
                } catch (e) {
                    console.error(e);
                    return replyError("حدث خطأ أثناء حذف الرول.");
                }
            }

            case 'عرض': {
                try {
                    const roles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(guildID);
                    if (roles.length === 0) {
                        return reply("لا توجد رتب أعراق محددة حالياً.");
                    }
                    const roleList = roles.map(r => `**${r.raceName}**: <@&${r.roleID}>`).join('\n');
                    const embed = new EmbedBuilder()
                        .setTitle("📜 قائمة رتب الأعراق المسجلة")
                        .setColor(Colors.Green)
                        .setDescription(roleList);
                    return reply({ embeds: [embed] });
                } catch (e) {
                    console.error(e);
                    return replyError("حدث خطأ.");
                }
            }
        }
    }
};