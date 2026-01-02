const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF } = require('./constants'); 

// دالة توليد لون عشوائي للإيمبد
function getRandomColor() {
    const colors = [Colors.Red, Colors.Blue, Colors.Green, Colors.Gold, Colors.Purple, Colors.Aqua];
    return colors[Math.floor(Math.random() * colors.length)];
}

async function triggerMimicChest(thread, players) {
    return new Promise(async (resolve) => {
        const alivePlayers = players.filter(p => !p.isDead);
        
        // إذا لم يتبق أحد حي، ننهي الحدث فوراً
        if (alivePlayers.length === 0) {
            resolve();
            return;
        }

        const openedPlayers = new Set();

        const embed = new EmbedBuilder()
            .setTitle('★ غرفـة مخفيـة ...')
            .setDescription(`✶ عثرتـم عـلى غرفـة مخفية في أعمـاق الدانجون يوجـد 3 صناديق القرار لكـم المخاطـرة وفتـح الصناديـق أم تخطيها ..\n\n✶ لديكـم **60 ثانيـة** قبل ان يبتلع الدانجـون غرفة الصناديق اختـر او دع !`)
            .setImage('https://i.postimg.cc/jdXLq52j/cges.png')
            .setColor(getRandomColor())
            .setFooter({ text: '⚠️ انتبه: بعض الصناديق قد تكون فخاخاً!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Success)
        );

        const message = await thread.send({ embeds: [embed], components: [row] });

        const collector = message.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

            const player = players.find(p => p.id === i.user.id);
            if (!player || player.isDead) {
                return i.followUp({ content: '🚫 أنت لست مشاركاً أو أنك ميت!', ephemeral: true });
            }

            if (openedPlayers.has(player.id)) {
                return i.followUp({ content: '🔒 لقد فتحت صندوقاً بالفعل! اترك الباقي لزملائك.', ephemeral: true });
            }

            openedPlayers.add(player.id);

            const roll = Math.random() * 100;
            let resultMsg = "";

            if (roll < 20) { 
                const amount = Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
                player.loot.mora += amount;
                resultMsg = `💰 **${player.name}** فتح صندوقاً ووجـد **${amount}** مورا! (تمت إضافتها لغنائمك)`;
            
            } else if (roll < 40) { 
                const amount = Math.floor(Math.random() * (500 - 10 + 1)) + 10;
                player.loot.xp += amount;
                resultMsg = `✨ **${player.name}** وجـد مخطوطـات قديمة وحصل على **${amount}** XP! (تمت إضافتها لغنائمك)`;

            } else if (roll < 55) { 
                const dmg = Math.floor(player.maxHp * 0.25);
                player.hp = Math.max(1, player.hp - dmg); 
                resultMsg = `👹 **${player.name}** الصنـدوق كـان ميميـك! قام بعضـه وسبب **${dmg}** ضرر!`;

            } else if (roll < 70) { 
                const heal = Math.floor(player.maxHp * 0.40);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                resultMsg = `💖 **${player.name}** وجـد زجاجة شفاء واستعاد **${heal}** من صحته!`;

            } else if (roll < 85) { 
                player.effects.push({ type: 'atk_buff', val: 0.2, turns: 5 });
                resultMsg = `💪 **${player.name}** حصل على بركة القوة! (+20% هجوم لـ 5 جولات) ${EMOJI_BUFF}`;

            } else if (roll < 95) { 
                player.effects.push({ type: 'poison', val: Math.floor(player.maxHp * 0.05), turns: 5 });
                resultMsg = `☠️ **${player.name}** استنشق غازاً ساماً من الصندوق! (تسمم لـ 5 جولات) ${EMOJI_NERF}`;

            } else { 
                resultMsg = `💨 **${player.name}** فتح الصندوق ووجـده فارغاً تماماً...`;
            }

            await thread.send(resultMsg);

            embed.setColor(getRandomColor());
            await message.edit({ embeds: [embed] }).catch(() => {});

            // 🔥 إنهاء التجميع فوراً إذا فتح الجميع الصناديق 🔥
            if (openedPlayers.size >= alivePlayers.length) {
                collector.stop('all_opened');
            }
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            
            embed.setDescription(`🔒 **أغلقت الصناديق أبوابها...** تابعوا طريقكم!`);
            embed.setColor(Colors.Grey);
            
            await message.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
            
            await thread.send("🌪️ تلاشت الصناديق في الظلام... الفريق يكمل مسيره.");
            
            // ✅ السماح للملف الرئيسي بالاستمرار
            resolve();
        });
    });
}

module.exports = { triggerMimicChest };
