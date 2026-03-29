const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');

const farmAnimals = require('../../json/farm-animals.json'); 
const seedsData = require('../../json/seeds.json'); 
const feedItems = require('../../json/feed-items.json');

const { drawFarmShopHub, drawFarmShopGrid, drawFarmShopDetail } = require('../../generators/farm-shop-generator.js');

let getPlayerCapacity;
try { ({ getPlayerCapacity } = require('../../utils/farmUtils.js')); } 
catch (e) { getPlayerCapacity = async () => 10; } // Fallback

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 9; 
const MAX_FARM_LIMIT = 1000;

async function executeDB(db, query, params = []) {
    try { return await db.query(query, params); } 
    catch (e) { console.error(`[DB Error]: ${e.message}`); throw e; }
}

async function buildMainMenu(user, client, db) {
    let mora = 0;
    try {
        const res = await executeDB(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1`, [user.id]).catch(()=>({rows:[]}));
        if(res.rows[0]) mora = Number(res.rows[0].mora || 0) + Number(res.rows[0].bank || 0);
    } catch(e) {}

    const buffer = await drawFarmShopHub(user, mora);
    const attachment = new AttachmentBuilder(buffer, { name: 'farm_shop_hub.png' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_cat_animals').setLabel('قسم الحيوانات').setStyle(ButtonStyle.Danger).setEmoji('🐄'),
        new ButtonBuilder().setCustomId('shop_cat_seeds').setLabel('قسم البذور').setStyle(ButtonStyle.Primary).setEmoji('🌱'),
        new ButtonBuilder().setCustomId('shop_cat_feed').setLabel('قسم الأعلاف').setStyle(ButtonStyle.Success).setEmoji('🌾')
    );

    return { content: '', files: [attachment], components: [row] };
}

async function buildGridView(itemsList, pageIndex, currentCap, maxCap, category) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = itemsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.max(1, Math.ceil(itemsList.length / ITEMS_PER_PAGE));

    const buffer = await drawFarmShopGrid(itemsOnPage, category, pageIndex, totalPages, maxCap, currentCap);
    const attachment = new AttachmentBuilder(buffer, { name: 'farm_shop_grid.png' });

    const selectOptions = itemsOnPage.map(item => ({
        label: item.name,
        description: `السعر: ${item.price} مورا`,
        value: `farm_select_item|${category}|${item.id}`,
        emoji: item.emoji
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('farm_select_item')
            .setPlaceholder('🔻 اختر عنصراً للتفاصيل الشراء/البيع...')
            .addOptions(selectOptions)
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_back_main').setLabel('الرئيسية').setStyle(ButtonStyle.Danger).setEmoji('🏠')
    );
    
    if (totalPages > 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId('farm_page_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('farm_page_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
    }

    return { content: '', files: [attachment], components: [selectMenuRow, navRow] };
}

async function buildDetailView(item, userId, guildId, db, category, client) {
    let userQuantity = 0;
    let isFull = false;
    let maxCap = 0;
    let currentCap = 0;

    if (category === 'animals') {
        const [userFarmRes, cap] = await Promise.all([
            executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]})),
            getPlayerCapacity(client, userId, guildId)
        ]);
        maxCap = cap;
        for (const row of userFarmRes.rows) {
            if (String(row.animalID || row.animalid) === String(item.id)) {
                userQuantity += Number(row.quantity || row.Quantity) || 0;
            }
            const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
            if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
        }
        isFull = (currentCap + (item.size || 1)) > maxCap;
    } else {
        let invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]}));
        userQuantity = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity) : 0;
        isFull = userQuantity >= MAX_FARM_LIMIT;
    }

    const buffer = await drawFarmShopDetail(item, category, userQuantity, maxCap, currentCap);
    const attachment = new AttachmentBuilder(buffer, { name: 'farm_shop_detail.png' });

    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buy_btn_farm|${category}|${item.id}`)
            .setLabel(isFull ? 'ممتلئ / السعة لا تكفي' : 'شراء 🛒')
            .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull), 
            
        new ButtonBuilder()
            .setCustomId(`sell_btn_farm|${category}|${item.id}`)
            .setLabel(`بيع (نصف السعر) 💰`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_back_to_grid').setLabel('العودة للقائمة').setStyle(ButtonStyle.Primary).setEmoji('↩️')
    );

    return { content: '', files: [attachment], components: [actionRow1, actionRow2] };
}

