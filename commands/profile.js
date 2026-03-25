const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');

// 🔥 استدعاء الـ Handlers الثلاثة 🔥
const { getProfileData, RACE_TRANSLATIONS } = require('../handlers/profile-handler.js');
const { getInventoryCategories, resolveItemInfo } = require('../handlers/inventory-handler.js');
const { getCombatData } = require('../handlers/combat-handler.js');

// المولدات
let generateInventoryCard, generateMainHub, generateSkillsCard;
try {
    ({ generateInventoryCard, generateMainHub } = require('../generators/inventory-generator.js'));
    ({ generateSkillsCard } = require('../generators/skills-card-generator.js'));
} catch (e) {
    generateInventoryCard = null; generateMainHub = null; generateSkillsCard = null;
}

const ITEMS_PER_PAGE = 15;
const SKILLS_PER_PAGE = 3;
const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('المركز الرئيسي: يعرض البروفايل، الحقيبة، أو العتاد الخاص بك.')
        .addUserOption(option => 
            option.setName('user')
            .setDescription('المستخدم الذي تريد عرض بياناته (اختياري)')
            .setRequired(false))
        .addStringOption(option => 
            option.setName('tab')
            .setDescription('القسم الذي تود فتحه مباشرة (اختياري)')
            .setRequired(false)
            .addChoices(
                { name: '🪪 بطاقة البروفايل', value: 'profile' },
                { name: '🎒 الحقيبة', value: 'inventory' },
                { name: '⚔️ العتاد والمهارات', value: 'combat' }
            )),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card', 'inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة', 'مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'], 
    description: 'يعرض بطاقة المغامر أو الحقيبة أو العتاد الخاص بك.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser, targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage; guild = interaction.guild; client = interaction.client;
            authorUser = interaction.user; targetMember = interaction.options.getMember('user') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage; guild = message.guild; client = message.client;
            authorUser = message.author; targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            else return message.channel.send(payload);
        };

        if (!targetMember || targetMember.user.bot) return reply({ content: "❌ لا يمكن عرض بيانات هذا العضو." });

        try {
            const db = client.sql; 
            const targetUser = targetMember.user; 
            const guildId = guild.id;
            const isOwnProfile = targetUser.id === authorUser.id;
            const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

            // 🔥 توجيه العرض (Routing) بناءً على الأمر المدخل 🔥
            let currentView = 'profile'; 
            let invCategory = 'main';

            if (isSlash) {
                const chosenTab = interactionOrMessage.options.getString('tab');
                if (chosenTab) { currentView = chosenTab; if (chosenTab === 'inventory') invCategory = 'main'; }
            } else {
                const commandUsed = interactionOrMessage.content.slice(1).trim().split(/ +/)[0].toLowerCase();
                if (['inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة'].includes(commandUsed)) { currentView = 'inventory'; invCategory = 'main'; }
                else if (['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'].includes(commandUsed)) { currentView = 'combat'; }
            }

            let invPage = 1; 
            let skillPage = 0;

            // جلب البيانات من الـ Handlers
            const profileData = await getProfileData(client, db, guildId, targetMember, targetUser, authorUser, cleanName);
            const categories = await getInventoryCategories(db, targetUser.id, guildId);
            const combatData = await getCombatData(db, targetMember, targetUser, guildId, RACE_TRANSLATIONS);

            const getNavigationButtons = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`view_profile_${authorUser.id}`).setLabel('البروفايل').setEmoji('🪪').setStyle(currentView === 'profile' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_inventory_${authorUser.id}`).setLabel('الحقيبة').setEmoji('🎒').setStyle(currentView === 'inventory' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_combat_${authorUser.id}`).setLabel('العتاد والمهارات').setEmoji('⚔️').setStyle(currentView === 'combat' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                );
            };

            const getInvCategoryButtons = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setLabel('الخيمة').setEmoji('⛺').setStyle(invCategory === 'main' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_materials_${authorUser.id}`).setLabel('موارد').setEmoji('💎').setStyle(invCategory === 'materials' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_fishing_${authorUser.id}`).setLabel('صيد').setEmoji('🎣').setStyle(invCategory === 'fishing' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_farming_${authorUser.id}`).setLabel('مزرعة').setEmoji('🌾').setStyle(invCategory === 'farming' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_others_${authorUser.id}`).setLabel('أخرى').setEmoji('📦').setStyle(invCategory === 'others' ? ButtonStyle.Success : ButtonStyle.Secondary)
                );
            };

            const renderView = async () => {
                let components = [getNavigationButtons()];

                if (currentView === 'profile') {
                    const buffer = await generateAdventurerCard(profileData);
                    const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
                    return { content: `**🪪 البطاقة الشخصية لـ ${cleanName}**`, files: [attachment], components };
                } 
                else if (currentView === 'combat') {
                    if (!generateSkillsCard) return { content: "❌ لا يمكن رسم بطاقة المهارات حالياً.", components };
                    
                    const totalSkillPages = Math.max(1, Math.ceil(combatData.allSkillsList.length / SKILLS_PER_PAGE));
                    const currentSkillsSlice = combatData.allSkillsList.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE);
                    
                    const cardData = {
                        user: targetUser, avatarUrl: targetUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
                        cleanName: cleanName, weaponData: combatData.weaponData, raceName: combatData.arabicRaceName, skillsList: currentSkillsSlice,
                        totalSpent: combatData.totalSpent, userLevel: combatData.userLevel, currentPage: skillPage, totalPages: totalSkillPages,
                        potionsList: combatData.potionsList // تم التمرير كما طلبت
                    };
                    const buffer = await generateSkillsCard(cardData);
                    const attachment = new AttachmentBuilder(buffer, { name: `skills.png` });

                    if (totalSkillPages > 1) {
                        components.push(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`sk_prev_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === 0),
                            new ButtonBuilder().setCustomId(`sk_next_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === totalSkillPages - 1)
                        ));
                    }
                    return { content: `**⚔️ العتاد والمهارات لـ ${cleanName}**`, files: [attachment], components };
                }
                else if (currentView === 'inventory') {
                    components.push(getInvCategoryButtons());
                    
                    if (invCategory === 'main') {
                        let rankLetter = 'F';
                        const lvl = profileData.level;
                        if(lvl >= 100) rankLetter = 'SSS'; else if(lvl >= 80) rankLetter = 'SS'; else if(lvl >= 60) rankLetter = 'S'; else if(lvl >= 40) rankLetter = 'A'; else if(lvl >= 20) rankLetter = 'B'; else if(lvl >= 10) rankLetter = 'C'; else if(lvl >= 5) rankLetter = 'D';
                        
                        const totalMora = parseInt(profileData.mora.replace(/,/g, '')) || 0;
                        const buffer = await generateMainHub(targetUser, cleanName, totalMora, rankLetter, combatData.arabicRaceName, profileData.weaponName);
                        const attachment = new AttachmentBuilder(buffer, { name: 'hub.png' });
                        return { content: `**⛺ خيمة ${cleanName}**`, files: [attachment], components };
                    }
                    
                    const items = categories[invCategory] || [];
                    const catTitles = { materials: 'موارد التطوير', fishing: 'الصيد والأسماك', farming: 'المزرعة والزراعة', others: 'متفرقات' };
                    
                    if (items.length === 0) {
                        return { content: `**🎒 ${cleanName} | [ ${catTitles[invCategory]} ]**\n> ❌ هذا القسم فارغ تماماً.`, files: [], components };
                    }

                    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
                    if (invPage > totalPages) invPage = totalPages;
                    const startIdx = (invPage - 1) * ITEMS_PER_PAGE;
                    const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

                    if (totalPages > 1) {
                        components.push(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                            new ButtonBuilder().setCustomId('disp').setLabel(`${invPage}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                            new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(invPage === totalPages)
                        ));
                    }
                    if (isOwnProfile) {
                        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`trade_init_${authorUser.id}`).setLabel('مبادلة عنصر 🤝').setStyle(ButtonStyle.Success)));
                    }

                    const buffer = await generateInventoryCard(cleanName, catTitles[invCategory], pageItems, invPage, totalPages);
                    const attachment = new AttachmentBuilder(buffer, { name: 'inv.png' });
                    return { content: `**🎒 ${cleanName} | [ ${catTitles[invCategory]} ]**`, files: [attachment], components };
                }
            };

            const msg = await reply(await renderView());
            const filter = i => i.user.id === authorUser.id && i.customId.includes(authorUser.id);
            const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

            collector.on('collect', async (i) => {
                try { await i.deferUpdate(); } catch(e) { return; }
                const id = i.customId;

                // التنقل الأساسي
                if (id.startsWith('view_')) { currentView = id.split('_')[1]; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('cat_')) { invCategory = id.split('_')[1]; invPage = 1; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('inv_n_')) { invPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('inv_p_')) { invPage--; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_next_')) { skillPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_prev_')) { skillPage--; await msg.edit(await renderView()).catch(()=>{}); }
                
                // 🔥 نظام المبادلة المتكامل (منطق Inventory القديم 100%) 🔥
                else if (id.startsWith('trade_init_')) {
                    const tradableItems = categories[invCategory];
                    if (!tradableItems || tradableItems.length === 0) return i.followUp({ content: '❌ لا تملك أي عناصر للتبادل في هذا القسم.', flags: [MessageFlags.Ephemeral] });

                    const options = tradableItems.slice(0, 25).map(item => ({ label: item.name, value: item.id, emoji: item.emoji || '📦', description: `الكمية المتاحة: ${item.quantity}` }));
                    const itemSelect = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade_item_${authorUser.id}`).setPlaceholder('اختر العنصر الذي تريد إرساله...').addOptions(options));
                    await i.editReply({ components: [itemSelect] }).catch(()=>{});
                }
                else if (i.isStringSelectMenu() && id.startsWith('trade_item_')) {
                    global.tradeTempItem = i.values[0];
                    const userSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`trade_target_${authorUser.id}`).setPlaceholder('اختر اللاعب الذي تريد التعامل معه...'));
                    await i.editReply({ components: [userSelect] }).catch(()=>{});
                }
                else if (i.isUserSelectMenu() && id.startsWith('trade_target_')) {
                    const targetID = i.values[0];
                    if (targetID === authorUser.id || (await client.users.fetch(targetID)).bot) return i.followUp({ content: '❌ لا يمكنك التبادل مع نفسك أو البوت!', flags: [MessageFlags.Ephemeral] });

                    const modal = new ModalBuilder().setCustomId(`trade_modal_${authorUser.id}_${targetID}`).setTitle('إعدادات المبادلة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 للهدية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                    );
                    await i.showModal(modal).catch(()=>{});

                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: m => m.user.id === authorUser.id && m.customId === `trade_modal_${authorUser.id}_${targetID}`, time: 60000 });
                        const qty = parseInt(modalSubmit.fields.getTextInputValue('trade_qty'));
                        const price = parseInt(modalSubmit.fields.getTextInputValue('trade_price'));

                        if (isNaN(qty) || qty <= 0) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                        if (isNaN(price) || price < 0) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

                        let checkInvRes;
                        try { checkInvRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [authorUser.id, guildId, global.tradeTempItem]); }
                        catch(e) { checkInvRes = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [authorUser.id, guildId, global.tradeTempItem]).catch(()=>({rows:[]})); }
                        const senderInvData = checkInvRes?.rows[0];

                        if (!senderInvData || Number(senderInvData.quantity) < qty) return modalSubmit.reply({ content: '❌ أنت لا تملك هذه الكمية في حقيبتك!', flags: [MessageFlags.Ephemeral] });

                        const itemInfo = resolveItemInfo(global.tradeTempItem);

                        if (price === 0) {
                            await db.query('BEGIN').catch(()=>{});
                            const newSenderQty = Number(senderInvData.quantity) - qty;
                            if (newSenderQty > 0) {
                                await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newSenderQty, senderInvData.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newSenderQty, senderInvData.id]));
                            } else {
                                await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvData.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvData.id]));
                            }

                            await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [targetID, guildId, global.tradeTempItem, qty]).catch(()=> db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [targetID, guildId, global.tradeTempItem, qty]));
                            await db.query('COMMIT').catch(()=>{});

                            await modalSubmit.reply({ content: `🎁 <@${authorUser.id}> أرسل **${qty}x ${itemInfo.emoji} ${itemInfo.name}** كهدية إلى <@${targetID}>!` });
                            
                            // تحديث الموارد الحية في المتغيرات
                            const idx = categories[invCategory].findIndex(c => c.id === global.tradeTempItem);
                            if(idx > -1) { categories[invCategory][idx].quantity -= qty; if(categories[invCategory][idx].quantity <= 0) categories[invCategory].splice(idx, 1); }
                            
                            await msg.edit(await renderView()).catch(()=>{});
                        } else {
                            await modalSubmit.deferReply();
                            const tradeId = Date.now().toString();
                            const tradeButtons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('قبول وشراء ✅').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
                            );

                            const tradeMsgObj = await modalSubmit.followUp({ content: `⚖️ **عـقـد تـجـاري**\nمرحباً <@${targetID}>!\nيعرض عليك <@${authorUser.id}>:\n**استلام:** ${qty}x ${itemInfo.emoji} ${itemInfo.name}\n**دفع:** ${price.toLocaleString()} ${EMOJI_MORA}`, components: [tradeButtons] });
                            msg.edit(await renderView()).catch(()=>{});

                            const tradeFilter = btn => btn.user.id === targetID && btn.customId.includes(tradeId);
                            const tradeCollector = tradeMsgObj.createMessageComponentCollector({ filter: tradeFilter, time: 60000 });

                            tradeCollector.on('collect', async btn => {
                                await btn.deferUpdate().catch(()=>{});
                                if (btn.customId.includes('dec_')) {
                                    tradeCollector.stop('declined');
                                    return tradeMsgObj.edit({ content: `❌ تم رفض الصفقة من قبل <@${targetID}>.`, components: [] });
                                }

                                let targetLvlRes;
                                try { targetLvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetID, guildId]); }
                                catch(e) { targetLvlRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [targetID, guildId]).catch(()=>({rows:[]})); }
                                const targetMora = targetLvlRes?.rows[0] ? Number(targetLvlRes.rows[0].mora) : 0;
                                
                                if (targetMora < price) return btn.followUp({ content: '❌ لا تملك المورا الكافية!', flags: [MessageFlags.Ephemeral] });

                                let checkInvFinalRes;
                                try { checkInvFinalRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [authorUser.id, guildId, global.tradeTempItem]); }
                                catch(e) { checkInvFinalRes = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [authorUser.id, guildId, global.tradeTempItem]).catch(()=>({rows:[]})); }
                                const senderInvFinal = checkInvFinalRes?.rows[0];

                                if (!senderInvFinal || Number(senderInvFinal.quantity) < qty) {
                                    tradeCollector.stop('failed');
                                    return tradeMsgObj.edit({ content: `❌ فشلت الصفقة: البائع لا يملك الكمية المطلوبة حالياً!`, components: [] });
                                }

                                try {
                                    await db.query('BEGIN').catch(()=>{});
                                    const finalSenderQty = Number(senderInvFinal.quantity) - qty;
                                    if (finalSenderQty > 0) {
                                        await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [finalSenderQty, senderInvFinal.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [finalSenderQty, senderInvFinal.id]));
                                    } else {
                                        await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvFinal.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvFinal.id]));
                                    }
                                    
                                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [targetID, guildId, global.tradeTempItem, qty]).catch(()=> db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [targetID, guildId, global.tradeTempItem, qty]));
                                    await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, targetID, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [price, targetID, guildId]));
                                    await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [price, authorUser.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [price, authorUser.id, guildId]));
                                    await db.query('COMMIT').catch(()=>{});

                                    tradeCollector.stop('accepted');
                                    await tradeMsgObj.edit({ content: `✅ **تمت الصفقة بنجاح!**\nاشترى <@${targetID}> ${qty}x ${itemInfo.name} مقابل ${price.toLocaleString()} ${EMOJI_MORA} من <@${authorUser.id}>.`, components: [] });

                                    const idx = categories[invCategory].findIndex(c => c.id === global.tradeTempItem);
                                    if(idx > -1) { categories[invCategory][idx].quantity -= qty; if(categories[invCategory][idx].quantity <= 0) categories[invCategory].splice(idx, 1); }
                                    
                                    await msg.edit(await renderView()).catch(()=>{});
                                } catch (e) {
                                    await db.query('ROLLBACK').catch(()=>{});
                                    tradeCollector.stop('error');
                                    await tradeMsgObj.edit({ content: `❌ حدث خطأ فني.`, components: [] });
                                }
                            });

                            tradeCollector.on('end', (collected, reason) => {
                                if (reason === 'time') tradeMsgObj.edit({ content: `⏳ انتهى وقت العرض.`, components: [] }).catch(()=>{});
                            });
                        }
                    } catch(e) {}
                }
            });

            collector.on('end', () => { try { msg.edit({ components: [] }).catch(()=>{}); } catch(e) {} });

        } catch (error) {
            console.error("Error in Hub command:", error);
            if (isSlash) await interaction.editReply({ content: "حدث خطأ أثناء تحميل البيانات." });
            else message.reply("حدث خطأ أثناء تحميل البيانات.");
        }
    }
};
