const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField,
    ChannelType,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const { generateMainQuestBoardImage, generateKingsBoardImage } = require('../../generators/guild-boards-generator.js');

module.exports = {
    name: 'setup-guild',
    description: 'إعداد نظام نقابة المغامرين والمهام الشامل (لوحة ذكية)',
    usage: '-setup-guild',
    aliases: ['sguild'],

    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ **لا تملك صلاحية (Administrator) لاستخدام هذا الأمر.**');
        }

        const client = message.client;
        const guildId = message.guild.id;
        const db = client.sql;

        try { 
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kingsBoardMessageID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS chatterChannelID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS roleChatterBadge TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS roleKnightSlayer TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS questChannelID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS countingChannelID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS treeChannelID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS treeBotID TEXT");
            await db.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS treeMessageID TEXT");
            await db.query("CREATE TABLE IF NOT EXISTS quest_achievement_roles (guildID TEXT, roleID TEXT, achievementID TEXT, PRIMARY KEY (guildID, achievementID))"); 
        } catch (e) {}

        const generateDashboardEmbed = async () => {
            const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [guildId]);
            const settings = settingsRes.rows[0] || {};
            
            const getCh = (id) => id ? `<#${id}>` : '❌ غير محدد';
            const getRl = (id) => id ? `<@&${id}>` : '❌ غير محدد';
            const getTxt = (val) => val ? `\`${val}\`` : '❌ غير محدد';
            
            const getAchRole = async (achId) => {
                const res = await db.query("SELECT roleID FROM quest_achievement_roles WHERE guildID = $1 AND achievementID = $2", [guildId, achId]);
                return res.rows[0] ? `<@&${res.rows[0].roleid || res.rows[0].roleID}>` : '❌ غير محدد';
            };

            const caesarRole = await getAchRole('ach_caesar_role');
            const treeRole = await getAchRole('ach_tree_role');

            const embed = new EmbedBuilder()
                .setTitle('⚙️ لوحة إعدادات نقابة المغامرين الشاملة')
                .setDescription('💡 **ملاحظة:** تم دمج إعدادات المهام، الشجرة، والملوك في لوحة واحدة!')
                .setColor('#2F3136')
                .addFields(
                    { 
                        name: '📡 الرومات الأساسية', 
                        value: `**لوحة النقابة:** ${getCh(settings.guildboardchannelid || settings.guildBoardChannelID)}\n**روم إعلانات الملوك:** ${getCh(settings.guildannouncechannelid || settings.guildAnnounceChannelID)}\n**إشعارات المهام:** ${getCh(settings.questchannelid || settings.questChannelID)}\n**شات ثرثار الحانة:** ${getCh(settings.chatterchannelid || settings.chatterChannelID)}\n**قناة العد:** ${getCh(settings.countingchannelid || settings.countingChannelID)}\n**قناة الشجرة:** ${getCh(settings.treechannelid || settings.treeChannelID)}`, 
                        inline: false 
                    },
                    { 
                        name: '🌲 إعدادات الشجرة المتقدمة', 
                        value: `**بوت الشجرة:** ${getTxt(settings.treebotid || settings.treeBotID)}\n**آيدي رسالة الشجرة:** ${getTxt(settings.treemessageid || settings.treeMessageID)}`, 
                        inline: false 
                    },
                    { 
                        name: '👑 ألقاب الملوك (8 ألقاب)', 
                        value: `🎰 **الكازينو:** ${getRl(settings.rolecasinoking || settings.roleCasinoKing)} | 🌑 **الهاوية:** ${getRl(settings.roleabyss || settings.roleAbyss)}\n🗣️ **البلاغة:** ${getRl(settings.rolechatter || settings.roleChatter)} | 🤝 **الكرم:** ${getRl(settings.rolephilanthropist || settings.rolePhilanthropist)}\n🧠 **الحكمة:** ${getRl(settings.roleadvisor || settings.roleAdvisor)} | 🎣 **القنص:** ${getRl(settings.rolefisherking || settings.roleFisherKing)}\n⚔️ **النزاع:** ${getRl(settings.rolepvpking || settings.rolePvPKing)} | 🌾 **الحصاد:** ${getRl(settings.rolefarmking || settings.roleFarmKing)}`, 
                        inline: false 
                    },
                    { 
                        name: '🎖️ أوسمة الإنجازات والمهام', 
                        value: `🗣️ **ثرثار الحانة:** ${getRl(settings.rolechatterbadge || settings.roleChatterBadge)}\n🛡️ **قاهر الفرسان:** ${getRl(settings.roleknightslayer || settings.roleKnightSlayer)}\n✨ **الختم اليومي:** ${getRl(settings.roledailybadge || settings.roleDailyBadge || settings.roleDailyQuester)}\n🌟 **الختم الأسبوعي:** ${getRl(settings.roleweeklybadge || settings.roleWeeklyBadge || settings.roleWeeklyQuester)}\n👑 **إنجاز القيصر:** ${caesarRole}\n🌲 **إنجاز الشجرة:** ${treeRole}`, 
                        inline: false 
                    }
                )
                .setFooter({ text: 'استخدم القوائم بالأسفل لضبط وتعديل النظام.' });
            
            return embed;
        };

        const getMainMenuComponents = () => {
            const menuRow1 = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('setup_guild_menu_1')
                    .setPlaceholder('👇 إعداد الرومات الأساسية وإشعارات المهام...')
                    .addOptions([
                        { label: 'روم لوحة النقابة (الثابتة)', value: 'edit_guildBoardChannelID', emoji: '📝' },
                        { label: 'روم الإعلانات (للملوك والأحداث)', value: 'edit_guildAnnounceChannelID', emoji: '📢' },
                        { label: 'روم إشعارات المهام (الختم والإنجازات)', value: 'edit_questChannelID', emoji: '📜' },
                        { label: 'شات ثرثار الحانة (100 رسالة)', value: 'edit_chatterChannelID', emoji: '💬' },
                        { label: 'قناة العد', value: 'edit_countingChannelID', emoji: '🔢' },
                        { label: 'قناة الشجرة', value: 'edit_treeChannelID', emoji: '🌲' }
                    ])
            );

            const menuRow2 = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('setup_guild_menu_2')
                    .setPlaceholder('👇 إعداد ألقاب الملوك (تُسحب تلقائياً)...')
                    .addOptions([
                        { label: 'رتبة ملك الكازينو', value: 'edit_roleCasinoKing', emoji: '🎰' },
                        { label: 'رتبة ملك الهاوية', value: 'edit_roleAbyss', emoji: '🌑' },
                        { label: 'رتبة ملك البلاغة', value: 'edit_roleChatter', emoji: '🗣️' },
                        { label: 'رتبة ملك الكرم', value: 'edit_rolePhilanthropist', emoji: '🤝' },
                        { label: 'رتبة ملك الحكمة', value: 'edit_roleAdvisor', emoji: '🧠' },
                        { label: 'رتبة ملك القنص', value: 'edit_roleFisherKing', emoji: '🎣' },
                        { label: 'رتبة ملك النزاع', value: 'edit_rolePvPKing', emoji: '⚔️' },
                        { label: 'رتبة ملك الحصاد', value: 'edit_roleFarmKing', emoji: '🌾' }
                    ])
            );

            const menuRow3 = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('setup_guild_menu_3')
                    .setPlaceholder('👇 إعداد الأوسمة ورتب الإنجازات الخاصة...')
                    .addOptions([
                        { label: 'وسام ثرثار الحانة', value: 'edit_roleChatterBadge', emoji: '🗣️' },
                        { label: 'وسام قاهر الفرسان', value: 'edit_roleKnightSlayer', emoji: '🛡️' },
                        { label: 'وسام الختم اليومي', value: 'edit_roleDailyBadge', emoji: '✨' },
                        { label: 'وسام الختم الأسبوعي', value: 'edit_roleWeeklyBadge', emoji: '🌟' },
                        { label: 'رول إنجاز القيصر', value: 'edit_ach_caesar_role', emoji: '👑' },
                        { label: 'رول إنجاز الشجرة', value: 'edit_ach_tree_role', emoji: '🌲' }
                    ])
            );

            const buttonsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('send_guild_board')
                    .setLabel('تحديث / إرسال اللوحات الفنية')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🚀'),
                new ButtonBuilder()
                    .setCustomId('tree_text_settings')
                    .setLabel('آيدي بوت/رسالة الشجرة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔧')
            );

            return [menuRow1, menuRow2, menuRow3, buttonsRow];
        };

        const initialEmbed = await generateDashboardEmbed();
        const dashboardMsg = await message.reply({ 
            embeds: [initialEmbed], 
            components: getMainMenuComponents() 
        });

        const collector = dashboardMsg.createMessageComponentCollector({ time: 600000 }); 

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: '❌ هذا الأمر ليس لك.', flags: 64 });
            }

            if (interaction.customId === 'tree_text_settings') {
                const modal = new ModalBuilder()
                    .setCustomId('tree_settings_modal')
                    .setTitle('إعدادات الشجرة المتقدمة');

                const botInput = new TextInputBuilder()
                    .setCustomId('tree_bot_id_input')
                    .setLabel('أيدي بوت الشجرة (ID)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const msgInput = new TextInputBuilder()
                    .setCustomId('tree_msg_id_input')
                    .setLabel('أيدي رسالة الشجرة (ID)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(botInput), new ActionRowBuilder().addComponents(msgInput));
                await interaction.showModal(modal);
                return;
            }

            if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_guild_menu')) {
                const selected = interaction.values[0]; 
                const dbColumn = selected.replace('edit_', ''); 
                const isChannel = dbColumn.includes('Channel');

                let selectionRow;
                if (isChannel) {
                    selectionRow = new ActionRowBuilder().addComponents(
                        new ChannelSelectMenuBuilder()
                            .setCustomId(`save_${dbColumn}`)
                            .setPlaceholder('اختر الروم المناسب من هنا...')
                            .setChannelTypes(ChannelType.GuildText)
                    );
                } else {
                    selectionRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId(`save_${dbColumn}`)
                            .setPlaceholder('اختر الرتبة المناسبة من هنا...')
                    );
                }

                const controlsRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('back_to_main').setLabel('العودة').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`clear_${dbColumn}`).setLabel('🗑️ حذف التحديد الحالي').setStyle(ButtonStyle.Danger)
                );

                await interaction.update({ components: [selectionRow, controlsRow] });
                return;
            }

            if (interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
                if (interaction.customId.startsWith('save_')) {
                    const dbColumn = interaction.customId.replace('save_', '');
                    const selectedId = interaction.values[0];

                    try {
                        if (dbColumn.startsWith('ach_')) {
                            await db.query(`
                                INSERT INTO quest_achievement_roles (guildID, roleID, achievementID) 
                                VALUES ($1, $2, $3) 
                                ON CONFLICT(guildID, achievementID) 
                                DO UPDATE SET roleID = EXCLUDED.roleID
                            `, [guildId, selectedId, dbColumn]);
                        } else {
                            await db.query(`
                                INSERT INTO settings (guild, ${dbColumn}) 
                                VALUES ($1, $2) 
                                ON CONFLICT(guild) 
                                DO UPDATE SET ${dbColumn} = EXCLUDED.${dbColumn}
                            `, [guildId, selectedId]);
                        }
                        
                        const updatedEmbed = await generateDashboardEmbed();
                        await interaction.update({ embeds: [updatedEmbed], components: getMainMenuComponents() });
                    } catch (err) {
                        console.error(err);
                        await interaction.reply({ content: `❌ حدث خطأ أثناء الحفظ.`, flags: 64 });
                    }
                    return;
                }
            }

            if (interaction.isButton()) {
                if (interaction.customId === 'back_to_main') {
                    await interaction.update({ components: getMainMenuComponents() });
                    return;
                }

                if (interaction.customId.startsWith('clear_')) {
                    const dbColumn = interaction.customId.replace('clear_', '');
                    try {
                        if (dbColumn.startsWith('ach_')) {
                            await db.query("DELETE FROM quest_achievement_roles WHERE guildID = $1 AND achievementID = $2", [guildId, dbColumn]);
                        } else {
                            await db.query(`UPDATE settings SET ${dbColumn} = NULL WHERE guild = $1`, [guildId]);
                        }
                        const updatedEmbed = await generateDashboardEmbed();
                        await interaction.update({ embeds: [updatedEmbed], components: getMainMenuComponents() });
                    } catch (e) {}
                    return;
                }

                if (interaction.customId === 'send_guild_board') {
                    await interaction.deferReply({ flags: 64 });

                    const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [guildId]);
                    const settings = settingsRes.rows[0];
                    if (!settings || (!settings.guildboardchannelid && !settings.guildBoardChannelID)) {
                        return interaction.editReply({ content: '❌ يجب عليك تحديد **روم لوحة النقابة (الثابتة)** أولاً لكي أرسلها!' });
                    }

                    const boardChID = settings.guildboardchannelid || settings.guildBoardChannelID;
                    const targetChannel = interaction.guild.channels.cache.get(boardChID);
                    if (!targetChannel) {
                        return interaction.editReply({ content: '❌ الروم المحدد غير موجود أو البوت لا يملك صلاحية الوصول إليه.' });
                    }

                    try {
                        const now = new Date();
                        const ksaTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
                        const todayStr = ksaTime.toISOString().split('T')[0];
                        
                        const casinoData = (await db.query("SELECT userID, (COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) as totalProfit FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND (casino_profit > 0 OR mora_earned > 0) ORDER BY totalProfit DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const abyssData = (await db.query('SELECT "user" AS userID, max_dungeon_floor FROM levels WHERE guild = $1 AND max_dungeon_floor > 0 ORDER BY max_dungeon_floor DESC LIMIT 1', [guildId])).rows[0];
                        const chatterData = (await db.query("SELECT userID, messages FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND messages > 0 ORDER BY messages DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const philanData = (await db.query("SELECT userID, mora_donated FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND mora_donated > 0 ORDER BY mora_donated DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const advisorData = (await db.query("SELECT userID, ai_interactions FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND ai_interactions > 0 ORDER BY ai_interactions DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const fisherData = (await db.query("SELECT userID, fish_caught FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND fish_caught > 0 ORDER BY fish_caught DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const pvpData = (await db.query("SELECT userID, pvp_wins FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND pvp_wins > 0 ORDER BY pvp_wins DESC LIMIT 1", [guildId, todayStr])).rows[0];
                        const farmData = (await db.query("SELECT userID, crops_harvested FROM user_daily_stats WHERE guildID = $1 AND date = $2 AND crops_harvested > 0 ORDER BY crops_harvested DESC LIMIT 1", [guildId, todayStr])).rows[0];

                        async function getKingInfo(dataObj, valueKey, suffix, title, emoji) {
                            if (!dataObj) return { title, emoji, displayName: 'لا أحد حتى الآن', avatarUrl: null, valueText: `0 ${suffix}` };
                            const uid = dataObj.userid || dataObj.userID;
                            try {
                                let member = await interaction.guild.members.fetch(uid).catch(()=>null);
                                let user = member ? member.user : await client.users.fetch(uid).catch(()=>null);
                                if (user) {
                                    return {
                                        title, emoji,
                                        displayName: member ? member.displayName : user.username,
                                        avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
                                        valueText: `${parseInt(dataObj[valueKey.toLowerCase()] || dataObj[valueKey]).toLocaleString()} ${suffix}`
                                    };
                                }
                            } catch (e) {}
                            return { title, emoji, displayName: 'مغامر مجهول', avatarUrl: null, valueText: `${parseInt(dataObj[valueKey.toLowerCase()] || dataObj[valueKey]).toLocaleString()} ${suffix}` };
                        }

                        const kingsArray = [
                            await getKingInfo(casinoData, 'totalProfit', 'مورا', 'ملك الكازينو', '🎰'),
                            await getKingInfo(abyssData, 'max_dungeon_floor', 'طابق', 'ملك الهاوية', '🌑'),
                            await getKingInfo(chatterData, 'messages', 'رسالة', 'ملك البلاغة', '🗣️'), 
                            await getKingInfo(philanData, 'mora_donated', 'مورا', 'ملك الكرم', '🤝'),
                            await getKingInfo(advisorData, 'ai_interactions', 'تفاعل', 'ملك الحكمة', '🧠'),
                            await getKingInfo(fisherData, 'fish_caught', 'سمكة', 'ملك القنص', '🎣'),
                            await getKingInfo(pvpData, 'pvp_wins', 'انتصار', 'ملك النزاع', '⚔️'),
                            await getKingInfo(farmData, 'crops_harvested', 'محصول', 'ملك الحصاد', '🌾')
                        ];

                        const oldKingsMsgID = settings.kingsboardmessageid || settings.kingsBoardMessageID;
                        if (oldKingsMsgID) {
                            try {
                                const oldKingsMsg = await targetChannel.messages.fetch(oldKingsMsgID);
                                await oldKingsMsg.delete();
                            } catch (e) { }
                        }
                        const oldMainMsgID = settings.guildboardmessageid || settings.guildBoardMessageID;
                        if (oldMainMsgID) {
                            try {
                                const oldMainMsg = await targetChannel.messages.fetch(oldMainMsgID);
                                await oldMainMsg.delete();
                            } catch (e) { }
                        }

                        const kingsBoardBuffer = await generateKingsBoardImage(kingsArray);
                        const kingsBoardAttachment = new AttachmentBuilder(kingsBoardBuffer, { name: `kings-board-${Date.now()}.png` });

                        const mainBoardBuffer = await generateMainQuestBoardImage();
                        const mainBoardAttachment = new AttachmentBuilder(mainBoardBuffer, { name: `main-board-${Date.now()}.png` });

                        const menuRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('guild_board_menu')
                                .setPlaceholder('- نـقـابـة المـغامريـن ...')
                                .addOptions([
                                    { label: 'الانجـازات', description: 'عرض جميع الإنجازات المتاحة في السيرفر.', value: 'panel_achievements', emoji: '1435572459276337245' },
                                    { label: 'المـهـام اليـوميـة', description: 'عرض المهام اليومية الخاصة بك وتقدمك فيها.', value: 'panel_daily_quests', emoji: '1435658634750201876' },
                                    { label: 'المـهـام الاسبوعية', description: 'عرض المهام الأسبوعية الخاصة بك وتقدمك فيها.', value: 'panel_weekly_quests', emoji: '1435572430042042409' },
                                    { label: 'لـوحـة الـصدارة', description: 'عرض أعلى الأعضاء في إكمال الإنجازات.', value: 'panel_top_achievements', emoji: '1435572391190204447' },
                                    { label: 'انـجـازاتـي', description: 'عرض الإنجازات التي قمت بإكمالها فقط.', value: 'panel_my_achievements', emoji: '1437129108806176768' },
                                    { label: 'بطاقة المغامر', description: 'عرض هويتك، ثروتك، ومستوى سمعتك.', value: 'panel_adventurer_card', emoji: '🪪' },
                                    { label: 'قاعة الأساطير', description: 'أقوى المغامرين تصنيفاً وسمعة.', value: 'panel_hall_of_fame', emoji: '🏰' },
                                    { label: 'الاشـعـارات', description: 'التحكم في إشعارات المهام والإنجازات.', value: 'panel_notifications', emoji: '🔔' },
                                    { label: 'دليـل المـغـامـر', description: 'شرح الرتب، السمعة، الألقاب والأوسمة.', value: 'panel_reputation_guide', emoji: '📜' }
                                ])
                        );

                        const kingsMsg = await targetChannel.send({ files: [kingsBoardAttachment] });
                        const boardMsg = await targetChannel.send({ files: [mainBoardAttachment], components: [menuRow] });
                        
                        await db.query("UPDATE settings SET guildBoardMessageID = $1, kingsBoardMessageID = $2 WHERE guild = $3", [boardMsg.id, kingsMsg.id, guildId]);

                        await interaction.editReply({ content: `✅ **تم تحديث وإرسال اللوحات بنجاح في <#${targetChannel.id}>!**` });
                    } catch (err) {
                        console.error("Board Send Error:", err);
                        await interaction.editReply({ content: '❌ حدث خطأ أثناء إرسال الصور.' });
                    }
                }
            }
        });

        client.on('interactionCreate', async modalInteraction => {
            if (!modalInteraction.isModalSubmit()) return;
            if (modalInteraction.customId === 'tree_settings_modal') {
                const botId = modalInteraction.fields.getTextInputValue('tree_bot_id_input');
                const msgId = modalInteraction.fields.getTextInputValue('tree_msg_id_input');
                
                try {
                    await db.query(`
                        INSERT INTO settings (guild, treeBotID, treeMessageID) 
                        VALUES ($1, $2, $3) 
                        ON CONFLICT(guild) 
                        DO UPDATE SET treeBotID = EXCLUDED.treeBotID, treeMessageID = EXCLUDED.treeMessageID
                    `, [guildId, botId, msgId]);
                    
                    await modalInteraction.reply({ content: '✅ تم حفظ إعدادات رسالة وبوت الشجرة بنجاح.', flags: 64 });
                    const updatedEmbed = await generateDashboardEmbed();
                    dashboardMsg.edit({ embeds: [updatedEmbed] }).catch(()=>{});
                } catch (e) {
                    await modalInteraction.reply({ content: '❌ حدث خطأ في الحفظ.', flags: 64 });
                }
            }
        });

        collector.on('end', () => {
            dashboardMsg.edit({ components: [] }).catch(() => {});
        });
    }
};
