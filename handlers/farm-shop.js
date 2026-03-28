const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags,
    Colors
} = require('discord.js');

const farmAnimals = require('../json/farm-animals.json');
const feedItems = require('../json/feed-items.json');
const seeds = require('../json/seeds.json');

let getPlayerCapacity;
try { ({ getPlayerCapacity } = require('../utils/farmUtils.js')); } 
catch(e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 9; // تم تقليل العدد ليكون التصميم أرتب في الإمبد
const MAX_FARM_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function executeDB(db, query, params = []) {
    try {
        return await db.query(query, params);
    } catch (e) {
        console.error(`[DB Error]: ${e.message} \nQuery: ${query}`);
        throw e; 
    }
}

function buildMainMenu(user) {
    const embed = new EmbedBuilder()
        .setTitle('✥ المتـجر الـزراعـي المـركـزي 🌾')
        .setDescription(
            `من بذرةٍ صغيرة إلى مزرعةٍ عامرة، ستجد هنا مستلزمات الزراعة الأساسية\n` +
            `✶ يمكنك شراء الحيوانات، والبذور، والأعلاف 🌱\n\n` +
            `✶ كل ما تحتاجه لبداية مستقرة وتطوير مزرعتك خطوة بخطوة`
        )
        .setColor("Green")
        .setThumbnail(user.displayAvatarURL())
        .setImage('https://i.postimg.cc/dVpcpxXL/fmark.gif');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_cat_animals').setLabel('قسم الحيوانات').setStyle(ButtonStyle.Danger).setEmoji('🐔'),
        new ButtonBuilder().setCustomId('shop_cat_seeds').setLabel('قسم البذور').setStyle(ButtonStyle.Primary).setEmoji('🌱'),
        new ButtonBuilder().setCustomId('shop_cat_feed').setLabel('قسم الأعلاف').setStyle(ButtonStyle.Success).setEmoji('🌾')
    );

    return { embeds: [embed], components: [row] };
}

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
            value: `farm_select_item|${category}|${item.id}`,
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

