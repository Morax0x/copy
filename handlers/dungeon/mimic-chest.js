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

            // --- توزيع الاحتمالات الشامل ---

            if (roll < 15) { 
                // 💰 مورا (15%)
                const amount = Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
                player.loot.mora += amount;
                resultMsg = `💰 **${player.name}** فتح صندوقاً ووجـد **${amount}** مورا!`;
            
            } else if (roll < 25) { 
                // ✨ خبرة XP (10%)
                const amount = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
                player.loot.xp += amount;
                resultMsg = `✨ **${player.name}** وجـد مخطوطـات قديمة وحصل على **${amount}** XP!`;

            } else if (roll < 35) { 
                // 🛡️ درع مؤقت (10%)
                const shieldVal = Math.floor(Math.random() * (250 - 50 + 1)) + 50;
                player.shield = (player.shield || 0) + shieldVal;
                // تفعيل استمرار الدرع للطوابق القادمة
                player.shieldPersistent = true;
                player.shieldFloorsCount = 0;
                resultMsg = `🛡️ **${player.name}** عثر على درع سحري متهالك! (+${shieldVal} درع)`;

            } else if (roll < 40) { 
                // ⚡ شحن المهارات (5%)
                player.special_cooldown = 0;
                player.skillCooldowns = {}; 
                resultMsg = `⚡ **${player.name}** لمس بلورة طاقة! (تم شحن جميع المهارات)`;

            } else if (roll < 48) { 
                // 💖 شفاء أو تحويل لدرع (8%)
                const healAmount = Math.floor(player.maxHp * 0.40); // 40%

                if (player.hp >= player.maxHp * 0.9) {
                    // إذا الصحة فوق 90%، يتحول الشفاء الفائض لدرع
                    player.shield = (player.shield || 0) + healAmount;
                    resultMsg = `🛡️ **${player.name}** وجد جرعة شفاء وهو بكامل عافيته، فتحولت الطاقة السحرية إلى **${healAmount}** درع!`;
                } else {
                    // شفاء طبيعي
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    resultMsg = `💖 **${player.name}** وجـد زجاجة شفاء واستعاد **${healAmount}** من صحته!`;
                }

            } else if (roll < 55) { 
                // 💪 بوف هجوم (7%)
                player.effects.push({ type: 'atk_buff', val: 0.2, turns: 5 });
                resultMsg = `💪 **${player.name}** حصل على بركة القوة! (+20% هجوم لـ 5 جولات) ${EMOJI_BUFF}`;

            } else if (roll < 60) {
                // 🎯 بوف كريتيكال (5%)
                player.critRate = (player.critRate || 0.2) + 0.2; 
                resultMsg = `🎯 **${player.name}** وجد نظارة القناص! (زادت نسبة الضربة الحرجة Crit Rate)`;

            } else if (roll < 70) {
                // 🍷 جرعات تلقائية (10%)
                const potionRoll = Math.random();
                if (potionRoll < 0.5) {
                    // جرعة العملاق
                    player.maxHp *= 2;
                    player.hp = player.maxHp;
                    player.effects.push({ type: 'titan', floors: 3 });
                    resultMsg = `🍷 **${player.name}** وجد **جرعة العملاق** وشربها فوراً! (تضاعفت الصحة لـ 3 طوابق)`;
                } else {
                    // جرعة الانعكاس
                    // 🔥 تصحيح: استخدام rebound_active بدلاً من reflect
                    player.effects.push({ type: 'rebound_active', val: 0.3, turns: 3 });
                    resultMsg = `🌵 **${player.name}** وجد **جرعة الأشواك** وشربها! (يعكس 30% ضرر لـ 3 جولات)`;
                }

            } else if (roll < 78) { 
                // 👹 ضرر ميميك (8%)
                const dmg = Math.floor(player.maxHp * 0.25);
                player.hp = Math.max(1, player.hp - dmg); 
                resultMsg = `👹 **${player.name}** الصنـدوق كـان ميميـك! قام بعضـه وسبب **${dmg}** ضرر!`;

            } else if (roll < 83) { 
                // ❄️ تجميد (5%)
                player.effects.push({ type: 'stun', turns: 1 });
                resultMsg = `❄️ **${player.name}** فتح فخاً جليدياً! (تجميد للدور القادم)`;

            } else if (roll < 88) { 
                // 🔥 حرق (5%)
                const burnDmg = Math.floor(player.maxHp * 0.05);
                player.effects.push({ type: 'burn', val: burnDmg, turns: 3 });
                resultMsg = `🔥 **${player.name}** انفجر في وجهه لهب سحري! (حرق لـ 3 جولات)`;

            } else if (roll < 93) { 
                // 💸 سرقة مورا (5%)
                const stealAmount = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
                const actualSteal = Math.min(player.loot.mora, stealAmount);
                player.loot.mora -= actualSteal;
                
                if (actualSteal > 0) {
                    resultMsg = `👺 **${player.name}** ظهر عفريت وسرق منه **${actualSteal}** مورا وهرب!`;
                } else {
                    resultMsg = `👺 **${player.name}** ظهر عفريت ليحاول سرقته لكن جيبه كان فارغاً!`;
                }

            } else if (roll < 97) { 
                // ☠️ سم (4%)
                player.effects.push({ type: 'poison', val: Math.floor(player.maxHp * 0.05), turns: 5 });
                resultMsg = `☠️ **${player.name}** استنشق غازاً ساماً من الصندوق! (تسمم لـ 5 جولات) ${EMOJI_NERF}`;

            } else { 
                // 💨 فارغ (3%)
                const pityShield = Math.floor(Math.random() * 50) + 10;
                player.shield = (player.shield || 0) + pityShield;
                resultMsg = `💨 **${player.name}** الصندوق كان فارغاً... لكنه وجد قطعة خشبية استخدمها كدرع (+${pityShield} درع).`;
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
