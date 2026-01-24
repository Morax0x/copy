// handlers/dungeon/logic/status-monitor.js

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

        if (player.isDead) {
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

        await m.reply({ content: msgContent }).catch(()=>{});
    });

    return collector;
}

module.exports = { startStatusMonitor };
