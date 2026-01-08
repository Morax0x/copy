const { EmbedBuilder, Colors } = require("discord.js");
const { farmAnimals, EMOJI_MORA, sendShopLog } = require('./utils');
// ✅ استدعاء دالة السعة الموحدة
const { getPlayerCapacity } = require('../../utils/farmUtils.js');

async function _handleFarmTransaction(i, client, sql, isBuy) {
    await i.deferReply({ ephemeral: false }); 
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) return await i.editReply({ content: '❌ كمية غير صالحة.' });
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        const animal = farmAnimals.find(a => a.id === animalId);
        if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود.' });

        let userData = client.getLevel.get(i.user.id, i.guild.id); 
        if (!userData) userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        let userMora = userData.mora || 0; 
        const userBank = userData.bank || 0;

        if (isBuy) {
            // ============================================================
            // 🔒 نظام منع الشراء فوق السعة (بالحجم)
            // ============================================================
            
            // ✅ استخدام الدالة الموحدة لحساب السعة القصوى
            const maxCapacity = getPlayerCapacity(client, i.user.id, i.guild.id);

            // 1. حساب الحجم المستهلك حالياً في المزرعة
            const userFarmRows = sql.prepare("SELECT animalID, COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ? GROUP BY animalID").all(i.user.id, i.guild.id);
            
            let currentCapacityUsed = 0;
            for (const row of userFarmRows) {
                const fa = farmAnimals.find(a => a.id === row.animalID);
                if (fa) {
                    currentCapacityUsed += (fa.size || 1) * row.count;
                }
            }

            // 2. حساب حجم الحيوانات الجديدة التي يريد شراءها
            const incomingSize = (animal.size || 1) * quantity;

            // 3. المنع إذا تجاوز السعة
            if (currentCapacityUsed + incomingSize > maxCapacity) {
                const remainingSpace = maxCapacity - currentCapacityUsed;
                return await i.editReply({ 
                    content: `🚫 **فشلت عملية الشراء!** المزرعة لا تتسع لهذه الكمية.\n` +
                             `📦 المساحة المستخدمة: \`${currentCapacityUsed}\` / \`${maxCapacity}\` وحدة.\n` +
                             `⚠️ الحيوانات المطلوبة تحتاج مساحة: \`${incomingSize}\` وحدة.\n` +
                             `💡 المساحة المتبقية لديك هي: \`${remainingSpace > 0 ? remainingSpace : 0}\` وحدة فقط.`
                });
            }
            // ============================================================

            const totalCost = Math.floor(animal.price * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                return await i.editReply({ content: msg });
            }

            // تنفيذ عملية الشراء
            userData.mora -= totalCost;
            const now = Date.now();
            
            const insertStmt = sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?)");
            const transaction = sql.transaction(() => {
                for (let j = 0; j < quantity; j++) {
                    insertStmt.run(i.guild.id, i.user.id, animal.id, now, now);
                }
                userData.shop_purchases = (userData.shop_purchases || 0) + 1;
                client.setLevel.run(userData);
            });
            transaction();

            const embed = new EmbedBuilder()
                .setTitle('✅ تم الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 تم إضافة **${quantity}** × ${animal.name} إلى مزرعتك.\n💵 التكلفة الإجمالية: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n⚖️ المساحة المستهلكة الجديدة: \`${currentCapacityUsed + incomingSize}\` / \`${maxCapacity}\``)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            return await i.editReply({ embeds: [embed] });

        } else {
            // منطق البيع (حيوانات)
            const farmCount = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id).count;
            if (farmCount < quantity) return await i.editReply({ content: `❌ لا تملك هذه الكمية من ${animal.name}.` });
            
            const toDelete = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT ?").all(i.user.id, i.guild.id, animal.id, quantity);
            
            const deleteStmt = sql.prepare("DELETE FROM user_farm WHERE id = ?");
            const sellTransaction = sql.transaction(() => {
                toDelete.forEach(d => deleteStmt.run(d.id));
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
        console.error(e); 
        await i.editReply("❌ حدث خطأ داخلي أثناء معالجة العملية."); 
    }
}

module.exports = { _handleFarmTransaction };
