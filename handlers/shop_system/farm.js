// handlers/shop_system/farm.js

const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const path = require('path');

// ✅ استيراد ملفات JSON بشكل آمن باستخدام path
const farmAnimals = require('../../json/farm-animals.json');

// ✅ استيراد الأدوات المساعدة (تأكد من وجود EMOJI_MORA في ملف utils أو constants)
// إذا لم يكن موجوداً في utils، نستخدم قيمة افتراضية لتجنب الخطأ
let EMOJI_MORA = '🪙'; 
try {
    const utils = require('./utils');
    if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
    else {
        // محاولة بديلة من ملف constants العام إذا لم يوجد في utils المحلي
        const constants = require('../dungeon/constants');
        if (constants.EMOJI_MORA) EMOJI_MORA = constants.EMOJI_MORA;
    }
} catch (e) {
    // تجاهل الخطأ واستخدام الايموجي الافتراضي
}

// ✅ استدعاء دوال الحساب الدقيقة للسعة
const { getPlayerCapacity, getUsedCapacity } = require('../../utils/farmUtils.js');

const DAY_MS = 24 * 60 * 60 * 1000;

async function _handleFarmTransaction(i, client, sql, isBuy) {
    // نستخدم deferReply لأن العمليات قد تستغرق وقتاً
    if (!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); 
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ الكمية غير صالحة. يجب أن تكون رقماً صحيحاً موجباً.' });
        }
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        // تحويل للسترينج للمطابقة الآمنة
        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
        
        if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود في القائمة.' });

        // جلب بيانات اللاعب
        let userData = client.getLevel.get(i.user.id, i.guild.id); 
        if (!userData) {
            userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
            client.setLevel.run(userData); // حفظ مبدئي
        }
        let userMora = userData.mora || 0; 
        const userBank = userData.bank || 0;

        // ============================================================
        // 🟢 عملية الشراء (Buy)
        // ============================================================
        if (isBuy) {
            const maxCapacity = getPlayerCapacity(client, i.user.id, i.guild.id);
            const currentUsed = getUsedCapacity(sql, i.user.id, i.guild.id); // حساب دقيق من الداتابيس
            const itemSize = animal.size || 1;
            const requiredSpace = itemSize * quantity;
            const finalSize = currentUsed + requiredSpace;

            // 🛑 الحماية من تجاوز السعة
            if (finalSize > maxCapacity) {
                const freeSpace = Math.max(0, maxCapacity - currentUsed);
                const maxCanBuy = Math.floor(freeSpace / itemSize);
                
                const fullEmbed = new EmbedBuilder()
                    .setTitle('❖ المزرعـة ممتلـئـة ..')
                    .setColor("Random")
                    .setDescription(
                        `لا توجد مساحة كافية بمزرعتك لاتمام هذا الاجراء\n\n` +
                        `✶ 🏠 سعـة مزرعتـك القصـوى: \`${maxCapacity}\`\n` +
                        `✶ 📦 السعـة المستعملة الان: \`${currentUsed}\`\n` +
                        `✶ 📉 المساحـة الفارغـة: \`${freeSpace}\`\n\n` +
                        `✶ 💡 يمكنـك شراء \`${Math.max(0, maxCanBuy)}\` كحد اقصى`
                    )
                    .setImage('https://i.postimg.cc/6q88BF6B/ffarm.png');

                return await i.editReply({ content: '', embeds: [fullEmbed] });
            }

            const totalCost = Math.floor(animal.price * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                return await i.editReply({ content: msg });
            }

            // خصم المبلغ
            userData.mora -= totalCost;
            const now = Date.now();
            
            // تنفيذ الشراء وتسجيل الحيوانات
            const transaction = sql.transaction(() => {
                // نستخدم INSERT لإضافة صف جديد لكل عملية شراء، مما يحفظ تاريخ الشراء الدقيق لهذا الفوج
                sql.prepare(`
                    INSERT INTO user_farm (guildID, userID, animalID, quantity, purchaseTimestamp, lastCollected, lastFedTimestamp) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(i.guild.id, i.user.id, animal.id, quantity, now, now, now);

                // تحديث إحصائيات الشراء وتحديث الرصيد
                userData.shop_purchases = (userData.shop_purchases || 0) + 1;
                client.setLevel.run(userData);
            });
            transaction();

            const embed = new EmbedBuilder()
                .setTitle('✅ تم الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 تم إضافة **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n📊 السعة: \`[ ${finalSize} / ${maxCapacity} ]\``)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            return await i.editReply({ embeds: [embed] });

        } 
        // ============================================================
        // 🔴 عملية البيع (Sell) - مع نظام الإهلاك
        // ============================================================
        else {
            // التحقق من الملكية الإجمالية أولاً
            const totalQtyRow = sql.prepare("SELECT SUM(quantity) as totalQty FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id);
            const ownedQuantity = totalQtyRow ? (totalQtyRow.totalQty || 0) : 0;

            if (ownedQuantity < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية (لديك: **${ownedQuantity}**).` });
            }
            
            const sellTransaction = sql.transaction(() => {
                // جلب الصفوف مرتبة حسب الأقدمية (نبيع القديم أولاً)
                const rows = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? ORDER BY purchaseTimestamp ASC").all(i.user.id, i.guild.id, animal.id);
                
                let remainingToSell = quantity;
                let totalRefund = 0;
                let soldCount = 0;
                let unsellableCount = 0;
                const now = Date.now();

                // فترة حظر البيع: آخر 20% من عمر الحيوان
                const lifespanMs = animal.lifespan_days * DAY_MS;
                const noSellMs = Math.ceil(animal.lifespan_days * 0.2) * DAY_MS;

                for (const row of rows) {
                    if (remainingToSell <= 0) break;
                    
                    const purchaseTime = row.purchaseTimestamp || now;
                    const ageMs = now - purchaseTime;
                    const remainingLifeMs = lifespanMs - ageMs;

                    // 🛑 شرط الحظر: إذا اقترب الموت (أقل من 20% من العمر متبقي)
                    if (remainingLifeMs <= noSellMs) {
                        unsellableCount += row.quantity;
                        continue; // نتخطى هذا الصف لأنه "عجوز"
                    }

                    // 📉 حساب السعر (الإهلاك)
                    let currentValRatio = (remainingLifeMs / lifespanMs);
                    if (currentValRatio > 1) currentValRatio = 1;
                    if (currentValRatio < 0) currentValRatio = 0;

                    // السعر = السعر الأصلي * 70% * نسبة العمر المتبقي
                    const refundPricePerUnit = Math.floor(animal.price * 0.70 * currentValRatio);

                    const sellFromThisRow = Math.min(row.quantity, remainingToSell);
                    
                    totalRefund += (refundPricePerUnit * sellFromThisRow);
                    remainingToSell -= sellFromThisRow;
                    soldCount += sellFromThisRow;

                    // تحديث الداتابيس
                    if (row.quantity === sellFromThisRow) {
                        sql.prepare("DELETE FROM user_farm WHERE id = ?").run(row.id);
                    } else {
                        sql.prepare("UPDATE user_farm SET quantity = quantity - ? WHERE id = ?").run(sellFromThisRow, row.id);
                    }
                }

                if (soldCount === 0) {
                    return { success: false, msg: `🚫 **فشلت العملية!**\nحيواناتك كبيرة في السن (باقي لها أقل من ${Math.ceil(animal.lifespan_days * 0.2)} يوم) ولا يمكن بيعها.` };
                }

                userData.mora += totalRefund;
                client.setLevel.run(userData);
                
                return { 
                    success: true, 
                    soldCount, 
                    totalRefund, 
                    remainingToSell // الكمية التي طلب بيعها ولم يتمكن بسبب العمر
                };
            });

            const result = sellTransaction();

            if (!result.success) {
                return await i.editReply({ content: result.msg });
            }

            let desc = `📦 بعت **${result.soldCount}** × ${animal.name}\n💰 حصلت على: **${result.totalRefund.toLocaleString()}** ${EMOJI_MORA}`;
            if (result.remainingToSell > 0) {
                desc += `\n⚠️ لم يتم بيع **${result.remainingToSell}** لأنها كبيرة في السن.`;
            } else {
                desc += `\n📉 (تم خصم قيمة الاستهلاك بناءً على عمر الحيوان)`;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تم البيع بنجاح')
                .setColor(Colors.Green)
                .setDescription(desc)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

             return await i.editReply({ embeds: [embed] });
        }

    } catch (e) { 
        console.error("[Farm Transaction Error]", e); 
        await i.editReply("❌ حدث خطأ داخلي أثناء معالجة الطلب."); 
    }
}

module.exports = { _handleFarmTransaction };