async function handleShopInteraction(i, client, db, user, guild, shopState, getNavRow) {
    if (i.customId.startsWith('shop_cat_')) {
        await i.deferUpdate().catch(()=>{});
        const category = i.customId.replace('shop_cat_', '');
        shopState.currentCategory = category;
        shopState.currentPage = 0;

        let itemsList = [];
        if (category === 'animals') itemsList = farmAnimals;
        else if (category === 'seeds') itemsList = seeds;
        else if (category === 'feed') itemsList = feedItems;
        shopState.currentItemsList = itemsList;

        let currentCap = 0;
        let maxCap = 0;
        if (category === 'animals') {
            let userFarmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
            if(getPlayerCapacity) maxCap = await getPlayerCapacity(client, user.id, guild.id);
        }

        const data = buildGridView(itemsList, 0, currentCap, maxCap, category);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_back_main') {
        await i.deferUpdate().catch(()=>{});
        const data = buildMainMenu(user);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_page_prev' || i.customId === 'farm_page_next') {
        await i.deferUpdate().catch(()=>{});
        if (i.customId === 'farm_page_prev' && shopState.currentPage > 0) shopState.currentPage--;
        else if (i.customId === 'farm_page_next') shopState.currentPage++;

        let currentCap = 0, maxCap = 0;
        if (shopState.currentCategory === 'animals') {
            let userFarmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
            if(getPlayerCapacity) maxCap = await getPlayerCapacity(client, user.id, guild.id);
        }

        const data = buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, maxCap, shopState.currentCategory);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')] }).catch(()=>{});
    }

    if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
        const [_, category, itemId] = i.values[0].split('|');
        
        let item = null;
        let desc = '';
        if (category === 'animals') {
            item = farmAnimals.find(a => String(a.id) === String(itemId));
            desc = `**الدخل اليومي:** ${item.income_per_day} مورا\n**الحجم في الحظيرة:** ${item.size}\n**مدة الحياة:** ${item.lifespan_days} يوم`;
        } else if (category === 'seeds') {
            item = seeds.find(s => String(s.id) === String(itemId));
            desc = `**وقت النمو:** ${item.growth_time_hours} ساعة\n**وقت الذبول:** ${item.wither_time_hours} ساعة\n**سعر البيع بعد الحصاد:** ${item.sell_price} مورا\n**نقاط الخبرة:** +${item.xp_reward} XP`;
        } else if (category === 'feed') {
            item = feedItems.find(f => String(f.id) === String(itemId));
            desc = `**الوصف:** ${item.description}`;
        }

        if (!item) return await i.reply({ content: '❌ العنصر غير موجود.', flags: MessageFlags.Ephemeral });

        const detailEmbed = new EmbedBuilder()
            .setTitle(`🏞️ تفاصيل: ${item.name}`)
            .setDescription(desc)
            .addFields({ name: 'السعر', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true })
            .setColor(Colors.Gold);
        if (item.image) detailEmbed.setThumbnail(item.image);

        const buyBtn = new ButtonBuilder().setCustomId(`buy_btn_farm|${category}|${item.id}`).setLabel('شراء 🛒').setStyle(ButtonStyle.Success);
        const sellBtn = new ButtonBuilder().setCustomId(`sell_btn_farm|${category}|${item.id}`).setLabel('بيع (نصف السعر) 💰').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(buyBtn, sellBtn);

        return await i.reply({ embeds: [detailEmbed], components: [row], flags: MessageFlags.Ephemeral });
    }

    // عرض Modal الشراء أو البيع
    if (i.isButton() && (i.customId.startsWith('buy_btn_farm|') || i.customId.startsWith('sell_btn_farm|'))) {
        const action = i.customId.startsWith('buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        
        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seeds.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.reply({ content: '❌ العنصر غير موجود!', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder()
            .setCustomId(`farm_${action}_modal|${category}|${itemData.id}`)
            .setTitle(`${action === 'buy' ? 'شراء' : 'بيع'} ${itemData.name}`);

        const labelText = action === 'buy' ? `الكمية (سعر الواحد: ${itemData.price})` : `الكمية المراد بيعها`;
        const qtyInput = new TextInputBuilder()
            .setCustomId('quantity_input')
            .setLabel(labelText)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return await i.showModal(modal);
    }
}

async function handleFarmShopModal(i, client, db) {
    if (!i.customId.startsWith('farm_buy_modal|') && !i.customId.startsWith('farm_sell_modal|')) return false;

    try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const action = i.customId.startsWith('farm_buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        const qtyStr = i.fields.getTextInputValue('quantity_input').trim();
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ يرجى إدخال كمية صحيحة (أرقام فقط أكبر من 0).');

        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seeds.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.editReply('❌ العنصر غير موجود!');

        let userDataRes = await executeDB(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
        let userData = userDataRes?.rows?.[0];
        if (!userData && action === 'buy') {
            await executeDB(db, `INSERT INTO levels ("user", "guild", "mora", "bank", "level") VALUES ($1, $2, 0, 0, 1)`, [i.user.id, i.guild.id]).catch(()=>{});
            userData = { mora: 0 };
        }

        if (action === 'buy') {
            const totalPrice = itemData.price * quantity;
            if (Number(userData.mora || 0) < totalPrice) {
                return await i.editReply(`❌ رصيدك الكاش غير كافي! تحتاج إلى **${totalPrice.toLocaleString()}** ${EMOJI_MORA}.`);
            }

            if (category === 'animals') {
                if (!getPlayerCapacity) return await i.editReply('❌ نظام المزرعة غير متوفر حالياً.');
                let currentCap = 0;
                let userFarmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
                for (const row of userFarmRes?.rows || []) {
                    const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
                }
                const maxCapacity = await getPlayerCapacity(client, i.user.id, i.guild.id);
                const spaceNeeded = quantity * (itemData.size || 1);

                if (currentCap + spaceNeeded > maxCapacity) {
                    return await i.editReply(`🚫 **مساحة الحظيرة لا تكفي!**\nتحتاج إلى \`${spaceNeeded}\` مساحة، والمتاح لديك \`${maxCapacity - currentCap}\` فقط.`);
                }
            } else {
                let invRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                let currQty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity || 0) : 0;
                if (currQty + quantity > MAX_FARM_LIMIT) {
                    return await i.editReply(`🚫 **مخزنك ممتلئ!**\nالحد الأقصى هو **${MAX_FARM_LIMIT}**، ولديك حالياً \`${currQty}\`.`);
                }
            }

            // الخصم والإضافة (Buy)
            await executeDB(db, `UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]);
            
            try {
                if (category === 'animals') {
                    let farmCheck = await executeDB(db, `SELECT "id", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                    if (farmCheck?.rows?.[0]) {
                        await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, farmCheck.rows[0].id || farmCheck.rows[0].ID]);
                    } else {
                        await executeDB(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "purchaseTimestamp", "lastCollected", "quantity", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6, $7)`, [i.guild.id, i.user.id, itemData.id, Date.now(), 0, quantity, Date.now()]);
                    }
                } else {
                    let invCheck = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                    if (invCheck?.rows?.[0]) {
                        await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, invCheck.rows[0].id || invCheck.rows[0].ID]);
                    } else {
                        await executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, itemData.id, quantity]);
                    }
                }
            } catch(e) {
                await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]);
                return await i.editReply('❌ حدث خطأ أثناء الحفظ. تم إرجاع أموالك.');
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ عملية شراء ناجحة')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** ${itemData.emoji} ${itemData.name}\n🔢 **الكمية:** ${quantity.toLocaleString()}\n💰 **التكلفة:** ${totalPrice.toLocaleString()} ${EMOJI_MORA}`);
            return await i.editReply({ content: null, embeds: [successEmbed] });

        } else if (action === 'sell') {
            const sellPrice = Math.floor(itemData.price * 0.5); // نصف السعر
            const totalGain = sellPrice * quantity;

            if (category === 'animals') {
                let userFarmRes = await executeDB(db, `SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                const userAnimals = userFarmRes.rows;
                let totalOwned = 0;
                userAnimals.forEach(row => totalOwned += Number(row.quantity || row.Quantity));
                
                if (totalOwned < quantity) return await i.editReply(`❌ لا تملك هذه الكمية للبيع! (تمتلك ${totalOwned})`);

                const now = Date.now();
                let remainingToSell = quantity;
                let totalRefund = 0;
                let soldCount = 0;
                const lifespanMs = (itemData.lifespan_days || 30) * DAY_MS;
                const noSellMs = Math.ceil((itemData.lifespan_days || 30) * 0.2) * DAY_MS;

                for (const row of userAnimals) {
                    if (remainingToSell <= 0) break;
                    const purchaseTime = Number(row.purchaseTimestamp || row.purchasetimestamp) || now;
                    const ageMs = now - purchaseTime;
                    const remainingLifeMs = lifespanMs - ageMs;

                    if (remainingLifeMs <= noSellMs) continue; // الحيوان عجوز، لا يمكن بيعه

                    let currentValRatio = (remainingLifeMs / lifespanMs);
                    if (currentValRatio > 1) currentValRatio = 1;
                    if (currentValRatio < 0) currentValRatio = 0;
                    const refundPrice = Math.floor(itemData.price * 0.70 * currentValRatio);

                    const sellFromRow = Math.min(Number(row.quantity || row.Quantity), remainingToSell);
                    totalRefund += (refundPrice * sellFromRow);
                    remainingToSell -= sellFromRow;
                    soldCount += sellFromRow;

                    if (Number(row.quantity || row.Quantity) === sellFromRow) {
                        await executeDB(db, `DELETE FROM user_farm WHERE "id" = $1`, [row.id || row.ID]).catch(()=>{});
                    } else {
                        await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromRow, row.id || row.ID]).catch(()=>{});
                    }
                }

                if (soldCount === 0) return await i.editReply(`🚫 فشل البيع! حيواناتك كبيرة في السن ولا يقبلها السوق.`);
                
                await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalRefund, i.user.id, i.guild.id]);

                const sellEmbed = new EmbedBuilder()
                    .setTitle('📈 عملية بيع زراعية')
                    .setColor(Colors.Blue)
                    .setDescription(`📦 **الكمية المباعة:** ${soldCount.toLocaleString()}x ${itemData.name}\n💰 **المبلغ المسترد:** ${totalRefund.toLocaleString()} ${EMOJI_MORA}`);
                return await i.editReply({ content: null, embeds: [sellEmbed] });

            } else {
                let invCheck = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                const invItem = invCheck?.rows?.[0];
                
                if (!invItem || Number(invItem.quantity || invItem.Quantity) < quantity) {
                    return await i.editReply(`❌ لا تملك هذه الكمية للبيع!`);
                }

                await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id]);

                if (Number(invItem.quantity || invItem.Quantity) === quantity) {
                    await executeDB(db, `DELETE FROM user_inventory WHERE "id" = $1`, [invItem.id || invItem.ID]).catch(()=>{});
                } else {
                    await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, invItem.id || invItem.ID]).catch(()=>{});
                }

                const sellEmbed = new EmbedBuilder()
                    .setTitle('📈 عملية بيع زراعية')
                    .setColor(Colors.Blue)
                    .setDescription(`📦 **الكمية المباعة:** ${quantity.toLocaleString()}x ${itemData.name}\n💰 **الأرباح:** ${totalGain.toLocaleString()} ${EMOJI_MORA} (نصف السعر)`);
                return await i.editReply({ content: null, embeds: [sellEmbed] });
            }
        }

    } catch (e) {
        console.error(e);
        return false;
    }
}

module.exports = {
    buildMainMenu,
    handleShopInteraction,
    handleFarmShopModal
};
