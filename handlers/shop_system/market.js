const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const marketItemsConfig = require('../../json/market-items.json');

let EMOJI_MORA = '🪙'; 
try {
    const utils = require('./utils');
    if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
} catch (e) {}

const MARKET_VOLATILITY = 0.05; 

function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice = isBuy ? basePrice * (1 + (impact / 2)) : basePrice * (1 - (impact / 2));
    return Math.max(Math.floor(avgPrice), 1);
}

async function updateMarketPrices(db) {
    if (!db) return;
    try {
        const allItemsRes = await db.query(`SELECT * FROM market_items`);
        const allItems = allItemsRes.rows;
        if (allItems.length === 0) return;
        
        const SATURATION_POINT = 2000; 
        const MIN_PRICE = 10; 
        const MAX_PRICE = 50000;             
        
        for (const item of allItems) {
            const resultRes = await db.query(`SELECT SUM("quantity") as total FROM user_portfolio WHERE "itemID" = $1`, [item.id]);
            const totalOwned = Number(resultRes.rows[0].total) || 0;
            
            let randomPercent = (Math.random() * 0.20) - 0.10; 
            const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
            let finalChangePercent = randomPercent - saturationPenalty;
            
            if (Number(item.currentPrice || item.currentprice) > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
            if (finalChangePercent < -0.30) finalChangePercent = -0.30;
            
            const oldPrice = Number(item.currentPrice || item.currentprice);
            let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));
            if (newPrice < MIN_PRICE) newPrice = MIN_PRICE;
            if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
            
            const changeAmount = newPrice - oldPrice;
            const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
            
            await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastChange" = $3 WHERE "id" = $4`, [newPrice, displayPercent, changeAmount, item.id]);
        }
    } catch (err) { 
        console.error("[Market System] Error updating prices:", err.message); 
    }
}

async function _handleMarketTransaction(i, client, db, isBuy) {
    await i.deferReply(); 
    console.log(`\n--- [MARKET DEBUG] بدأ ${i.user.username} عملية ${isBuy ? 'شراء' : 'بيع'} ---`);
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ كمية غير صالحة.');

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        const itemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]);
        const item = itemRes.rows[0];
        if (!item) return await i.editReply('❌ الأصل غير موجود.');

        // جلب الرصيد الحالي من الداتا بيز مباشرة للتحقق
        const dbUserRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]);
        let dbUser = dbUserRes.rows[0];
        if (!dbUser) {
            await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "level", "xp", "totalXP") VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]);
            dbUser = { mora: 0, bank: 0 };
        }
        
        let userMora = Number(dbUser.mora) || 0;
        const pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, item.id]);
        let pfItem = pfItemRes.rows[0];
        
        if (isBuy) {
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            
            console.log(`[MARKET DEBUG] التكلفة المطلوبة: ${totalCost} | رصيد اللاعب: ${userMora}`);
            
            if (userMora < totalCost) return await i.editReply(`❌ **رصيدك غير كافي!** تحتاج: **${totalCost}** 🪙`);
            
            // 🔥 التحديث الذري الآمن (يخصم ويرد القيمة الدقيقة فورا)
            const updateRes = await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalCost, i.user.id, i.guild.id]);
            const exactNewMora = updateRes.rows[0].mora;
            console.log(`[MARKET DEBUG] ✅ تم الخصم بنجاح. الرصيد الجديد في الداتابيز: ${exactNewMora}`);

            if (pfItem) await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, pfItem.id]);
            else await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]);
            
            // إجبار كاش البوت على احترام الداتابيز
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }

            const embed = new EmbedBuilder().setTitle('✅ تمت عملية الشراء').setColor(Colors.Green).setDescription(`📦 اشتريت: **${quantity}** من **${item.name}**\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`);
            await i.editReply("✅ تم تحديث الرصيد وإرسال الفاتورة.");
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });

        } else {
            const userQty = pfItem ? Number(pfItem.quantity) : 0;
            if (userQty < quantity) return await i.editReply(`❌ لا تملك هذه الكمية (لديك: **${userQty}**).`);
            
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            
            if (userQty - quantity > 0) await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, pfItem.id]);
            else await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [pfItem.id]);

            // 🔥 التحديث الذري الآمن للبيع
            const updateRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalGain, i.user.id, i.guild.id]);
            const exactNewMora = updateRes.rows[0].mora;
            console.log(`[MARKET DEBUG] ✅ تم البيع وإضافة الأرباح. الرصيد الجديد: ${exactNewMora}`);

            // إجبار الكاش
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }
            
            const embed = new EmbedBuilder().setTitle('📈 تمت عملية البيع').setColor(Colors.Blue).setDescription(`📦 بعت: **${quantity}** من **${item.name}**\n💰 الأرباح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`);
            await i.editReply("✅ تم البيع بنجاح.");
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });
        }

    } catch (e) { 
        console.error("[MARKET FATAL ERROR]:", e); 
        await i.editReply("❌ تعطلت قاعدة البيانات أثناء معالجة الطلب."); 
    }
}

module.exports = { _handleMarketTransaction, updateMarketPrices, calculateSlippage };
