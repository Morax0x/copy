const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF } = require('./constants');

// دالة توليد لون عشوائي للإيمبد
function getRandomColor() {
    const colors = [Colors.Red, Colors.Blue, Colors.Green, Colors.Gold, Colors.Purple, Colors.Aqua];
    return colors[Math.floor(Math.random() * colors.length)];
}

async function triggerMimicChest(thread, players) {
    // تصفية اللاعبين الأحياء فقط هم من يستطيعون الفتح
    const alivePlayers = players.filter(p => !p.isDead);
    if (alivePlayers.length === 0) return;

    // مجموعة لتتبع من فتح الصندوق (كل لاعب له مرة واحدة)
    const openedPlayers = new Set();

    const embed = new EmbedBuilder()
        .setTitle('★ غرفـة مخفيـة ...')
        .setDescription(`✶ عثرتـم عـلى غرفـة مخفية في أعمـاق الدانجون يوجـد 3 صناديق القرار لكـم المخاطـرة وفتـح الصناديـق أم تخطيها ..\n\n✶ لديكـم **60 ثانيـة** قبل ان يبتلع الدانجـون غرفة الصناديق اختـر او دع !`)
        .setImage('https://i.postimg.cc/jdXLq52j/cges.png')
        .setColor(getRandomColor())
        .setFooter({ text: '⚠️ انتبه: بعض الصناديق قد تكون فخاخاً (Mimic)!' });

    // 3 أزرار بألوان مختلفة وايموجي الصندوق
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Primary), // أزرق
        new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Danger),  // أحمر
        new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Success)  // أخضر
    );

    const message = await thread.send({ embeds: [embed], components: [row] });

    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (i) => {
        await i.deferUpdate();

        // 1. التحقق: هل اللاعب مشارك وحي؟
        const player = players.find(p => p.id === i.user.id);
        if (!player || player.isDead) {
            return i.followUp({ content: '🚫 أنت لست مشاركاً أو أنك ميت!', ephemeral: true });
        }

        // 2. التحقق: هل فتح صندوقاً من قبل؟
        if (openedPlayers.has(player.id)) {
            return i.followUp({ content: '🔒 لقد فتحت صندوقاً بالفعل! اترك الباقي لزملائك.', ephemeral: true });
        }

        // تسجيل اللاعب
        openedPlayers.add(player.id);

        // 3. تحديد الجائزة (Roulette)
        const roll = Math.random() * 100;
        let resultMsg = "";

        if (roll < 20) { 
            // 💰 كنز القراصنة (مورا بين 800 و 1500)
            const amount = Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
            player.loot.mora += amount;
            resultMsg = `💰 **${player.name}** فتح صندوقاً ووجـد **${amount}** مورا! (تمت إضافتها لغنائمك)`;
        
        } else if (roll < 40) { 
            // ✨ مخطوطة المعرفة (XP بين 10 و 500)
            const amount = Math.floor(Math.random() * (500 - 10 + 1)) + 10;
            player.loot.xp += amount;
            resultMsg = `✨ **${player.name}** وجـد مخطوطـات قديمة وحصل على **${amount}** XP! (تمت إضافتها لغنائمك)`;

        } else if (roll < 55) { 
            // 👹 عضة الميميك (خصم 25% من HP)
            const dmg = Math.floor(player.maxHp * 0.25);
            player.hp = Math.max(1, player.hp - dmg); // لا يموت، يبقى 1 HP
            resultMsg = `👹 **${player.name}** الصنـدوق كـان ميميـك! قام بعضـه وسبب **${dmg}** ضرر!`;

        } else if (roll < 70) { 
            // 💖 نبع الشفاء (استعادة 40% HP)
            const heal = Math.floor(player.maxHp * 0.40);
            player.hp = Math.min(player.maxHp, player.hp + heal);
            resultMsg = `💖 **${player.name}** وجـد زجاجة شفاء واستعاد **${heal}** من صحته!`;

        } else if (roll < 85) { 
            // 💪 بركة القوة (بف هجوم لـ 5 هجمات/أدوار)
            // ملاحظة: بما أن النظام يعتمد على 'turns' في التأثيرات، سنجعلها 5 أدوار
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 5 });
            resultMsg = `💪 **${player.name}** حصل على بركة القوة! (+20% هجوم لـ 5 جولات) ${EMOJI_BUFF}`;

        } else if (roll < 95) { 
            // ☠️ غاز سام (تسمم يستمر في الدانجون)
            player.effects.push({ type: 'poison', val: Math.floor(player.maxHp * 0.05), turns: 5 });
            resultMsg = `☠️ **${player.name}** استنشق غازاً ساماً من الصندوق! (تسمم لـ 5 جولات) ${EMOJI_NERF}`;

        } else { 
            // 💨 صندوق فارغ
            resultMsg = `💨 **${player.name}** فتح الصندوق ووجـده فارغاً تماماً...`;
        }

        // إرسال النتيجة في الثريد
        await thread.send(resultMsg);

        // تغيير لون الإيمبد عشوائياً كنوع من التفاعل
        embed.setColor(getRandomColor());
        await message.edit({ embeds: [embed] }).catch(() => {});
    });

    collector.on('end', async () => {
        // تعطيل الأزرار وتحديث الرسالة
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        
        embed.setDescription(`🔒 **اختفت الغرفة المخفية...** تابعوا طريقكم!`);
        embed.setColor(Colors.Grey);
        
        await message.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
        
        // رسالة نصية قصيرة
        await thread.send("🌪️ تلاشت الصناديق في الظلام... الفريق يكمل مسيره.");
    });
}

module.exports = { triggerMimicChest };
