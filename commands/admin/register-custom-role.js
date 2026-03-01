const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تسجيل-رتبة-خاصة')
        .setDescription('إدارة تسجيل الرتب الخاصة للأعضاء.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('تسجيل-جماعي')
            .setDescription('يسجل رتبة معينة لجميع الأعضاء الذين يملكونها حالياً.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة التي تريد تسجيلها للأعضاء').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('تسجيل-فردي')
            .setDescription('ربط رتبة بعضو محدد (يدوياً).')
            .addUserOption(opt => opt.setName('العضو').setDescription('العضو المالك للرتبة').setRequired(true))
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المراد تسجيلها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('ازالة')
            .setDescription('إلغاء ربط رتبة خاصة بعضو (لا يحذف الرتبة من السيرفر).')
            .addUserOption(opt => opt.setName('العضو').setDescription('العضو المراد إلغاء رتبته').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('قائمة')
            .setDescription('عرض قائمة الرتب الخاصة المسجلة.')
        ),

    name: 'register-custom-role',
    aliases: ['rcr', 'regrole', 'تسجيل-رتبة'],
    category: "Admin",
    description: "إدارة تسجيل الرتب الخاصة.",

    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, user;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            user = interaction.user;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            user = message.author;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return reply(`❌ ليس لديك صلاحية إدارة الرتب!`);
        }

        let subcommand;
        let targetUser, targetRole;

        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
        } else {
            subcommand = args[0] ? args[0].toLowerCase() : 'قائمة';
            if (subcommand === 'mass' || subcommand === 'جماعي') {
                subcommand = 'تسجيل-جماعي';
                targetRole = message.mentions.roles.first();
            } else if (subcommand === 'single' || subcommand === 'فردي') {
                subcommand = 'تسجيل-فردي';
                targetUser = message.mentions.users.first();
                targetRole = message.mentions.roles.first();
            }
        }

        try {
            // --- 1. تسجيل جماعي ---
            if (subcommand === 'تسجيل-جماعي') {
                if (isSlash) targetRole = interaction.options.getRole('الرتبة');
                if (!targetRole) return reply("❌ يجب تحديد الرتبة.");

                await guild.members.fetch(); 
                const membersWithRole = targetRole.members.filter(m => !m.user.bot); 

                if (membersWithRole.size === 0) {
                    return reply(`⚠️ لا يوجد أي أعضاء (بشر) يمتلكون الرتبة ${targetRole} حالياً.`);
                }

                let successCount = 0;
                const stmt = sql.prepare("INSERT OR REPLACE INTO custom_roles (id, guildID, userID, roleID) VALUES (?, ?, ?, ?)");

                const transaction = sql.transaction(() => {
                    membersWithRole.forEach(mem => {
                        stmt.run(`${guild.id}-${mem.id}`, guild.id, mem.id, targetRole.id);
                        successCount++;
                    });
                });
                transaction();

                const embed = new EmbedBuilder()
                    .setTitle("✅ تم التسجيل الجماعي بنجاح")
                    .setDescription(`تم تسجيل الرتبة ${targetRole} لـ **${successCount}** عضو.\nالآن يمكنهم جميعاً التحكم بهذه الرتبة من خلال اللوحة.`)
                    .setColor(Colors.Green);
                return reply({ embeds: [embed] });
            }

            // --- 2. تسجيل فردي ---
            if (subcommand === 'تسجيل-فردي') {
                if (isSlash) {
                    targetUser = interaction.options.getUser('العضو');
                    targetRole = interaction.options.getRole('الرتبة');
                }
                if (!targetUser || !targetRole) return reply("❌ يجب تحديد العضو والرتبة.");

                sql.prepare("INSERT OR REPLACE INTO custom_roles (id, guildID, userID, roleID) VALUES (?, ?, ?, ?)")
                   .run(`${guild.id}-${targetUser.id}`, guild.id, targetUser.id, targetRole.id);

                return reply(`✅ تم تسجيل الرتبة ${targetRole} للعضو ${targetUser} بنجاح.`);
            }

            // --- 3. إزالة ---
            if (subcommand === 'ازالة') {
                if (isSlash) targetUser = interaction.options.getUser('العضو');
                if (!targetUser) return reply("❌ يجب تحديد العضو.");

                const result = sql.prepare("DELETE FROM custom_roles WHERE guildID = ? AND userID = ?").run(guild.id, targetUser.id);
                
                if (result.changes > 0) return reply(`✅ تم إلغاء تسجيل الرتبة الخاصة للعضو ${targetUser}.`);
                return reply(`❌ هذا العضو ليس لديه رتبة مسجلة.`);
            }

            // --- 4. قائمة (مع أزرار) ---
            if (subcommand === 'قائمة') {
                const allRoles = sql.prepare("SELECT userID, roleID FROM custom_roles WHERE guildID = ?").all(guild.id);
                if (allRoles.length === 0) return reply("📭 لا توجد أي رتب خاصة مسجلة.");

                let currentPage = 1;
                const itemsPerPage = 10;
                const totalPages = Math.ceil(allRoles.length / itemsPerPage);

                const generateEmbed = (page) => {
                    const startIndex = (page - 1) * itemsPerPage;
                    const pageItems = allRoles.slice(startIndex, startIndex + itemsPerPage);
                    const description = pageItems.map((item, index) => 
                        `**${startIndex + index + 1}.** <@${item.userID}> : <@&${item.roleID}>`
                    ).join('\n');

                    return new EmbedBuilder()
                        .setTitle(`📜 الرتب المسجلة (${allRoles.length})`)
                        .setDescription(description || "لا يوجد")
                        .setFooter({ text: `صفحة ${page} من ${totalPages}` })
                        .setColor(Colors.Blue);
                };

                const getButtons = (page) => {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('prev_page')
                                .setEmoji('<:left:1439164494759723029>') // (تأكد من صحة الايموجي)
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page === 1),
                            new ButtonBuilder()
                                .setCustomId('next_page')
                                .setEmoji('<:right:1439164491072929915>') // (تأكد من صحة الايموجي)
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page === totalPages)
                        );
                    return row;
                };

                const msg = await (isSlash 
                    ? interaction.editReply({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] })
                    : message.reply({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] })
                );

                if (totalPages > 1) {
                    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                    collector.on('collect', async i => {
                        if (i.user.id !== user.id) return i.reply({ content: "هذه القائمة ليست لك.", ephemeral: true });
                        
                        if (i.customId === 'prev_page' && currentPage > 1) currentPage--;
                        if (i.customId === 'next_page' && currentPage < totalPages) currentPage++;
                        
                        await i.update({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] });
                    });

                    collector.on('end', () => {
                        msg.edit({ components: [] }).catch(() => {});
                    });
                }
                return;
            }

        } catch (e) {
            console.error(e);
            return reply("❌ حدث خطأ أثناء تنفيذ الأمر.");
        }
    }
};
