const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_XP } = require('./constants');

async function triggerMimicChest(thread, players) {
    return new Promise(async (resolve) => {
        // إنشاء 3 صناديق عشوائية
        // true = ميميك (فخ)، false = كنز
        // نسبة الميميك 30%
        const chestConfig = [
            Math.random() < 0.3, 
            Math.random() < 0.3, 
            Math.random() < 0.3
        ];

        const embed = new EmbedBuilder()
            .setTitle('📦 صنـاديـق غـامضـة!')
            .setDescription('ظهرت 3 صناديق أمامكم...\nبعضها يحتوي على كنوز، والبعض الآخر قد يكون وحشاً (ميميك)!\n\n**اختر صندوقاً لفتحه:**')
            .setColor(Colors.Gold)
            .setImage('https://i.postimg.cc/Qt8w2Cs3/mimic.png'); // صورة تعبيرية

        // إنشاء الأزرار
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chest_0').setLabel('صندوق 1').setStyle(ButtonStyle.Primary).setEmoji('📦'),
            new ButtonBuilder().setCustomId('chest_1').setLabel('صندوق 2').setStyle(ButtonStyle.Primary).setEmoji('📦'),
            new ButtonBuilder().setCustomId('chest_2').setLabel('صندوق 3').setStyle(ButtonStyle.Primary).setEmoji('📦')
        );

        const msg = await thread.send({ embeds: [embed], components: [row] });

        // مدة الصناديق 45 ثانية
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

        // لتتبع الصناديق المفتوحة
        let openedChests = [false, false, false];

        collector.on('collect', async (i) => {
            const player = players.find(p => p.id === i.user.id);
            if (!player) return i.reply({ content: '🚫 أنت لست في الفريق.', ephemeral: true });
            if (player.isDead) return i.reply({ content: '💀 الموتى لا يفتحون الصناديق!', ephemeral: true });

            const chestIndex = parseInt(i.customId.split('_')[1]);

            if (openedChests[chestIndex]) {
                return i.reply({ content: '❌ هذا الصندوق فُتح بالفعل!', ephemeral: true });
            }

            // تسجيل أن الصندوق فُتح
            openedChests[chestIndex] = true;
            
            // تحديث الأزرار لتعطيل الصندوق المفتوح
            const updatedRow = new ActionRowBuilder();
            msg.components[0].components.forEach((btn, index) => {
                const newBtn = ButtonBuilder.from(btn);
                if (index === chestIndex || openedChests[index]) {
                    newBtn.setDisabled(true).setStyle(ButtonStyle.Secondary);
                }
                updatedRow.addComponents(newBtn);
            });
            await msg.edit({ components: [updatedRow] }).catch(() => {});

            // التعامل مع النتيجة (فخ أم كنز)
            const isMimic = chestConfig[chestIndex];

            if (isMimic) {
                // فخ الميميك: خصم HP
                const dmg = Math.floor(player.maxHp * 0.25); // 25% ضرر
                player.hp = Math.max(0, player.hp - dmg);
                
                await i.reply({ 
                    content: `👹 **يا للهول!** كان الصندوق **ميميك** وعض يدك!\n💥 تلقيت **${dmg}** ضرر.` 
                });

                if (player.hp <= 0) {
                    player.isDead = true;
                    player.deathFloor = "Mimic Trap";
                    await thread.send(`☠️ **${player.name}** مات بسبب جشع الصناديق!`);
                }

            } else {
                // كنز: مورا وخبرة
                const moraReward = Math.floor(Math.random() * 500) + 300; // 300-800
                const xpReward = Math.floor(Math.random() * 100) + 50;
                
                // إضافة الجوائز (تضاف للمخزون المؤقت أو الداتابيس مباشرة حسب نظامك)
                // هنا نضيفها للـ Loot المؤقت الخاص باللاعب
                player.loot.mora += moraReward;
                player.loot.xp += xpReward;

                await i.reply({ 
                    content: `🎉 **كنز!** حصلت على **${moraReward}** ${EMOJI_MORA} و **${xpReward}** ${EMOJI_XP}.` 
                });
            }

            // 🔥 التحقق: هل فُتحت كل الصناديق؟
            if (openedChests.every(c => c === true)) {
                collector.stop('all_opened'); // إنهاء الحدث فوراً
            }
        });

        collector.on('end', async (collected, reason) => {
            // تعطيل كل الأزرار عند الانتهاء
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('chest_0').setLabel('صندوق 1').setStyle(ButtonStyle.Secondary).setEmoji('📦').setDisabled(true),
                new ButtonBuilder().setCustomId('chest_1').setLabel('صندوق 2').setStyle(ButtonStyle.Secondary).setEmoji('📦').setDisabled(true),
                new ButtonBuilder().setCustomId('chest_2').setLabel('صندوق 3').setStyle(ButtonStyle.Secondary).setEmoji('📦').setDisabled(true)
            );
            
            await msg.edit({ components: [disabledRow] }).catch(() => {});

            if (reason === 'all_opened') {
                await thread.send("💨 **تم نهب جميع الصناديق! يكمل الفريق طريقه...**");
            } else {
                await thread.send("⏳ **تلاشت الصناديق المتبقية في الظلام...**");
            }

            // ✅ السماح للدانجون بالاستمرار
            resolve();
        });
    });
}

module.exports = { triggerMimicChest };
