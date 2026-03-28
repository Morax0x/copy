const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags 
} = require('discord.js');

const farmAnimals = require('../json/farm-animals.json');
const feedItems = require('../json/feed-items.json');
const seeds = require('../json/seeds.json');

let getPlayerCapacity;
try { ({ getPlayerCapacity } = require('../utils/farmUtils.js')); } 
catch(e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MAX_INVENTORY_LIMIT = 9999;

async function executeDB(db, primaryQuery, fallbackQuery, params = []) {
    try {
        return await db.query(primaryQuery, params);
    } catch (e1) {
        if (!fallbackQuery) throw e1;
        try {
            return await db.query(fallbackQuery, params);
        } catch (e2) {
            throw e1; 
        }
    }
}

function buildMainMenu(user) {
    const embed = new EmbedBuilder()
        .setTitle('🛒 مـتـجـر الـمـزرعـة')
        .setDescription('مرحباً بك في متجر المزرعة! اختر القسم الذي تود تصفحه من القائمة بالأسفل:')
        .setColor('#2ECC71')
        .setImage('https://i.postimg.cc/qB6RDR0f/1000166519.gif');

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_cat_select')
            .setPlaceholder('اختر القسم...')
            .addOptions([
                { label: 'الـحـيـوانـات', value: 'animals', emoji: '🐄', description: 'شراء حيوانات لإنتاج الموارد' },
                { label: 'الـبـذور', value: 'seeds', emoji: '🌱', description: 'شراء بذور للزراعة في أرضك' },
                { label: 'الأعـلاف', value: 'feed', emoji: '🌾', description: 'شراء طعام لإشباع حيواناتك' }
            ])
    );

    return { embeds: [embed], components: [row] };
}

