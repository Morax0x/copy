const { EmbedBuilder, Colors } = require("discord.js");
const { EMOJI_MORA, sendShopLog } = require('./utils');

// دالة حساب الانزلاق السعري (مطلوبة هنا)
function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice;
    if (isBuy) { avgPrice = basePrice * (1 + (impact / 2)); } 
    else { avgPrice = basePrice * (1 - (impact / 2)); }
    return Math.max(Math.floor(avgPrice), 1);
}

// دالة تحديث أسعار السوق
function updateMarketPrices() {
    const sql = require('better-sqlite3')('./mainDB.sqlite');
    if (!sql.open) return;
    try {
        const allItems = sql.prepare("SELECT * FROM market_items").all();
        if (allItems.length === 0) return;
        const updateStmt = sql.prepare(`UPDATE market_items SET currentPrice = ?, lastChangePercent = ?, lastChange = ? WHERE id = ?`);
        const SATURATION_POINT = 2000; const MIN_PRICE = 10; const MAX_PRICE = 50000;            
        const transaction = sql.transaction(() => {
            for (const item of allItems) {
                const result = sql.prepare("SELECT SUM(quantity) as total FROM user_portfolio WHERE itemID = ?").get(item.id);
                const totalOwned = result.total || 0;
                let randomPercent = (Math.random() * 0.20) - 0.10;
                const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;
                if (item.currentPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
                if (finalChangePercent < -0.30) finalChangePercent = -0.30;
                const oldPrice = item.currentPrice;
                let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));
                if (newPrice < MIN_PRICE) newPrice = MIN_PRICE;
                if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
                const changeAmount = newPrice - oldPrice;
                const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
                updateStmt.run(newPrice, displayPercent, changeAmount, item.id);
            }
        });
        transaction();
        console.log(`[Market] Prices updated.`);
    } catch (err) { console.error("[Market] Error updating prices:", err.message); }
}

// دالة معالجة عمليات البيع والشراء
async function _handleMarketTransaction(i, client, sql, isBuy) {
    // 🔥 جعل الرد ظاهراً للجميع (False = Visible) 🔥
    await i.deferReply({ ephemeral: false }); 
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) return await i.editReply({ content: '❌ كمية غير صالحة.' });

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        // فحص القفل للسوق
        if (isBuy && client.marketLocks && client.marketLocks.has(assetId)) {
            return await i.editReply({ content: `🚫 **السهم في حالة انهيار وإعادة هيكلة!**\nيرجى الانتظار قليلاً حتى يتم طرحه بالسعر الجديد.` });
        }

        const item = sql.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);
        if (!item) return await i.editReply({ content: '❌ الأصل غير موجود.' });

        let userData = client.getLevel.get(i.user.id, i.guild.id); 
        if (!userData) userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        let userMora = userData.mora || 0; 
        const userBank = userData.bank || 0;

        const getPortfolio = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?");
        
        if (isBuy) {
            const avgPrice = calculateSlippage(item.currentPrice, quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي!`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                if (totalCost > (item.currentPrice * quantity)) msg += `\n⚠️ السعر ارتفع بسبب الانزلاق السعري (الكمية الكبيرة). التكلفة الحالية: **${totalCost.toLocaleString()}**`;
                return await i.editReply({ content: msg });
            }
            userData.mora -= totalCost; 
            userData.shop_purchases = (userData.shop_purchases || 0) + 1;
            client.setLevel.run(userData);
            
            // تحديث المحفظة (Portfolio)
            let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            if (pfItem) sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(quantity, pfItem.id);
            else sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)").run(i.guild.id, i.user.id, item.id, quantity);
            
            const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        } else {
            // بيع الأسهم
            let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            const userQty = pfItem ? pfItem.quantity : 0;
            if (userQty < quantity) return await i.editReply({ content: `❌ لا تملك الكمية.` });
            
            const avgPrice = calculateSlippage(item.currentPrice, quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            userData.mora += totalGain;
            client.setLevel.run(userData);
            
            if (userQty - quantity > 0) sql.prepare("UPDATE user_portfolio SET quantity = ? WHERE id = ?").run(userQty - quantity, pfItem.id);
            else sql.prepare("DELETE FROM user_portfolio WHERE id = ?").run(pfItem.id);
            
            const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        }
    } catch (e) { console.error(e); await i.editReply("❌ حدث خطأ."); }
}

module.exports = { updateMarketPrices, _handleMarketTransaction };
