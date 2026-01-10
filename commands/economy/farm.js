const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    Colors, 
    SlashCommandBuilder, 
    MessageFlags 
} = require("discord.js");

// استيراد البيانات
const farmAnimals = require('../../json/farm-animals.json');
const seedsData = require('../../json/seeds.json');
const feedItems = require('../../json/feed-items.json');

// استدعاء دالة السعة
const { getPlayerCapacity } = require('../../utils/farmUtils.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';

const ITEMS_PER_PAGE = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================
// 🏗️ دوال بناء الواجهة (Builders)
// ============================================================

// 1. القائمة الرئيسية
function buildMainMenu(user) {
    const embed = new EmbedBuilder()
        .setTitle('✥ المتـجر الـزراعـي المـركـزي 🌾')
        // ✅ الوصف الجديد كما طلبت
        .setDescription(
            `من بذرةٍ صغيرة إلى مزرعةٍ عامرة، ستجد هنا مستلزمات الزراعة الأساسية\n` +
            `✶ يمكنك شراء الحيوانات، والبذور، والأعلاف 🌱\n\n` +
            `✶ كل ما تحتاجه لبداية مستقرة وتطوير مزرعتك خطوة بخطوة`
        )
        .setColor("Green")
        .setThumbnail(user.displayAvatarURL())
        .setImage('https://i.postimg.cc/dVpcpxXL/fmark.gif');

    // ✅ تغيير ألوان الأزرار (أحمر، أزرق، أخضر)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_cat_animals').setLabel('قسم الحيوانات').setStyle(ButtonStyle.Danger).setEmoji('🐔'), // أحمر
        new ButtonBuilder().setCustomId('shop_cat_seeds').setLabel('قسم البذور').setStyle(ButtonStyle.Primary).setEmoji('🌱'),   // أزرق
        new ButtonBuilder().setCustomId('shop_cat_feed').setLabel('قسم الأعلاف').setStyle(ButtonStyle.Success).setEmoji('🌾')    // أخضر
    );

    return { embeds: [embed], components: [row] };
}

// 2. العرض الشبكي (Grid View)
function buildGridView(allItems, pageIndex, currentCapacity, maxCapacity, category) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    const col1 = [], col2 = [], col3 = [];
    itemsOnPage.forEach((item, index) => {
        const price = item.price.toLocaleString();
        const itemLine = `**${item.emoji} ${item.name}**\n${price} ${EMOJI_MORA}`;

        if (index % 3 === 0) col1.push(itemLine);
        else if (index % 3 === 1) col2.push(itemLine);
        else col3.push(itemLine);
    });

    let title = `🏞️ متجر ${category === 'seeds' ? 'البذور' : 'الأعلاف'}`;
    let desc = `اختر عنصراً من القائمة المنسدلة بالأسفل لعرض التفاصيل أو الشراء.`;
    
    if (category === 'animals') {
        title = '🏞️ متجر الحيوانات';
        desc = `📦 **سعة الحظيرة:** [ \`${currentCapacity}\` / \`${maxCapacity}\` ]\nاختر حيواناً من القائمة لعرض التفاصيل.`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor("Green")
        .setImage('https://i.postimg.cc/dVpcpxXL/fmark.gif')
        .setDescription(desc)
        .addFields(
            { name: '\u200B', value: col1.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col2.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col3.join('\n\n') || '\u200B', inline: true }
        )
        .setFooter({ text: `صفحة ${pageIndex + 1} من ${totalPages}` });

    const selectOptions = itemsOnPage.map(item => {
        let description = `${item.price} مورا`;
        if (category === 'animals') description = `دخل: ${item.income_per_day}/يوم | حجم: ${item.size || 1}`;
        if (category === 'seeds') description = `نمو: ${item.growth_time_hours}س | بيع: ${item.sell_price}`;
        
        return {
            label: `${item.name}`,
            description: description,
            value: item.id,
            emoji: item.emoji
        };
    });

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('farm_select_item')
            .setPlaceholder('🔻 اضغط هنا لاختيار السلعة...')
            .addOptions(selectOptions)
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_back_main').setLabel('الرئيسية').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
    );
    
    if (totalPages > 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId('farm_page_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('farm_page_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
    }

    return { embeds: [embed], components: [selectMenuRow, navRow] };
}

