const { EmbedBuilder, Colors } = require("discord.js");
const { farmAnimals, EMOJI_MORA, sendShopLog } = require('./utils');

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
            const totalCost = Math.floor(animal.price * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                return await i.editReply({ content: msg });
            }
            userData.mora -= totalCost;
            const now = Date.now();
            // إضافة كل حيوان كسجل منفصل
            for (let j = 0; j < quantity; j++) {
                sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?)").run(i.guild.id, i.user.id, animal.id, now, now);
            }
            userData.shop_purchases = (userData.shop_purchases || 0) + 1;
            client.setLevel.run(userData);
            const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            return await i.editReply({ embeds: [embed] });
        } else {
            // منطق البيع (حيوانات)
            const farmCount = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id).count;
            if (farmCount < quantity) return await i.editReply({ content: `❌ لا تملك هذه الكمية.` });
            const toDelete = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT ?").all(i.user.id, i.guild.id, animal.id, quantity);
            toDelete.forEach(d => sql.prepare("DELETE FROM user_farm WHERE id = ?").run(d.id));
            const totalGain = Math.floor(animal.price * 0.70 * quantity); // بيع بـ 70%
            userData.mora += totalGain;
            client.setLevel.run(userData);
            const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            return await i.editReply({ embeds: [embed] });
        }
    } catch (e) { console.error(e); await i.editReply("❌ حدث خطأ."); }
}

module.exports = { _handleFarmTransaction };