async function handleShopInteraction(i, client, db, user, guild, shopState, getNavRow) {
    if (i.customId === 'shop_cat_select') {
        const category = i.values[0];
        shopState.currentCategory = category;

        let options = [];
        let embedTitle = '';
        let embedColor = '';

        if (category === 'animals') {
            embedTitle = '🐄 قـسـم الـحـيـوانـات';
            embedColor = '#E67E22';
            options = farmAnimals.map(a => ({
                label: a.name,
                description: `السعر: ${a.price} | الحجم: ${a.size} | الدخل: ${a.income_per_day}/يوم`,
                value: `animal|${a.id}`,
                emoji: a.emoji
            }));
        } else if (category === 'seeds') {
            embedTitle = '🌱 قـسـم الـبـذور';
            embedColor = '#27AE60';
            options = seeds.map(s => ({
                label: s.name,
                description: `السعر: ${s.price} | للبيع بـ: ${s.sell_price} | نمو: ${s.growth_time_hours}س`,
                value: `seed|${s.id}`,
                emoji: s.emoji
            }));
        } else if (category === 'feed') {
            embedTitle = '🌾 قـسـم الأعـلاف';
            embedColor = '#F1C40F';
            options = feedItems.map(f => ({
                label: f.name,
                description: `السعر: ${f.price} مورا`,
                value: `feed|${f.id}`,
                emoji: f.emoji
            }));
        }

        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription('اختر العنصر الذي تود شراءه من القائمة السفلية:')
            .setColor(embedColor)
            .setImage('https://i.postimg.cc/qB6RDR0f/1000166519.gif');

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('farm_select_item')
                .setPlaceholder('🛒 اختر العنصر...')
                .addOptions(options.slice(0, 25))
        );

        await i.deferUpdate();
        return await i.editReply({ embeds: [embed], components: [row, getNavRow('shop')] });
    }

    if (i.customId === 'farm_select_item') {
        const [type, itemId] = i.values[0].split('|');
        let item;
        let desc = '';

        if (type === 'animal') {
            item = farmAnimals.find(a => String(a.id) === String(itemId));
            desc = `**الدخل اليومي:** ${item.income_per_day} مورا\n**الحجم في الحظيرة:** ${item.size}\n**مدة الحياة:** ${item.lifespan_days} يوم`;
        } else if (type === 'seed') {
            item = seeds.find(s => String(s.id) === String(itemId));
            desc = `**وقت النمو:** ${item.growth_time_hours} ساعة\n**وقت الذبول:** ${item.wither_time_hours} ساعة\n**سعر البيع بعد الحصاد:** ${item.sell_price} مورا\n**نقاط الخبرة:** +${item.xp_reward} XP`;
        } else if (type === 'feed') {
            item = feedItems.find(f => String(f.id) === String(itemId));
            desc = `**الوصف:** ${item.description}`;
        }

        if (!item) return;

        const embed = new EmbedBuilder()
            .setTitle(`${item.emoji} ${item.name}`)
            .setDescription(desc)
            .addFields({ name: 'السعر', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true })
            .setColor(Colors.Gold);

        if (item.image) embed.setThumbnail(item.image);

        const buyBtn = new ButtonBuilder()
            .setCustomId(`buy_btn_farm|${type}|${item.id}`)
            .setLabel('شراء')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛒');

        const row = new ActionRowBuilder().addComponents(buyBtn);

        return await i.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    if (i.isButton() && i.customId.startsWith('buy_btn_farm|')) {
        const [_, type, itemId] = i.customId.split('|');
        let itemData = null;

        if (type === 'animal') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (type === 'seed') itemData = seeds.find(s => String(s.id) === String(itemId));
        else if (type === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.reply({ content: '❌ العنصر غير موجود!', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder()
            .setCustomId(`farm_buy_modal|${type}|${itemData.id}`)
            .setTitle(`شراء ${itemData.name}`);

        const qtyInput = new TextInputBuilder()
            .setCustomId('quantity_input')
            .setLabel('الكمية المراد شراؤها:')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return await i.showModal(modal);
    }
}

async function handleFarmShopModal(i, client, db) {
    if (!i.customId.startsWith('farm_buy_modal|')) return false;

    try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });

        const [_, type, itemId] = i.customId.split('|');
        const qtyStr = i.fields.getTextInputValue('quantity_input').trim();
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) {
            return await i.editReply('❌ يرجى إدخال كمية صحيحة (أرقام فقط أكبر من 0).');
        }

        let itemData = null;
        if (type === 'animal') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (type === 'seed') itemData = seeds.find(s => String(s.id) === String(itemId));
        else if (type === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.editReply('❌ العنصر غير موجود!');

        const totalPrice = itemData.price * quantity;

        let userDataRes = await executeDB(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
        let userData = userDataRes?.rows?.[0];
        
        if (!userData || Number(userData.mora || userData.mora || 0) < totalPrice) {
            return await i.editReply(`❌ رصيدك الكاش غير كافي! تحتاج إلى **${totalPrice.toLocaleString()}** ${EMOJI_MORA} لشراء الكمية المطلوبة.`);
        }

        if (type === 'animal') {
            if (!getPlayerCapacity) return await i.editReply('❌ نظام المزرعة غير متوفر حالياً.');
            
            let currentCapacityUsed = 0;
            let userAnimalsRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, `SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
            
            for (const row of userAnimalsRes?.rows || []) {
                const aId = row.animalID || row.animalid;
                const aQty = Number(row.quantity || row.Quantity || 0);
                const aData = farmAnimals.find(a => String(a.id) === String(aId));
                if (aData) currentCapacityUsed += (aQty * (aData.size || 1));
            }

            const maxCapacity = await getPlayerCapacity(client, i.user.id, i.guild.id);
            const spaceNeeded = quantity * (itemData.size || 1);

            if (currentCapacityUsed + spaceNeeded > maxCapacity) {
                return await i.editReply(`🚫 **مساحة الحظيرة لا تكفي!**\nتحتاج إلى \`${spaceNeeded}\` مساحة، والمتاح لديك \`${maxCapacity - currentCapacityUsed}\` فقط.`);
            }

        } else {
            let invRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity || 0) : 0;
            
            if (currQty + quantity > MAX_INVENTORY_LIMIT) {
                return await i.editReply(`🚫 **مخزنك ممتلئ!**\nالحد الأقصى لتخزين هذا العنصر هو **${MAX_INVENTORY_LIMIT}**، لديك حالياً \`${currQty}\`.`);
            }
        }

        await executeDB(db, `UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [totalPrice, i.user.id, i.guild.id]);

        try {
            if (type === 'animal') {
                let existingRes = await executeDB(db, `SELECT "id" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, `SELECT id FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                if (existingRes?.rows?.[0]) {
                    const farmId = existingRes.rows[0].id || existingRes.rows[0].ID;
                    await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" + $1 WHERE "id" = $2`, `UPDATE user_farm SET quantity = quantity + $1 WHERE id = $2`, [quantity, farmId]);
                } else {
                    await executeDB(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "purchaseTimestamp", "lastCollected", "quantity", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6, $7)`, `INSERT INTO user_farm (guildid, userid, animalid, purchasetimestamp, lastcollected, quantity, lastfedtimestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [i.guild.id, i.user.id, itemData.id, Date.now(), 0, quantity, Date.now()]);
                }
            } else {
                let existingRes = await executeDB(db, `SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                if (existingRes?.rows?.[0]) {
                    const invId = existingRes.rows[0].id || existingRes.rows[0].ID;
                    await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, `UPDATE user_inventory SET quantity = quantity + $1 WHERE id = $2`, [quantity, invId]);
                } else {
                    await executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, itemData.id, quantity]);
                }
            }
        } catch (e) {
            await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalPrice, i.user.id, i.guild.id]);
            return await i.editReply(`❌ **حدث خطأ داخلي!** تم استرجاع مبلغ **${totalPrice.toLocaleString()}** مورا لحسابك.\n(الخطأ: ${e.message})`);
        }

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية الشراء بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** ${itemData.emoji} ${itemData.name}\n🔢 **الكمية:** ${quantity.toLocaleString()}\n💰 **التكلفة:** ${totalPrice.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.editReply({ content: null, embeds: [successEmbed] });
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
