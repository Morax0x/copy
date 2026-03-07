const { EmbedBuilder, Colors } = require("discord.js");

function startStatusMonitor(threadChannel, players) {
    const statusKeywords = ['كشف', 'هيل', 'هيلي', 'دم', 'دمي', 'HP', 'كم دمي', 'وضعي'];
    const statusFilter = m => statusKeywords.includes(m.content.trim()) && !m.author.bot;
     
    const collector = threadChannel.createMessageCollector({ filter: statusFilter, time: 24 * 60 * 60 * 1000 });

    collector.on('collect', async m => {
        const player = players.find(p => p.id === m.author.id);
        if (!player) return; 

        const deaths = player.deathCount || 0;
        if (deaths >= 3) {
            player.isPermDead = true;
            player.isDead = true; 
        }

        if (player.isPermDead) {
             return m.reply({ content: `💀 **${player.name}** جثتك متحللة (3/3).. لقد غادرت عالم الأحياء نهائياً.` }).catch(()=>{});
        }

        if (player.isDead) {
             return m.reply({ content: `👻 **${player.name}** أنت ميت (الموتة رقم ${deaths}/3). اطلب من الكاهن إنعاشك قبل أن تتحلل!` }).catch(()=>{});
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
        
        const livesLeft = 3 - deaths; 

        let msgContent = `👤 **${player.name}** [${arClass}]\n[${bar}] ❤️ **${player.hp}/${player.maxHp}**`;
        
        if (player.shield > 0) {
            msgContent += `\n🛡️ **الدرع:** ${player.shield}`;
        }
        
        msgContent += `\n💀 **سجل الموت:** ${deaths}/3 (متبقي ${livesLeft} فرص قبل التحلل)`;

        await m.reply({ content: msgContent }).catch(()=>{});
    });

    return collector;
}

async function updateDownedTimers(players, threadChannel) {
    return false; 
}

module.exports = { startStatusMonitor, updateDownedTimers };
