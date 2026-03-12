const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const path = require('path');
const farmAnimals = require('../../json/farm-animals.json');
const { getPlayerCapacity, getUsedCapacity } = require('../../utils/farmUtils.js');

let EMOJI_MORA = '🪙'; 
try {
    const utils = require('./utils');
    if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
    else {
        const constants = require('../dungeon/constants');
        if (constants.EMOJI_MORA) EMOJI_MORA = constants.EMOJI_MORA;
    }
} catch (e) {
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function _handleFarmTransaction(i, client, db, isBuy) {
    if (!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); 
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ الكمية غير صالحة. يجب أن تكون رقماً صحيحاً موجباً.' });
        }
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
        
        if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود في القائمة.' });

        let userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]);
        let userDataDb = userDataRes.rows[0];

        if (!userDataDb) {
            await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "xp", "level", "totalXP") VALUES ($1, $2, 0, 0, 0, 1, 0)`, [i.user.id, i.guild.id]);
            userDataDb = { mora: 0, bank: 0 };
        }

        let userMora = Number(userDataDb.mora) || 0; 
        const userBank = Number(userDataDb.bank) || 0;

        if (isBuy) {
            const maxCapacity = await getPlayerCapacity(client, i.user.id, i.guild.id);
            const currentUsed = await getUsedCapacity(db, i.user.id, i.guild.id); 
            const itemSize = animal.size || 1;
            const requiredSpace = itemSize * quantity;
            const finalSize = currentUsed + requiredSpace;

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

            const now = Date.now();
            
            try {
                // 🔥 الخصم المباشر من قاعدة البيانات بقيمة سالبة
                await db.query(`UPDATE levels SET "mora" = "mora" - $1, "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, i.user.id, i.guild.id]);
                
                await db.query(`
                    INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastCollected", "lastFedTimestamp") 
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [i.guild.id, i.user.id, animal.id, quantity, now, now, now]);

                // تحديث الكاش لمنع التجاوز
                if (client.getLevel && client.setLevel) {
                    let cacheData = await client.getLevel(i.user.id, i.guild.id);
                    if (cacheData) {
                        cacheData.mora = Number(cacheData.mora) - totalCost;
                        await client.setLevel(cacheData);
                    }
                }
            } catch (txErr) {
                console.error("Farm Buy Error:", txErr);
                return await i.editReply({ content: '❌ حدث خطأ أثناء الحفظ في قاعدة البيانات.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تم الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 تم إضافة **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n📊 السعة: \`[ ${finalSize} / ${maxCapacity} ]\``)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            return await i.editReply({ embeds: [embed] });

        } 
        else {
            const totalQtyRowRes = await db.query(`SELECT SUM("quantity") as totalqty FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, animal.id]);
            const totalQtyRow = totalQtyRowRes.rows[0];
            const ownedQuantity = totalQtyRow ? (Number(totalQtyRow.totalqty) || 0) : 0;

            if (ownedQuantity < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية (لديك: **${ownedQuantity}**).` });
            }
            
            try {
                const rowsRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, animal.id]);
                const rows = rowsRes.rows;
                
                let remainingToSell = quantity;
                let totalRefund = 0;
                let soldCount = 0;
                let unsellableCount = 0;
                const now = Date.now();

                const lifespanMs = animal.lifespan_days * DAY_MS;
                const noSellMs = Math.ceil(animal.lifespan_days * 0.2) * DAY_MS;

                for (const row of rows) {
                    if (remainingToSell <= 0) break;
                    
                    const purchaseTime = Number(row.purchaseTimestamp || row.purchasetimestamp) || now;
                    const ageMs = now - purchaseTime;
                    const remainingLifeMs = lifespanMs - ageMs;

                    if (remainingLifeMs <= noSellMs) {
                        unsellableCount += Number(row.quantity);
                        continue; 
                    }

                    let currentValRatio = (remainingLifeMs / lifespanMs);
                    if (currentValRatio > 1) currentValRatio = 1;
                    if (currentValRatio < 0) currentValRatio = 0;

                    const refundPricePerUnit = Math.floor(animal.price * 0.70 * currentValRatio);

                    const rowQty = Number(row.quantity);
                    const sellFromThisRow = Math.min(rowQty, remainingToSell);
                    
                    totalRefund += (refundPricePerUnit * sellFromThisRow);
                    remainingToSell -= sellFromThisRow;
                    soldCount += sellFromThisRow;

                    if (rowQty === sellFromThisRow) {
                        await db.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id]);
                    } else {
                        await db.query(`UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromThisRow, row.id]);
                    }
                }

                if (soldCount === 0) {
                    return await i.editReply({ content: `🚫 **فشلت العملية!**\nحيواناتك كبيرة في السن (باقي لها أقل من ${Math.ceil(animal.lifespan_days * 0.2)} يوم) ولا يمكن بيعها.` });
                }

                // 🔥 الإضافة المباشرة لقاعدة البيانات
                await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalRefund, i.user.id, i.guild.id]);

                // تحديث الكاش لمنع التجاوز
                if (client.getLevel && client.setLevel) {
                    let cacheData = await client.getLevel(i.user.id, i.guild.id);
                    if (cacheData) {
                        cacheData.mora = Number(cacheData.mora) + totalRefund;
                        await client.setLevel(cacheData);
                    }
                }

                let desc = `📦 بعت **${soldCount}** × ${animal.name}\n💰 حصلت على: **${totalRefund.toLocaleString()}** ${EMOJI_MORA}`;
                if (remainingToSell > 0) {
                    desc += `\n⚠️ لم يتم بيع **${remainingToSell}** لأنها كبيرة في السن.`;
                } else {
                    desc += `\n📉 (تم خصم قيمة الاستهلاك بناءً على عمر الحيوان)`;
                }

                const embed = new EmbedBuilder()
                    .setTitle('✅ تم البيع بنجاح')
                    .setColor(Colors.Green)
                    .setDescription(desc)
                    .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

                return await i.editReply({ embeds: [embed] });

            } catch (txErr) {
                console.error("Farm Sell Error:", txErr);
                return await i.editReply({ content: '❌ حدث خطأ أثناء إتمام عملية البيع.' });
            }
        }

    } catch (e) { 
        console.error("[Farm Transaction Error]", e); 
        await i.editReply("❌ حدث خطأ داخلي أثناء معالجة الطلب."); 
    }
}

module.exports = { _handleFarmTransaction };
