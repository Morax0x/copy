// handlers/dungeon/logic/status-monitor.js

const { EmbedBuilder, Colors } = require("discord.js");

/**
 * بدء مراقبة رسائل اللاعبين لمعرفة حالتهم (HP, Shield)
 */
function startStatusMonitor(threadChannel, players) {
    const statusKeywords = ['كشف', 'هيل', 'هيلي', 'دم', 'دمي', 'HP', 'كم دمي'];
    const statusFilter = m => statusKeywords.includes(m.content.trim()) && !m.author.bot;
    
    // إنشاء المراقب
    const collector = threadChannel.createMessageCollector({ filter: statusFilter, time: 24 * 60 * 60 * 1000 });

    collector.on('collect', async m => {
        const player = players.find(p => p.id === m.author.id);
        if (!player) return; 

        if (player.isDead || player.status === 'dead') {
             return m.reply({ content: `👻 **${player.name}** أنت ميت حالياً!` }).catch(()=>{});
        }

        const percent = Math.max(0, Math.min(1, player.hp / player.maxHp));
        const filled = Math.round(percent * 10);
        const empty = 10 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        const classMap = {
            'Warrior': 'محارب',
            'Tank': 'مدافع',
            'Priest': 'كاهن',
            'Mage': 'ساحر',
            'Leader': 'قائد',
            'Former Leader': 'قائد سابق'
        };
        const arClass = classMap[player.class] || player.class;

        let msgContent = `👤 **${player.name}** [${arClass}]\n[${bar}] ❤️ **${player.hp}/${player.maxHp}**`;
        
        if (player.shield > 0) {
            msgContent += `\n🛡️ **الدرع:** ${player.shield}`;
        }
        
        if (player.status === 'downed') {
            msgContent += `\n⚠️ **حالة حرجة:** متبقي ${player.deathCounter} جولات قبل التحلل!`;
        }

        await m.reply({ content: msgContent }).catch(()=>{});
    });

    return collector;
}

/**
 * 🔥 الدالة الجديدة: معالجة عدادات الموت والتحلل
 * يتم استدعاؤها في بداية كل جولة من الملف الرئيسي
 */
async function updateDownedTimers(players, threadChannel) {
    let decompositionHappened = false;

    for (const player of players) {
        // نتحقق فقط من اللاعبين الساقطين (Downed)
        if (player.status === 'downed' && !player.isPermDead) {
            
            // إنقاص العداد
            player.deathCounter = (player.deathCounter || 0) - 1;

            // إذا انتهى الوقت (التحلل)
            if (player.deathCounter <= 0) {
                player.status = 'dead';      // تحويل الحالة لميت
                player.isDead = true;        // تأكيد الموت
                player.isPermDead = true;    // 💀 موت نهائي (لا يمكن إنعاشه)
                player.hp = 0;

                // إرسال رسالة التحلل فوراً
                const rotEmbed = new EmbedBuilder()
                    .setTitle('💀 تحلل جثة')
                    .setDescription(`مـات **${player.name}**.\nتحللت جثته وأصبحت روحه جزءاً من الدانجون .`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://i.postimg.cc/QtMZBt18/skull.png'); // صورة جمجمة

                await threadChannel.send({ embeds: [rotEmbed] }).catch(()=>{});
                decompositionHappened = true;
            } else {
                // تذكير باقتراب الموت (اختياري، لزيادة التوتر)
                if (player.deathCounter === 1) {
                    await threadChannel.send(`⚠️ **تنبيه:** **${player.name}** سيموت نهائياً في الجولة القادمة إذا لم يتم إنقاذه!`).catch(()=>{});
                }
            }
        }
    }
    return decompositionHappened;
}

module.exports = { startStatusMonitor, updateDownedTimers };
