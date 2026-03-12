const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');
const { getPlayerCapacity, getUsedCapacity } = require('../../utils/farmUtils.js');

let EMOJI_MORA = '🪙'; 
const DAY_MS = 24 * 60 * 60 * 1000;

async function _handleFarmTransaction(i, client, db, isBuy) {
    if (!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); 
    console.log(`\n--- [FARM DEBUG] بدأ ${i.user.username} عملية ${isBuy ? 'شراء' : 'بيع'} حيوان ---`);

    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ كمية غير صالحة.');
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
        if (!animal) return await i.editReply('❌ حيوان غير موجود.');

        // قراءة الرصيد بدقة من القاعدة
        const dbUserRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]);
        let dbUser = dbUserRes.rows[0];
        if (!dbUser) {
            await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "level", "xp", "totalXP") VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]);
            dbUser = { mora: 0, bank: 0 };
        }
        let userMora = Number(dbUser.mora) || 0;

        if (isBuy) {
            const maxCapacity = await getPlayerCapacity(client, i.user.id, i.guild.id);
            const currentUsed = await getUsedCapacity(db, i.user.id, i.guild.id); 
            const requiredSpace = (animal.size || 1) * quantity;

            if ((currentUsed + requiredSpace) > maxCapacity) {
                return await i.editReply('❌ لا توجد مساحة كافية بمزرعتك.');
            }

            const totalCost = Math.floor(animal.price * quantity);
            console.log(`[FARM DEBUG] تكلفة الحيوانات: ${totalCost} | رصيد اللاعب: ${userMora}`);
            
            if (userMora < totalCost) return await i.editReply(`❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** 🪙`);

            // 🔥 خصم ذري ومؤكد (يخصم ويرد النتيجة)
            const updateRes = await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalCost, i.user.id, i.guild.id]);
            const exactNewMora = updateRes.rows[0].mora;
            console.log(`[FARM DEBUG] ✅ تم خصم فلوس المزرعة بنجاح. الرصيد المتبقي: ${exactNewMora}`);

            const now = Date.now();
            await db.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastCollected", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6, $7)`, [i.guild.id, i.user.id, animal.id, quantity, now, now, now]);

            // إجبار الكاش
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }

            const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 أضفت **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** 🪙`);
            return await i.editReply({ embeds: [embed] });

        } else {
            const totalQtyRowRes = await db.query(`SELECT SUM("quantity") as totalqty FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, animal.id]);
            const ownedQuantity = totalQtyRowRes.rows[0] ? (Number(totalQtyRowRes.rows[0].totalqty) || 0) : 0;

            if (ownedQuantity < quantity) return await i.editReply(`❌ تملك فقط: **${ownedQuantity}**.`);
            
            const rowsRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, animal.id]);
            
            let remainingToSell = quantity, totalRefund = 0, soldCount = 0;
            const now = Date.now(), lifespanMs = animal.lifespan_days * DAY_MS, noSellMs = Math.ceil(animal.lifespan_days * 0.2) * DAY_MS;

            for (const row of rowsRes.rows) {
                if (remainingToSell <= 0) break;
                const ageMs = now - (Number(row.purchaseTimestamp || row.purchasetimestamp) || now);
                const remainingLifeMs = lifespanMs - ageMs;

                if (remainingLifeMs <= noSellMs) continue; 

                let currentValRatio = Math.max(0, Math.min(remainingLifeMs / lifespanMs, 1));
                const refundPricePerUnit = Math.floor(animal.price * 0.70 * currentValRatio);

                const sellFromThisRow = Math.min(Number(row.quantity), remainingToSell);
                totalRefund += (refundPricePerUnit * sellFromThisRow);
                remainingToSell -= sellFromThisRow;
                soldCount += sellFromThisRow;

                if (Number(row.quantity) === sellFromThisRow) await db.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id]);
                else await db.query(`UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromThisRow, row.id]);
            }

            if (soldCount === 0) return await i.editReply('🚫 الحيوانات قديمة (عجوزة) ولا يمكن بيعها.');

            // 🔥 إضافة ذرية مؤكدة للفلوس
            const updateRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalRefund, i.user.id, i.guild.id]);
            const exactNewMora = updateRes.rows[0].mora;
            console.log(`[FARM DEBUG] ✅ تم بيع الحيوانات إضافة الأرباح. الرصيد الجديد: ${exactNewMora}`);

            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }

            const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 بعت **${soldCount}** × ${animal.name}\n💰 حصلت على: **${totalRefund.toLocaleString()}** 🪙`);
            return await i.editReply({ embeds: [embed] });
        }
    } catch (e) { 
        console.error("[FARM FATAL ERROR]:", e); 
        await i.editReply("❌ تعطلت قاعدة البيانات."); 
    }
}

module.exports = { _handleFarmTransaction };