// 3. عرض التفاصيل (Detail View)
function buildDetailView(item, userId, guildId, sql, itemIndex, totalItems, client, category) {
    let userQuantity = 0;
    let isFull = false;
    let maxCapacity = 0;
    let currentCapacityUsed = 0;

    if (category === 'animals') {
        const userFarmQuery = sql.prepare("SELECT SUM(quantity) as totalQty FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(userId, guildId, item.id);
        userQuantity = userFarmQuery && userFarmQuery.totalQty ? userFarmQuery.totalQty : 0;

        const userFarmRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
        for (const row of userFarmRows) {
            const fa = farmAnimals.find(a => a.id === row.animalID);
            if (fa) currentCapacityUsed += (fa.size || 1) * (row.quantity || 1);
        }
        maxCapacity = getPlayerCapacity(client, userId, guildId);
        isFull = (currentCapacityUsed + (item.size || 1)) > maxCapacity;
    } else {
        const invQuery = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, item.id);
        userQuantity = invQuery ? invQuery.quantity : 0;
    }

    const price = item.price.toLocaleString();
    let field2_name = "الدخل (لليوم)";
    let field2_val = "0";
    let field3_val = "";
    let field4_val = "";
    let field5_val = "";

    if (category === 'animals') {
        field2_val = `${item.income_per_day} ${EMOJI_MORA}`;
        const lifespan = item.lifespan_days || 30;
        const noSellDays = Math.ceil(lifespan * 0.2);
        const income = (item.income_per_day * userQuantity).toLocaleString();
        
        field3_val = `⏳ العمر: **${lifespan}** يوم\n🚫 حظر البيع: آخر **${noSellDays}** أيام\n📦 الحجم: **${item.size}**`;
        field4_val = `**${userQuantity.toLocaleString()}** (إجمالي الدخل: ${income}/يوم)`;
        field5_val = `[ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]`;

    } else if (category === 'seeds') {
        field2_name = "سعر البيع (للمحصول)";
        field2_val = `${item.sell_price} ${EMOJI_MORA}`;
        const profit = item.sell_price - item.price;
        
        field3_val = `⏳ النمو: **${item.growth_time_hours}** ساعة\n🍂 الذبول: **${item.wither_time_hours}** ساعة\n✨ الخبرة: **${item.xp_reward}** XP`;
        field4_val = `**${userQuantity.toLocaleString()}** بذرة`;
        field5_val = `صافي الربح: **${profit}** ${EMOJI_MORA}`;

    } else if (category === 'feed') {
        field2_name = "مخصص لـ";
        const target = farmAnimals.find(a => a.feed_id === item.id);
        field2_val = target ? target.name : "حيوانات متنوعة";
        
        field3_val = `📦 عنصر استهلاكي\n⚠️ ضروري لحياة الحيوان`;
        field4_val = `**${userQuantity.toLocaleString()}** كيس`;
        field5_val = "يمكن تخزينه بكميات كبيرة";
    }

    const detailEmbed = new EmbedBuilder()
        .setTitle(`🏞️ تفاصيل: ${item.name}`)
        .setColor("Blue")
        .setThumbnail(item.image || null)
        .addFields(
            { name: '💰 سعر الشراء', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: field2_name, value: field2_val, inline: true },
            { name: '📊 الخصائص', value: field3_val, inline: true },
            { name: category === 'feed' ? '🎒 في المخزن' : '🏡 في مزرعتك', value: field4_val, inline: false },
            { name: category === 'animals' ? '📦 السعة الحالية' : 'ℹ️ معلومات إضافية', value: field5_val, inline: false }
        )
        .setFooter({ text: `العنصر ${itemIndex + 1} من ${totalItems}` });

    if (isFull && category === 'animals') {
        detailEmbed.addFields({ name: '⚠️ تنبيه السعة', value: '🚫 **لا توجد مساحة كافية في الحظيرة!**', inline: false });
    }

    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_prev_detail_${item.id}`).setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_next_detail_${item.id}`).setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('farm_back_to_grid').setLabel('العودة للقائمة').setStyle(ButtonStyle.Primary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(category === 'animals' ? `buy_animal_${item.id}` : (category === 'seeds' ? `buy_seed_${item.id}` : `buy_feed_${item.id}`))
            .setLabel(isFull && category === 'animals' ? 'ممتلئ' : 'شراء 🛒')
            .setStyle(isFull && category === 'animals' ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull && category === 'animals'), 
            
        new ButtonBuilder()
            .setCustomId(category === 'animals' ? `sell_animal_${item.id}` : (category === 'seeds' ? `sell_seed_${item.id}` : `sell_feed_${item.id}`))
            .setLabel(`بيع 💰`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    return { embeds: [detailEmbed], components: [actionRow1, actionRow2] };
}

// ============================================================
// 🎮 الكوماند الرئيسي
// ============================================================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر_مزرعة')
        .setDescription('يعرض متجر المزرعة (حيوانات، بذور، أعلاف).'),

    name: 'farm',
    aliases: ['مزرعة', 'مزرعه', 'سوق_المزرعة'],
    category: "Economy",
    description: 'يعرض متجر المزرعة.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, guild;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            sql = client.sql;
            user = interaction.user;
            guild = interaction.guild;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            client = message.client;
            sql = client.sql;
            user = message.author;
            guild = message.guild;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        // متغيرات السيشن
        let currentView = 'main';
        let currentCategory = null; 
        let currentPage = 0;
        let currentItemIndex = 0;
        let currentItemsList = [];

        // 1. عرض القائمة الرئيسية
        const mainData = buildMainMenu(user);
        
        const msg = await reply({ embeds: mainData.embeds, components: mainData.components, fetchReply: true });

        const filter = i => i.user.id === user.id;
        const collector = msg.createMessageComponentCollector({ time: 300000, filter });

        collector.on('collect', async i => {
            if (i.replied || i.deferred) return;

            try {
                // === اختيار الفئة ===
                if (i.customId.startsWith('shop_cat_')) {
                    await i.deferUpdate();
                    currentCategory = i.customId.replace('shop_cat_', '');
                    currentView = 'grid';
                    currentPage = 0;

                    if (currentCategory === 'animals') currentItemsList = farmAnimals;
                    else if (currentCategory === 'seeds') currentItemsList = seedsData;
                    else if (currentCategory === 'feed') currentItemsList = feedItems;

                    // حساب السعة (فقط للحيوانات)
                    let currentCap = 0;
                    if (currentCategory === 'animals') {
                        const userRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
                        for (const row of userRows) {
                            const fa = farmAnimals.find(a => a.id === row.animalID);
                            if (fa) currentCap += (fa.size || 1) * (row.quantity || 1);
                        }
                    }
                    const currentMax = getPlayerCapacity(client, user.id, guild.id);

                    const data = buildGridView(currentItemsList, currentPage, currentCap, currentMax, currentCategory);
                    await i.editReply(data);
                }

                // === اختيار عنصر من القائمة ===
                else if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
                    await i.deferUpdate();
                    const selectedId = i.values[0];
                    currentItemIndex = currentItemsList.findIndex(it => it.id === selectedId);
                    
                    if (currentItemIndex !== -1) {
                        currentView = 'detail';
                        const item = currentItemsList[currentItemIndex];
                        const data = buildDetailView(item, user.id, guild.id, sql, currentItemIndex, currentItemsList.length, client, currentCategory);
                        await i.editReply(data);
                    }
                }

                // === الأزرار (تنقل وعودة) ===
                else if (i.isButton()) {
                    
                    // العودة للقائمة الرئيسية
                    if (i.customId === 'farm_back_main') {
                        await i.deferUpdate();
                        currentView = 'main';
                        currentCategory = null;
                        const data = buildMainMenu(user);
                        await i.editReply(data);
                    }

                    // العودة للشبكة
                    else if (i.customId === 'farm_back_to_grid') {
                        await i.deferUpdate();
                        currentView = 'grid';
                        
                        let currentCap = 0;
                        if (currentCategory === 'animals') {
                            const userRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
                            for (const row of userRows) {
                                const fa = farmAnimals.find(a => a.id === row.animalID);
                                if (fa) currentCap += (fa.size || 1) * (row.quantity || 1);
                            }
                        }
                        const currentMax = getPlayerCapacity(client, user.id, guild.id);
                        
                        const data = buildGridView(currentItemsList, currentPage, currentCap, currentMax, currentCategory);
                        await i.editReply(data);
                    }

                    // تقليب صفحات الشبكة
                    else if (i.customId === 'farm_page_prev' || i.customId === 'farm_page_next') {
                        await i.deferUpdate();
                        if (i.customId === 'farm_page_prev' && currentPage > 0) currentPage--;
                        else if (i.customId === 'farm_page_next') currentPage++;

                        let currentCap = 0;
                        if (currentCategory === 'animals') {
                            const userRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
                            for (const row of userRows) {
                                const fa = farmAnimals.find(a => a.id === row.animalID);
                                if (fa) currentCap += (fa.size || 1) * (row.quantity || 1);
                            }
                        }
                        const currentMax = getPlayerCapacity(client, user.id, guild.id);

                        const data = buildGridView(currentItemsList, currentPage, currentCap, currentMax, currentCategory);
                        await i.editReply(data);
                    }

                    // تقليب العناصر في التفاصيل
                    else if (i.customId.startsWith('farm_prev_detail_') || i.customId.startsWith('farm_next_detail_')) {
                        await i.deferUpdate();
                        if (i.customId.startsWith('farm_next_detail_')) currentItemIndex = (currentItemIndex + 1) % currentItemsList.length;
                        else currentItemIndex = (currentItemIndex - 1 + currentItemsList.length) % currentItemsList.length;

                        const item = currentItemsList[currentItemIndex];
                        const data = buildDetailView(item, user.id, guild.id, sql, currentItemIndex, currentItemsList.length, client, currentCategory);
                        await i.editReply(data);
                    }

                    // === الشراء والبيع (المودالات) ===
                    else if (i.customId.startsWith('buy_') || i.customId.startsWith('sell_')) {
                        const action = i.customId.startsWith('buy_') ? 'buy' : 'sell';
                        const typeStr = i.customId.split('_')[1]; 
                        const itemId = i.customId.replace(`${action}_${typeStr}_`, '');
                        const itemData = currentItemsList.find(it => it.id === itemId);

                        if (!itemData) return;

                        const modal = new ModalBuilder()
                            .setCustomId(`farm_${action}_${itemId}`)
                            .setTitle(`${action === 'buy' ? 'شراء' : 'بيع'} ${itemData.name}`);

                        const labelText = action === 'buy' ? `الكمية (سعر الواحد: ${itemData.price})` : `الكمية (للبيع)`;
                        const input = new TextInputBuilder()
                            .setCustomId('qty_input')
                            .setLabel(labelText)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('1')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        await i.showModal(modal);

                        try {
                            const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
                            const qty = parseInt(submit.fields.getTextInputValue('qty_input'));
                            
                            if (isNaN(qty) || qty <= 0) return submit.reply({ content: '❌ رقم غير صحيح.', flags: MessageFlags.Ephemeral });

                            let userData = client.getLevel.get(user.id, guild.id);
                            if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

                            if (action === 'buy') {
                                if (currentCategory === 'animals') {
                                    const userRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
                                    let currentCap = 0;
                                    for (const row of userRows) {
                                        const fa = farmAnimals.find(a => a.id === row.animalID);
                                        if (fa) currentCap += (fa.size || 1) * (row.quantity || 1);
                                    }
                                    const currentMax = getPlayerCapacity(client, user.id, guild.id);
                                    const requiredSize = (itemData.size || 1) * qty;
                                    
                                    if (currentCap + requiredSize > currentMax) {
                                        return submit.reply({ content: `🚫 لا توجد مساحة كافية! المساحة المطلوبة: ${requiredSize}, المتاحة: ${currentMax - currentCap}`, flags: MessageFlags.Ephemeral });
                                    }
                                }

                                const totalCost = itemData.price * qty;
                                if (userData.mora < totalCost) return submit.reply({ content: `❌ رصيد غير كافي! تحتاج **${totalCost.toLocaleString()}** مورا.`, flags: MessageFlags.Ephemeral });
                                
                                userData.mora -= totalCost;
                                client.setLevel.run(userData);
                                
                                if (currentCategory === 'animals') {
                                    sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, quantity, purchaseTimestamp, lastFedTimestamp) VALUES (?, ?, ?, ?, ?, ?)")
                                        .run(guild.id, user.id, itemId, qty, Date.now(), Date.now());
                                } else {
                                    sql.prepare("INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + ?")
                                        .run(guild.id, user.id, itemId, qty, qty);
                                }
                                
                                await submit.reply({ content: `✅ تم شراء **${qty}x ${itemData.name}** بنجاح!`, flags: MessageFlags.Ephemeral });

                            } else { // Sell
                                if (currentCategory === 'animals') {
                                    const userAnimals = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? ORDER BY purchaseTimestamp ASC").all(user.id, guild.id, itemId);
                                    
                                    let totalOwned = 0;
                                    userAnimals.forEach(row => totalOwned += row.quantity);
                                    if (totalOwned < qty) return submit.reply({ content: `❌ لا تملك الكمية! لديك: ${totalOwned}`, flags: MessageFlags.Ephemeral });

                                    const now = Date.now();
                                    let remainingToSell = qty;
                                    let totalRefund = 0;
                                    let soldCount = 0;
                                    
                                    const lifespanMs = (itemData.lifespan_days || 30) * DAY_MS;
                                    const noSellMs = Math.ceil((itemData.lifespan_days || 30) * 0.2) * DAY_MS;

                                    for (const row of userAnimals) {
                                        if (remainingToSell <= 0) break;
                                        
                                        const purchaseTime = row.purchaseTimestamp || now;
                                        const ageMs = now - purchaseTime;
                                        const remainingLifeMs = lifespanMs - ageMs;

                                        if (remainingLifeMs <= noSellMs) continue;

                                        let currentValRatio = (remainingLifeMs / lifespanMs);
                                        if (currentValRatio > 1) currentValRatio = 1;
                                        if (currentValRatio < 0) currentValRatio = 0;
                                        const refundPrice = Math.floor(itemData.price * 0.70 * currentValRatio);

                                        const sellFromRow = Math.min(row.quantity, remainingToSell);
                                        totalRefund += (refundPrice * sellFromRow);
                                        remainingToSell -= sellFromRow;
                                        soldCount += sellFromRow;

                                        if (row.quantity === sellFromRow) sql.prepare("DELETE FROM user_farm WHERE id = ?").run(row.id);
                                        else sql.prepare("UPDATE user_farm SET quantity = quantity - ? WHERE id = ?").run(sellFromRow, row.id);
                                    }

                                    if (soldCount === 0) return submit.reply({ content: `🚫 فشل البيع! حيواناتك كبيرة في السن ولا يقبلها السوق.`, flags: MessageFlags.Ephemeral });

                                    userData.mora += totalRefund;
                                    client.setLevel.run(userData);
                                    await submit.reply({ content: `✅ تم بيع **${soldCount}x ${itemData.name}** بـ **${totalRefund.toLocaleString()}** مورا.`, flags: MessageFlags.Ephemeral });

                                } else {
                                    const invItem = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(user.id, guild.id, itemId);
                                    if (!invItem || invItem.quantity < qty) return submit.reply({ content: `❌ لا تملك الكمية.`, flags: MessageFlags.Ephemeral });
                                    
                                    let sellPrice = 0;
                                    if (currentCategory === 'seeds') sellPrice = itemData.sell_price || Math.floor(itemData.price * 0.5);
                                    else sellPrice = Math.floor(itemData.price * 0.5);

                                    const totalGain = sellPrice * qty;
                                    userData.mora += totalGain;
                                    client.setLevel.run(userData);

                                    if (invItem.quantity === qty) sql.prepare("DELETE FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").run(user.id, guild.id, itemId);
                                    else sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(qty, user.id, guild.id, itemId);

                                    await submit.reply({ content: `✅ تم بيع **${qty}x ${itemData.name}** وكسبت **${totalGain.toLocaleString()}** مورا.`, flags: MessageFlags.Ephemeral });
                                }
                            }

                            const newData = buildDetailView(currentItemsList[currentItemIndex], user.id, guild.id, sql, currentItemIndex, currentItemsList.length, client, currentCategory);
                            await msg.edit(newData);

                        } catch (e) {
                            if (e.code !== 40060 && e.code !== 10062) console.error(e);
                        }
                    }
                }

            } catch (error) {
                console.error(error);
            }
        });

        collector.on('end', () => {
            if (msg.editable) msg.edit({ components: [] }).catch(() => {});
        });
    }
};