async function handleShopInteraction(i, client, db, user, guild, shopState, getNavRow) {
    if (i.customId.startsWith('shop_cat_')) {
        await i.deferUpdate().catch(()=>{});
        const category = i.customId.replace('shop_cat_', '');
        shopState.currentCategory = category;
        shopState.currentPage = 0;

        let itemsList = [];
        if (category === 'animals') itemsList = farmAnimals;
        else if (category === 'seeds') itemsList = seedsData;
        else if (category === 'feed') itemsList = feedItems;
        shopState.currentItemsList = itemsList;

        let currentCap = 0, maxCap = 0;
        if (category === 'animals') {
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity(client, user.id, guild.id)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = await buildGridView(itemsList, 0, currentCap, maxCap, category);
        return await i.editReply({ files: data.files, embeds: [], components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_back_main') {
        await i.deferUpdate().catch(()=>{});
        const data = await buildMainMenu(user, client, db);
        return await i.editReply({ files: data.files, embeds: [], components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_page_prev' || i.customId === 'farm_page_next') {
        await i.deferUpdate().catch(()=>{});
        if (i.customId === 'farm_page_prev' && shopState.currentPage > 0) shopState.currentPage--;
        else if (i.customId === 'farm_page_next') shopState.currentPage++;

        let currentCap = 0, maxCap = 0;
        if (shopState.currentCategory === 'animals') {
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity(client, user.id, guild.id)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = await buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, maxCap, shopState.currentCategory);
        return await i.editReply({ files: data.files, embeds: [], components: [...data.components, getNavRow('shop')] }).catch(()=>{});
    }

    if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
        await i.deferUpdate().catch(()=>{});
        const [_, category, itemId] = i.values[0].split('|');
        
        let item = null;
        if (category === 'animals') item = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') item = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') item = feedItems.find(f => String(f.id) === String(itemId));

        if (!item) return await i.followUp({ content: '❌ العنصر غير موجود.', flags: [MessageFlags.Ephemeral] });

        shopState.currentItem = item;
        shopState.currentCategory = category;

        const data = await buildDetailView(item, user.id, guild.id, db, category, client);
        return await i.editReply({ files: data.files, embeds: [], components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_back_to_grid') {
        await i.deferUpdate().catch(()=>{});
        let currentCap = 0, maxCap = 0;
        if (shopState.currentCategory === 'animals') {
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity(client, user.id, guild.id)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = await buildGridView(shopState.currentItemsList, shopState.currentPage || 0, currentCap, maxCap, shopState.currentCategory);
        return await i.editReply({ files: data.files, embeds: [], components: [...data.components, getNavRow('shop')] }).catch(()=>{});
    }

    if (i.isButton() && (i.customId.startsWith('buy_btn_farm|') || i.customId.startsWith('sell_btn_farm|'))) {
        const action = i.customId.startsWith('buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        
        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.reply({ content: '❌ العنصر غير موجود!', flags: [MessageFlags.Ephemeral] });

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

async function handleFarmShopModal(i, client, db, getNavRow) {
    if (!i.customId.startsWith('farm_buy_modal|') && !i.customId.startsWith('farm_sell_modal|')) return false;

    try {
        await i.deferReply({ flags: [MessageFlags.Ephemeral] }); 
        
        const action = i.customId.startsWith('farm_buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        const qtyStr = i.fields.getTextInputValue('quantity_input').trim();
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ يرجى إدخال كمية صحيحة.');

        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.editReply('❌ العنصر غير موجود!');

        if (action === 'buy') {
            const totalPrice = itemData.price * quantity;
            
            // 🔥 الخصم الآمن والمباشر (Atomic Update) 🔥
            // يخصم من الكاش، وإذا نقص ياخذ الباقي من البنك، وإذا الاثنين ما يكفون يرفض!
            const checkFundsSql = `
                UPDATE levels 
                SET mora = GREATEST(0, mora - $1),
                    bank = CASE WHEN mora < $1 THEN bank - ($1 - mora) ELSE bank END
                WHERE "user" = $2 AND "guild" = $3 
                AND (mora + bank) >= $1
                RETURNING mora, bank;
            `;
            let fundRes;
            try { fundRes = await executeDB(db, checkFundsSql, [totalPrice, i.user.id, i.guild.id]); }
            catch(e) { 
                const fallbackSql = `UPDATE levels SET mora = GREATEST(0, mora - $1), bank = CASE WHEN mora < $1 THEN bank - ($1 - mora) ELSE bank END WHERE userid = $2 AND guildid = $3 AND (mora + bank) >= $1 RETURNING mora, bank;`;
                fundRes = await executeDB(db, fallbackSql, [totalPrice, i.user.id, i.guild.id]).catch(()=>({rows:[]})); 
            }

            if (!fundRes?.rows?.length) {
                return await i.editReply(`❌ رصيدك (الكاش + البنك) غير كافي! تحتاج إجمالي **${totalPrice.toLocaleString()}** ${EMOJI_MORA}.`);
            }

            // فحص المساحات بعد التأكد من الدفع
            if (category === 'animals') {
                const [farmRes, cap] = await Promise.all([
                    executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})),
                    getPlayerCapacity(client, i.user.id, i.guild.id)
                ]);
                let currentCap = 0;
                for (const row of farmRes.rows) {
                    const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
                }
                const spaceNeeded = quantity * (itemData.size || 1);

                if (currentCap + spaceNeeded > cap) {
                    // نرجع الفلوس لأنه ما يقدر يشيلهم
                    await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]).catch(()=>{});
                    return await i.editReply(`🚫 **مساحة الحظيرة لا تكفي!**\nتحتاج \`${spaceNeeded}\` مساحة، والمتاح لديك \`${cap - currentCap}\` فقط.`);
                }

                // الحفظ (UPSERT)
                const upsertSql = `INSERT INTO user_farm ("guildID", "userID", "animalID", "purchaseTimestamp", "lastCollected", "quantity", "lastFedTimestamp") VALUES ($1, $2, $3, $4, 0, $5, $4) ON CONFLICT ("guildID", "userID", "animalID") DO UPDATE SET "quantity" = user_farm."quantity" + $5`;
                try { await executeDB(db, upsertSql, [i.guild.id, i.user.id, itemData.id, Date.now(), quantity]); }
                catch(e) { await executeDB(db, `INSERT INTO user_farm (guildid, userid, animalid, purchasetimestamp, lastcollected, quantity, lastfedtimestamp) VALUES ($1, $2, $3, $4, 0, $5, $4) ON CONFLICT (guildid, userid, animalid) DO UPDATE SET quantity = user_farm.quantity + $5`, [i.guild.id, i.user.id, itemData.id, Date.now(), quantity]).catch(()=>{}); }

            } else {
                let invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
                
                if (currQty + quantity > MAX_FARM_LIMIT) {
                    await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]).catch(()=>{});
                    return await i.editReply(`🚫 **مخزنك ممتلئ!** الحد الأقصى هو **${MAX_FARM_LIMIT}**.`);
                }

                const upsertInvSql = `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("guildID", "userID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`;
                try { await executeDB(db, upsertInvSql, [i.guild.id, i.user.id, itemData.id, quantity]); }
                catch(e) { await executeDB(db, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (guildid, userid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [i.guild.id, i.user.id, itemData.id, quantity]).catch(()=>{}); }
            }

            await i.editReply(`✅ اشتريت **${quantity.toLocaleString()}x ${itemData.name}** بنجاح!\nالتكلفة: ${totalPrice.toLocaleString()} ${EMOJI_MORA}`);

        } else if (action === 'sell') {
            const sellPrice = Math.floor(itemData.price * 0.5); 
            const totalGain = sellPrice * quantity;

            if (category === 'animals') {
                const farmRes = await executeDB(db, `SELECT "id", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                let totalOwned = 0;
                farmRes.rows.forEach(row => totalOwned += Number(row.quantity));
                
                if (totalOwned < quantity) return await i.editReply(`❌ لا تملك هذه الكمية للبيع! (تمتلك ${totalOwned})`);

                let remainingToSell = quantity;
                for (const row of farmRes.rows) {
                    if (remainingToSell <= 0) break;
                    const qtyInRow = Number(row.quantity);
                    const sellFromRow = Math.min(qtyInRow, remainingToSell);
                    remainingToSell -= sellFromRow;

                    if (qtyInRow === sellFromRow) {
                        await executeDB(db, `DELETE FROM user_farm WHERE "id" = $1`, [row.id]).catch(()=>{});
                    } else {
                        await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromRow, row.id]).catch(()=>{});
                    }
                }
            } else {
                let invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
                
                if (currQty < quantity) return await i.editReply(`❌ لا تملك هذه الكمية للبيع!`);

                if (currQty === quantity) {
                    await executeDB(db, `DELETE FROM user_inventory WHERE "id" = $1`, [invCheckRes.rows[0].id]).catch(()=>{});
                } else {
                    await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, invCheckRes.rows[0].id]).catch(()=>{});
                }
            }

            // إضافة الفلوس
            await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id]).catch(()=> executeDB(db, `UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalGain, i.user.id, i.guild.id]).catch(()=>{}));
            await i.editReply(`📈 بعت **${quantity.toLocaleString()}x ${itemData.name}** بنجاح!\nالربح: ${totalGain.toLocaleString()} ${EMOJI_MORA}`);
        }

        // 🌟 تحديث واجهة التفاصيل لتعكس المخزون الجديد بعد الشراء/البيع
        if (i.message) {
            buildDetailView(itemData, i.user.id, i.guild.id, db, category, client).then(newData => {
                const finalComponents = newData.components;
                if (getNavRow) finalComponents.push(getNavRow('shop'));
                i.message.edit({ files: newData.files, components: finalComponents, embeds: [] }).catch(()=>{});
            });
        }
        return true;

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
