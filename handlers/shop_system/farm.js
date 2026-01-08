const { EmbedBuilder, Colors } = require("discord.js");
const { EMOJI_MORA, sendShopLog } = require('./utils');
const farmAnimals = require('../../json/farm-animals.json');
// استدعاء دوال الحساب الدقيقة
const { getPlayerCapacity, getUsedCapacity } = require('../../utils/farmUtils.js');

async function _handleFarmTransaction(i, client, sql, isBuy) {
    await i.deferReply({ ephemeral: false }); 
    
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ الكمية غير صالحة.' });
        }
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        // تحويل للسترينج للمطابقة الآمنة
        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
        
        if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود.' });

        let userData = client.getLevel.get(i.user.id, i.guild.id); 
        if (!userData) userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        let userMora = userData.mora || 0; 
        const userBank = userData.bank || 0;

        // --- الشراء ---
        if (isBuy) {
            const maxCapacity = getPlayerCapacity(client, i.user.id, i.guild.id);
            const currentUsed = getUsedCapacity(sql, i.user.id, i.guild.id); // حساب دقيق من الداتابيس
            const itemSize = animal.size || 1;
            const requiredSpace = itemSize * quantity;
            const finalSize = currentUsed + requiredSpace;

            // 🛑 الحماية من تجاوز السعة (تم تحديث الرسالة هنا)
            if (finalSize > maxCapacity) {
                const freeSpace = Math.max(0, maxCapacity - currentUsed);
                const maxCanBuy = Math.floor(freeSpace / itemSize);
                
                // بناء الايمبد الجديد
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

            userData.mora -= totalCost;
            const now = Date.now();
            
            // تنفيذ الشراء (Upsert)
            const transaction = sql.transaction(() => {
                const existingRow = sql.prepare("SELECT id, quantity FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id);

                if (existingRow) {
                    sql.prepare("UPDATE user_farm SET quantity = quantity + ?, purchaseTimestamp = ? WHERE id = ?").run(quantity, now, existingRow.id);
                } else {
                    sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, quantity, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?, ?)").run(i.guild.id, i.user.id, animal.id, quantity, now, now);
                }

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
        // --- البيع ---
        else {
            // ✅ استخدام SUM لحساب الكمية الكلية الحقيقية
            const totalQtyRow = sql.prepare("SELECT SUM(quantity) as totalQty FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id);
            const ownedQuantity = totalQtyRow ? (totalQtyRow.totalQty || 0) : 0;

            if (ownedQuantity < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية (لديك: **${ownedQuantity}**).` });
            }
            
            const sellTransaction = sql.transaction(() => {
                const rows = sql.prepare("SELECT id, quantity FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").all(i.user.id, i.guild.id, animal.id);
                
                let remainingToSell = quantity;
                
                for (const row of rows) {
                    if (remainingToSell <= 0) break;
                    
                    const currentQty = row.quantity || 1;
                    
                    if (currentQty <= remainingToSell) {
                        sql.prepare("DELETE FROM user_farm WHERE id = ?").run(row.id);
                        remainingToSell -= currentQty;
                    } else {
                        sql.prepare("UPDATE user_farm SET quantity = quantity - ? WHERE id = ?").run(remainingToSell, row.id);
                        remainingToSell = 0;
                    }
                }

                const totalGain = Math.floor(animal.price * 0.70 * quantity);
                userData.mora += totalGain;
                client.setLevel.run(userData);
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ تم البيع بنجاح')
                    .setColor(Colors.Green)
                    .setDescription(`📦 بعت **${quantity}** × ${animal.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`)
                    .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
                 i.editReply({ embeds: [embed] }); 
            });
            sellTransaction();
        }

    } catch (e) { 
        console.error("[Farm Transaction Error]", e); 
        await i.editReply("❌ حدث خطأ داخلي."); 
    }
}

module.exports = { _handleFarmTransaction };
