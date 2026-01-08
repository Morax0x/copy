const { EmbedBuilder, Colors } = require("discord.js");
// تأكد من المسار الصحيح لملف utils (قد يحتاج ../../ إذا كان في مجلد shop_system)
const { EMOJI_MORA } = require('../shop_system/utils.js'); 

// ------------------------------------------------------------------
// 🛠️ دوال مساعدة خاصة بنظام السوق
// ------------------------------------------------------------------

/**
 * دالة لحساب السعر مع "الانزلاق السعري" (Slippage)
 * كلما زادت الكمية، زاد السعر عند الشراء أو قل عند البيع
 */
function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice;
    
    if (isBuy) {
        // عند الشراء: السعر يزيد
        avgPrice = basePrice * (1 + (impact / 2));
    } else {
        // عند البيع: السعر يقل
        avgPrice = basePrice * (1 - (impact / 2));
    }
    
    return Math.max(Math.floor(avgPrice), 1);
}

// ------------------------------------------------------------------
// 🔄 دالة التحديث الدوري للأسعار (Market Update Logic)
// ------------------------------------------------------------------
function updateMarketPrices() {
    // ⚠️ ملاحظة: تأكد من مسار الداتابيس الصحيح بالنسبة لمكان هذا الملف
    // بما أن الملف في handlers/shop_system/، والداتابيس في الجذر، نستخدم ../../
    const sql = require('better-sqlite3')('../../mainDB.sqlite'); 
    
    if (!sql.open) return;
    
    try {
        const allItems = sql.prepare("SELECT * FROM market_items").all();
        if (allItems.length === 0) return;
        
        const updateStmt = sql.prepare(`UPDATE market_items SET currentPrice = ?, lastChangePercent = ?, lastChange = ? WHERE id = ?`);
        
        const SATURATION_POINT = 2000; 
        const MIN_PRICE = 10; 
        const MAX_PRICE = 50000;            
        
        const transaction = sql.transaction(() => {
            for (const item of allItems) {
                // حساب عدد الأسهم المملوكة من اللاعبين
                const result = sql.prepare("SELECT SUM(quantity) as total FROM user_portfolio WHERE itemID = ?").get(item.id);
                const totalOwned = result.total || 0;
                
                // معادلة التغيير العشوائي
                let randomPercent = (Math.random() * 0.20) - 0.10; // من -10% إلى +10%
                
                // عقوبة التشبع: كلما زاد عدد الأسهم المملوكة، قل احتمال الارتفاع
                const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;
                
                // كبح جماح الأسهم الغالية
                if (item.currentPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
                
                // الحد الأقصى للخسارة في جولة واحدة (-30%)
                if (finalChangePercent < -0.30) finalChangePercent = -0.30;
                
                const oldPrice = item.currentPrice;
                let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));
                
                // الحدود السعرية
                if (newPrice < MIN_PRICE) newPrice = MIN_PRICE;
                if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
                
                const changeAmount = newPrice - oldPrice;
                const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
                
                updateStmt.run(newPrice, displayPercent, changeAmount, item.id);
            }
        });
        
        transaction();
        console.log(`[Market System] Prices updated successfully.`);
        
    } catch (err) { 
        console.error("[Market System] Error updating prices:", err.message); 
    }
}

// ------------------------------------------------------------------
// 🛒 معالج عمليات الشراء والبيع (Transaction Handler)
// ------------------------------------------------------------------
async function _handleMarketTransaction(i, client, sql, isBuy) {
    await i.deferReply({ ephemeral: false }); 
    
    try {
        // 1. استلام وتدقيق الكمية
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ كمية غير صالحة. يرجى إدخال رقم صحيح.' });
        }

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        // 2. التحقق من القفل (Market Crash Lock)
        if (isBuy && client.marketLocks && client.marketLocks.has(assetId)) {
            return await i.editReply({ content: `🚫 **السهم في حالة انهيار وإعادة هيكلة!**\nيرجى الانتظار قليلاً حتى يتم طرحه بالسعر الجديد.` });
        }

        // 3. التحقق من وجود الأصل
        const item = sql.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);
        if (!item) return await i.editReply({ content: '❌ الأصل (السهم) غير موجود في النظام.' });

        // 4. تجهيز بيانات اللاعب
        let userData = client.getLevel.get(i.user.id, i.guild.id); 
        if (!userData) userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        let userMora = userData.mora || 0; 
        const userBank = userData.bank || 0;

        const getPortfolio = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?");
        
        // ==========================================================
        // 🟢 عملية الشراء (BUY)
        // ==========================================================
        if (isBuy) {
            const avgPrice = calculateSlippage(item.currentPrice, quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            
            // التحقق من الرصيد
            if (userMora < totalCost) {
                let msg = `❌ **رصيدك غير كافي!**`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، يمكنك السحب منه.`;
                
                // تنبيه الانزلاق السعري
                if (totalCost > (item.currentPrice * quantity)) {
                    msg += `\n⚠️ **تنبيه:** السعر ارتفع قليلاً بسبب الانزلاق السعري للكميات الكبيرة.\nالتكلفة الحالية: **${totalCost.toLocaleString()}**`;
                }
                return await i.editReply({ content: msg });
            }
            
            // الخصم والتسجيل
            userData.mora -= totalCost; 
            userData.shop_purchases = (userData.shop_purchases || 0) + 1;
            client.setLevel.run(userData);
            
            // تحديث المحفظة (Portfolio Upsert)
            let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            if (pfItem) {
                sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(quantity, pfItem.id);
            } else {
                sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)").run(i.guild.id, i.user.id, item.id, quantity);
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 اشتريت: **${quantity}** سهم من **${item.name}**\n💵 التكلفة الإجمالية: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n📊 متوسط السعر: **${avgPrice.toLocaleString()}**`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            
            await i.editReply({ embeds: [embed] });

        } 
        // ==========================================================
        // 🔴 عملية البيع (SELL)
        // ==========================================================
        else {
            let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            const userQty = pfItem ? pfItem.quantity : 0;
            
            if (userQty < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية للبيع (لديك: **${userQty}**).` });
            }
            
            const avgPrice = calculateSlippage(item.currentPrice, quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            
            userData.mora += totalGain;
            client.setLevel.run(userData);
            
            // تحديث المحفظة (إنقاص أو حذف)
            if (userQty - quantity > 0) {
                sql.prepare("UPDATE user_portfolio SET quantity = ? WHERE id = ?").run(userQty - quantity, pfItem.id);
            } else {
                sql.prepare("DELETE FROM user_portfolio WHERE id = ?").run(pfItem.id);
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية البيع بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 بعت: **${quantity}** سهم من **${item.name}**\n💵 الربح الإجمالي: **${totalGain.toLocaleString()}** ${EMOJI_MORA}\n📊 متوسط السعر: **${avgPrice.toLocaleString()}**`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            
            await i.editReply({ embeds: [embed] });
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
