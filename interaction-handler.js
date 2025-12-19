const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, MessageFlags, Colors } = require("discord.js");
const { handleQuestPanel } = require('./handlers/quest-panel-handler.js');
const { handleStreakPanel } = require('./handlers/streak-panel-handler.js');
const { handleShopInteractions, handleShopModal, handleShopSelectMenu, handleSkillSelectMenu } = require('./handlers/shop-handler.js');
const { handlePvpInteraction } = require('./handlers/pvp-handler.js'); 
const { getUserWeight, endGiveaway, handleGiveawayInteraction } = require('./handlers/giveaway-handler.js'); 
const { handleReroll } = require('./handlers/reroll-handler.js'); 
const { handleCustomRoleInteraction } = require('./handlers/custom-role-handler.js'); 
const { handleReactionRole } = require('./handlers/reaction-role-handler.js'); 
const { handleBossInteraction } = require('./handlers/boss-handler.js');

// محاولة استيراد المزرعة إذا كانت موجودة
let handleFarmInteractions;
try { ({ handleFarmInteractions } = require('./handlers/farm-handler.js')); } catch(e) {}

// تصحيح المسار لملف الستريك
let streakHandler;
try {
    streakHandler = require('./streak-handler.js');
} catch (e) {
    try { streakHandler = require('../../streak-handler.js'); } catch (err) {} 
}

const ms = require('ms');

const processingInteractions = new Set();
const giveawayBuilders = new Map(); 

// دالة مساعدة لتحديث إيمبد بناء القيفاواي
async function updateBuilderEmbed(interaction, data) {
    const embed = new EmbedBuilder()
        .setTitle("✥ لوحة إنشاء قيفاواي ✥")
        .setDescription("تم تحديث البيانات. اضغط إرسال عندما تكون جاهزاً.")
        .setColor(data.color || "Grey")
        .addFields([
            { name: "الجائزة (*)", value: data.prize || "لم تحدد", inline: true },
            { name: "المدة (*)", value: data.durationStr || "لم تحدد", inline: true },
            { name: "الفائزون (*)", value: data.winnerCountStr || "لم تحدد", inline: true },
            { name: "الوصف", value: data.description ? "تم التحديد" : "لم يحدد", inline: true },
            { name: "القناة", value: data.channelID ? `<#${data.channelID}>` : "القناة الحالية", inline: true },
            { name: "المكافآت", value: (data.xpReward || data.moraReward) ? "تم التحديد" : "لا يوجد", inline: true },
        ]);

    const isReady = data.prize && data.durationStr && data.winnerCountStr;

    let components = interaction.message.components;
    if (!components || components.length === 0) {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_builder_content').setLabel('تعديل المحتوى').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId('g_builder_visuals').setLabel('تعديل الشكل').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
        );
        components = [row1];
    }

    const row = new ActionRowBuilder().addComponents(
        components[0].components[0], 
        components[0].components[1], 
        new ButtonBuilder()
            .setCustomId('g_builder_send')
            .setLabel('إرسال القيفاواي')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isReady) 
    );

    try {
        await interaction.message.edit({ embeds: [embed], components: [row] });
    } catch (error) {
        if (error.code === 10008) { 
            console.log("[Giveaway Builder] Original message missing.");
            await interaction.followUp({ content: "⚠️ الرسالة الأصلية اختفت. يرجى بدء الأمر من جديد.", flags: [MessageFlags.Ephemeral] });
        } else {
            if (error.code !== 10062) throw error;
        }
    }
}

