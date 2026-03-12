const { EmbedBuilder, Colors } = require("discord.js");
const marketItemsConfig = require('../../json/market-items.json');

let EMOJI_MORA = '🪙'; 
try {
    const utils = require('./utils');
    if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
    else {
        const constants = require('../dungeon/constants');
        if (constants.EMOJI_MORA) EMOJI_MORA = constants.EMOJI_MORA;
    }
} catch (e) {}

const MARKET_VOLATILITY = 0.05; 

function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice;
    
    if (isBuy) {
        avgPrice = basePrice * (1 + (impact / 2));
    } else {
        avgPrice = basePrice * (1 - (impact / 2));
    }
    
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
        
        try {
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
            console.log(`[Market System] Prices updated successfully.`);
        } catch (txErr) {
            console.error("Market Price Update Error:", txErr);
        }
        
    } catch (err) { 
        console.error("[Market System] Error updating prices:", err.message); 
    }
}

async function _handleMarketTransaction(i, client, db, isBuy) {
    await i.deferReply(); 
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ كمية غير صالحة. يرجى إدخال رقم صحيح.' });
        }

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        if (isBuy && client.marketLocks && client.marketLocks.has(assetId)) {
            return await i.editReply({ content: `🚫 **السهم في حالة انهيار وإعادة هيكلة!**\nيرجى الانتظار قليلاً حتى يتم طرحه بالسعر الجديد.` });
        }

        const itemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]);
        const item = itemRes.rows[0];
        if (!item) return await i.editReply({ content: '❌ الأصل (السهم) غير موجود في النظام.' });

        // 🔥 الاعتماد الكامل على الكاش لمنع تضارب البيانات ورجوع الرصيد
        let userData = await client.getLevel(i.user.id, i.guild.id);
        if (!userData) {
            userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        }

        let userMora = Number(userData.mora) || 0; 
        const userBank = Number(userData.bank) || 0;

        const pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, item.id]);
        let pfItem = pfItemRes.rows[0];
        
        if (isBuy) {
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            
            if (userMora < totalCost) {
                let msg = `❌ **رصيدك غير كافي!** تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، يمكنك السحب منه.`;
                
                if (totalCost > (Number(item.currentPrice || item.currentprice) * quantity)) {
                    msg += `\n⚠️ **تنبيه:** السعر ارتفع قليلاً بسبب الانزلاق السعري للكميات الكبيرة.\nالتكلفة الحالية: **${totalCost.toLocaleString()}**`;
                }
                return await i.editReply({ content: msg });
            }
            
            // 🔥 الخصم من الكاش مباشرةً (آمن 100%)
            userData.mora = userMora - totalCost;
            userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
            await client.setLevel(userData);
            
            if (pfItem) {
                await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, pfItem.id]);
            } else {
                await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]);
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 اشتريت: **${quantity}** سهم من **${item.name}**\n💵 التكلفة الإجمالية: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n📊 متوسط السعر: **${avgPrice.toLocaleString()}**`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            
            await i.editReply({ content: "✅ اكتملت العملية. (تم إرسال الفاتورة في الشات)" });
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });

        } else {
            const userQty = pfItem ? Number(pfItem.quantity) : 0;
            
            if (userQty < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية للبيع (لديك: **${userQty}**).` });
            }
            
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            
            if (userQty - quantity > 0) {
                await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, pfItem.id]);
            } else {
                await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [pfItem.id]);
            }

            // 🔥 إضافة الأرباح إلى الكاش مباشرةً
            userData.mora = userMora + totalGain;
            await client.setLevel(userData);
            
            const embed = new EmbedBuilder()
                .setTitle('📈 تمت عملية البيع بنجاح')
                .setColor(Colors.Blue)
                .setDescription(`📦 بعت: **${quantity}** سهم من **${item.name}**\n💰 الربح الإجمالي: **${totalGain.toLocaleString()}** ${EMOJI_MORA}\n📊 متوسط السعر: **${avgPrice.toLocaleString()}**`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            
            await i.editReply({ content: "✅ اكتملت العملية. (تم إرسال الفاتورة في الشات)" });
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });
        }

    } catch (e) { 
        console.error("[Market Transaction Error]", e); 
        await i.editReply("❌ حدث خطأ داخلي أثناء معالجة العملية."); 
    }
}

module.exports = { 
    _handleMarketTransaction, 
    updateMarketPrices,
    calculateSlippage 
};