module.exports = (client, sql, antiRolesCache) => {

    client.on(Events.InteractionCreate, async i => {

        // التحقق من حالة قاعدة البيانات
        if (!sql.open && !i.isAutocomplete()) {
             if (!i.replied && !i.deferred) {
                 return i.reply({ content: "⚠️ قاعدة البيانات يتم تحديثها حالياً، الرجاء الانتظار...", flags: [MessageFlags.Ephemeral] }).catch(() => {});
             }
             return;
        }

        // منع التكرار السريع
        if (processingInteractions.has(i.user.id)) {
            if (!i.isModalSubmit()) {
                 return i.reply({ content: '⏳ | الرجاء الانتظار.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }

        if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
             processingInteractions.add(i.user.id);
        }

        try {

            // ====================================================
            // 1. Slash Commands
            // ====================================================
            if (i.isChatInputCommand()) {
                const command = i.client.commands.get(i.commandName);
                if (!command) {
                    await i.reply({ content: 'حدث خطأ، هذا الأمر غير موجود.', flags: [MessageFlags.Ephemeral] });
                    return; 
                }
                
                let isAllowed = false;
                if (i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) isAllowed = true;
                else {
                    try {
                        const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(i.guild.id, command.name, i.channel.id);
                        const categoryPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(i.guild.id, command.name, i.channel.parentId);
                        if (channelPerm || categoryPerm) isAllowed = true;
                        else {
                            const hasRestrictions = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ?").get(i.guild.id, command.name);
                            if (!hasRestrictions) isAllowed = true; 
                        }
                    } catch(e) { isAllowed = true; }
                }

                if (!isAllowed) {
                    return i.reply({ content: "❌ لا يمكنك استخدام هذا الأمر في هذه القناة.", flags: [MessageFlags.Ephemeral] });
                }

                try {
                    await command.execute(i); 
                } catch (error) {
                    console.error(`[Slash Error: ${i.commandName}]`, error);
                    if (i.replied || i.deferred) await i.followUp({ content: 'حدث خطأ!', flags: [MessageFlags.Ephemeral] });
                    else await i.reply({ content: 'حدث خطأ!', flags: [MessageFlags.Ephemeral] });
                }
                return; 
            }

            // ====================================================
            // 2. Autocomplete & Context Menu
            // ====================================================
            if (i.isAutocomplete()) {
                const command = i.client.commands.get(i.commandName);
                if (!command) return;
                try { if (command.autocomplete) await command.autocomplete(i); } catch (e) {}
                return; 
            }

            if (i.isContextMenuCommand()) {
                const command = i.client.commands.get(i.commandName);
                if (!command) return;
                try { await command.execute(i); } catch (e) {}
                return; 
            }

            // ====================================================
            // 3. Buttons Interactions
            // ====================================================
            if (i.isButton()) {
                const id = i.customId;

                // استثناء الأزرار التي تفتح Modals من الـ defer لتجنب الأخطاء
                if (id.startsWith('farm_buy_menu') || id.startsWith('mem_auto_confirm') || id === 'open_xp_modal' || id.startsWith('buy_market_') || id.startsWith('sell_market_') || id.startsWith('buy_animal_') || id.startsWith('sell_animal_') || id === 'buy_item_item_temp_reply') {
                    // لا تفعل شيئاً، دع الهاندلر يتصرف
                } else {
                    // محاولة عمل defer للأزرار العادية
                    if (!i.replied && !i.deferred) {
                        try { await i.deferUpdate(); } 
                        catch (err) { if (err.code !== 10062) throw err; return; }
                    }
                }

                if (id.startsWith('giveaway_')) {
                    if (handleGiveawayInteraction) {
                        await handleGiveawayInteraction(client, i);
                    }
                    return; 
                }

                if (id.startsWith('customrole_')) {
                    await handleCustomRoleInteraction(i, client, sql);
                }
                
                else if (id.startsWith('boss_')) {
                    await handleBossInteraction(i, client, sql);
                }
                
                else if ((id === 'farm_collect' || id === 'farm_buy_menu') && handleFarmInteractions) {
                    await handleFarmInteractions(i, client, sql);
                }

                else if (id.startsWith('streak_panel_')) { 
                    await handleStreakPanel(i, client, sql);
                }

                else if (
                    id.startsWith('buy_') || id.startsWith('upgrade_') || id.startsWith('shop_') || 
                    id.startsWith('replace_') || id === 'cancel_purchase' || id === 'open_xp_modal' ||
                    id === 'max_level' || id === 'max_rod' || id === 'max_boat' || id === 'max_dungeon' || 
                    id === 'cast_rod' || id.startsWith('pull_rod') || 
                    id.startsWith('sell_') || id.startsWith('mem_') || 
                    id === 'replace_guard' || id === 'confirm_dungeon_upgrade' 
                ) {
                    await handleShopInteractions(i, client, sql);
                }
                 
                else if (id === 'g_builder_content') {
                    const data = giveawayBuilders.get(i.user.id) || {};
                    const modal = new ModalBuilder().setCustomId('g_content_modal').setTitle('إعداد المحتوى (1/2)');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_prize').setLabel('الجائزة (إجباري)').setStyle(TextInputStyle.Short).setValue(data.prize || '').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_duration').setLabel('المدة (إجباري)').setPlaceholder("1d 5h 10m").setStyle(TextInputStyle.Short).setValue(data.durationStr || '').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_winners').setLabel('عدد الفائزين (إجباري)').setPlaceholder("1").setStyle(TextInputStyle.Short).setValue(data.winnerCountStr || '').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_rewards').setLabel('المكافآت (اختياري)').setPlaceholder("XP: 100 | Mora: 500").setStyle(TextInputStyle.Short).setValue(data.rewardsInput || '').setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_channel').setLabel('اي دي القناة (اختياري)').setPlaceholder("12345...").setStyle(TextInputStyle.Short).setValue(data.channelID || '').setRequired(false))
                    );
                    await i.showModal(modal);

                } else if (id === 'g_builder_visuals') {
                    const data = giveawayBuilders.get(i.user.id) || {};
                    const modal = new ModalBuilder().setCustomId('g_visuals_modal').setTitle('إعداد الشكل (2/2)');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_desc').setLabel('الوصف (اختياري)').setStyle(TextInputStyle.Paragraph).setValue(data.description || '').setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_image').setLabel('رابط الصورة (اختياري)').setStyle(TextInputStyle.Short).setValue(data.image || '').setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_color').setLabel('اللون (اختياري)').setPlaceholder("#FFFFFF").setStyle(TextInputStyle.Short).setValue(data.color || '').setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_emoji').setLabel('ايموجي الزر (اختياري)').setPlaceholder("🎉").setStyle(TextInputStyle.Short).setValue(data.buttonEmoji || '').setRequired(false))
                    );
                    await i.showModal(modal);

                } else if (id === 'g_builder_send') {
                    await i.deferReply({ flags: [MessageFlags.Ephemeral] }); 
                    const data = giveawayBuilders.get(i.user.id);
                    if (!data || !data.prize || !data.durationStr || !data.winnerCountStr) {
                        return i.editReply("❌ البيانات الأساسية مفقودة.");
                    }
                    const durationMs = ms(data.durationStr);
                    const winnerCount = parseInt(data.winnerCountStr);
                    if (!durationMs || durationMs <= 0) return i.editReply("❌ المدة غير صالحة.");
                    if (isNaN(winnerCount) || winnerCount < 1) return i.editReply("❌ عدد الفائزين غير صالح.");
                    
                    const endsAt = Date.now() + durationMs;
                    
                    let embedDescription = "";
                    if (data.description) embedDescription += `${data.description}\n\n`;
                    embedDescription += `✶ عـدد الـمـشاركـيـن: \`0\`\n`;
                    embedDescription += `✦ ينتهي بعـد: <t:${Math.floor(endsAt / 1000)}:R>`;
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`✥ قـيـفـاواي عـلـى: ${data.prize}`)
                        .setDescription(embedDescription)
                        .setColor(data.color || "Random")
                        .setImage(data.image || null)
                        .setFooter({ text: `${winnerCount} فائز` });
                        
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('g_enter').setLabel('مـشـاركــة').setStyle(ButtonStyle.Success).setEmoji(data.buttonEmoji || '🎉')
                    );
                    
                    let targetChannel = i.channel;
                    if (data.channelID) {
                        try {
                            const ch = await client.channels.fetch(data.channelID);
                            if (ch && ch.isTextBased()) targetChannel = ch;
                        } catch (err) { await i.editReply("⚠️ اي دي القناة غير صالح، سيتم الإرسال هنا."); }
                    }
                    
                    const gMessage = await targetChannel.send({ embeds: [embed], components: [row] });
                    
                    sql.prepare("INSERT INTO active_giveaways (messageID, guildID, channelID, prize, endsAt, winnerCount, xpReward, moraReward, isFinished) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)")
                        .run(gMessage.id, i.guild.id, targetChannel.id, data.prize, endsAt, winnerCount, data.xpReward || 0, data.moraReward || 0);
                    
                    setTimeout(() => endGiveaway(client, gMessage.id), durationMs);
                    
                    giveawayBuilders.delete(i.user.id); 
                    await i.message.edit({ content: "✅ تم إرسال القيفاواي بنجاح!", embeds: [], components: [] }).catch(() => {});
                    await i.editReply("✅ تم الإرسال!");
                    return;

                } else if (id === 'g_enter') {
                    if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{}); 
                    const giveawayID = i.message.id;
                    const userID = i.user.id;
                    const existingEntry = sql.prepare("SELECT 1 FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").get(giveawayID, userID);
                    let replyMessage = "";
                    if (existingEntry) {
                        sql.prepare("DELETE FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").run(giveawayID, userID);
                        replyMessage = "✅ تـم الـغـاء الـمـشاركـة";
                    } else {
                        const weight = await getUserWeight(i.member, sql).catch(() => 1);
                        sql.prepare("INSERT INTO giveaway_entries (giveawayID, userID, weight) VALUES (?, ?, ?)").run(giveawayID, userID, weight);
                        replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح دخـلت بـ: ${weight} تذكـرة`;
                    }
                    await i.followUp({ content: replyMessage, flags: [MessageFlags.Ephemeral] }); 
                
                } 
                else if (id === 'g_enter_drop') {
                    if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                    const messageID = i.message.id;
                    const userID = i.user.id;

                    try {
                        const giveaway = sql.prepare("SELECT * FROM active_giveaways WHERE messageID = ? AND isFinished = 0").get(messageID);
                        
                        if (!giveaway || (giveaway.endsAt && giveaway.endsAt < Date.now())) {
                            return i.followUp({ content: "❌ هذا القيفاواي انتهى.", flags: [MessageFlags.Ephemeral] });
                        }

                        // التحقق من التسجيل المسبق
                        const existing = sql.prepare("SELECT 1 FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").get(messageID, userID);
                        if (existing) {
                            return i.followUp({ content: "⚠️ أنت مسجل بالفعل.", flags: [MessageFlags.Ephemeral] });
                        }

                        // محاولة جلب الوزن مع قيمة احتياطية عند الخطأ
                        let weight = 1;
                        try {
                            weight = await getUserWeight(i.member, sql);
                        } catch (err) {
                            console.error("خطأ في جلب الوزن (Drop):", err);
                            weight = 1; 
                        }

                        sql.prepare("INSERT INTO giveaway_entries (giveawayID, userID, weight) VALUES (?, ?, ?)").run(messageID, userID, weight);
                        return i.followUp({ content: `✅ تم التسجيل بنجاح (تذاكر: ${weight})!`, flags: [MessageFlags.Ephemeral] });

                    } catch (error) { 
                        console.error("Drop Entry Error:", error);
                        return i.followUp({ content: "❌ حدث خطأ غير متوقع أثناء التسجيل.", flags: [MessageFlags.Ephemeral] }); 
                    }

                } else if (id.startsWith('panel_') || id.startsWith('quests_')) {
                    await handleQuestPanel(i, client, sql);
                } else if (id.startsWith('pvp_')) {
                    await handlePvpInteraction(i, client, sql);
                }
                return; 

            // ====================================================
            // 4. Modals Submissions
            // ====================================================
            } else if (i.isModalSubmit()) {
                
                // معالجة مودل التايم أوت
                if (i.customId.startsWith('timeout_app_modal_')) {
                    await i.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const targetId = i.customId.replace('timeout_app_modal_', '');
                    let durationInput = i.fields.getTextInputValue('timeout_duration');
                    let reasonInput = i.fields.getTextInputValue('timeout_reason');

                    if (!durationInput || durationInput.trim() === "") durationInput = "3h";
                    if (!reasonInput || reasonInput.trim() === "") reasonInput = "مخالفة القوانين";

                    const targetMember = await i.guild.members.fetch(targetId).catch(() => null);
                    if (!targetMember) return i.editReply("❌ العضو غير موجود.");

                    const durationMs = ms(durationInput);
                    if (!durationMs || durationMs > 2419200000) return i.editReply("❌ مدة غير صالحة (الحد الأقصى 28 يوم).");

                    try {
                        await targetMember.timeout(durationMs, `بواسطة ${i.user.tag}: ${reasonInput}`);

                        const finishTime = Math.floor((Date.now() + durationMs) / 1000);
                        await i.editReply({ 
                            content: `❖ خـالفـت القـوانيـن وتمـت معاقبـتك لـ\n✶ <t:${finishTime}:R>` 
                        });

                        const dmEmbed = new EmbedBuilder()
                            .setDescription(`**❖ خـالفـت القـوانيـن وتمـت معاقبـتك لـ**\n✶ المدة: ${durationInput}\n✶ السـبب: ${reasonInput}`)
                            .setColor("Random")
                            .setThumbnail(targetMember.user.displayAvatarURL());

                        const dmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel(i.guild.name)
                                .setStyle(ButtonStyle.Link)
                                .setURL(`https://discord.com/channels/${i.guild.id}`) 
                        );

                        await targetMember.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => {});

                    } catch (err) {
                        console.error(err);
                        await i.editReply("❌ حدث خطأ (تأكد من صلاحيات البوت وتراتبية الرتب).");
                    }
                    return;
                }

                if (i.customId === 'g_content_modal' || i.customId === 'g_visuals_modal') {
                     if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                     const data = giveawayBuilders.get(i.user.id) || {};
                     if (i.customId === 'g_content_modal') {
                         data.prize = i.fields.getTextInputValue('g_prize');
                         data.durationStr = i.fields.getTextInputValue('g_duration');
                         data.winnerCountStr = i.fields.getTextInputValue('g_winners');
                         data.rewardsInput = i.fields.getTextInputValue('g_rewards');
                         data.channelID = i.fields.getTextInputValue('g_channel');
                     } else {
                         data.description = i.fields.getTextInputValue('g_desc');
                         data.image = i.fields.getTextInputValue('g_image');
                         data.color = i.fields.getTextInputValue('g_color');
                         data.buttonEmoji = i.fields.getTextInputValue('g_emoji');
                     }
                     giveawayBuilders.set(i.user.id, data);
                     await updateBuilderEmbed(i, data);
                }
                
                // 🔥 معالجة مودالات المتجر (بما فيها شراء الرد التلقائي) 🔥
                else if (await handleShopModal(i, client, sql)) {
                    // تم التعامل معه
                } 
                else if (i.customId.startsWith('customrole_modal_')) { 
                    await handleCustomRoleInteraction(i, client, sql);
                }
                return; 

            // ====================================================
            // 5. Select Menus
            // ====================================================
            } else if (i.isStringSelectMenu()) {
                
                const id = i.customId;
                
                if (id === 'boss_execute_skill') {
                    await handleBossInteraction(i, client, sql);
                }
                else if (id.startsWith('streak_panel_')) { 
                    await handleStreakPanel(i, client, sql);
                }
                else if (id === 'farm_shop_select' && handleFarmInteractions) {
                    await handleFarmInteractions(i, client, sql);
                }
                else if (
                    id === 'shop_select_item' || 
                    id === 'shop_skill_select_menu' || 
                    id === 'fishing_gear_sub_menu' || 
                    id === 'shop_buy_bait_menu'
                ) {
                    if (id === 'shop_select_item') await handleShopSelectMenu(i, client, sql);
                    else if (id === 'shop_skill_select_menu') await handleSkillSelectMenu(i, client, sql);
                    else await handleShopInteractions(i, client, sql);
                }
                else if (id.startsWith('rr_')) { 
                    await handleReactionRole(i, client, sql, antiRolesCache); 
                } else if (id === 'g_reroll_select') {
                    await handleReroll(i, client, sql);
                } else if (id.startsWith('quest_panel_menu')) {
                    await handleQuestPanel(i, client, sql);
                } else if (id.startsWith('pvp_')) { 
                    await handlePvpInteraction(i, client, sql);
                } 

                return; 
            }

        } catch (error) {
            if (error.code === 10062 || error.code === 40060) return;
            console.error("خطأ فادح في معالج التفاعلات:", error);
            if (!i.replied && !i.deferred) {
                await i.reply({ content: '⚠️ انتهى وقت الاستجابة.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        } finally {
            processingInteractions.delete(i.user.id);
        }
    });
};
