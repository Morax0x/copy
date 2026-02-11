// handlers/dungeon/logic/status-monitor.js

const { EmbedBuilder, Colors } = require("discord.js");

/**
 * بدء مراقبة رسائل اللاعبين لمعرفة حالتهم (HP, Shield, Death Count)
 */
function startStatusMonitor(threadChannel, players) {
    const statusKeywords = ['كشف', 'هيل', 'هيلي', 'دم', 'دمي', 'HP', 'كم دمي', 'وضعي'];
    const statusFilter = m => statusKeywords.includes(m.content.trim()) && !m.author.bot;
    
    // إنشاء المراقب
    const collector = threadChannel.createMessageCollector({ filter: statusFilter, time: 24 * 60 * 60 * 1000 });

    collector.on('collect', async m => {
        const player = players.find(p => p.id === m.author.id);
        if (!player) return; 

        // إذا كان متحلل (موت نهائي)
        if (player.isPermDead) {
             return m.reply({ content: `💀 **${player.name}** جثتك متحللة.. لقد غادرت عالم الأحياء نهائياً.` }).catch(()=>{});
        }

        // إذا كان ميت حالياً (قابل للإنعاش)
        if (player.isDead) {
             return m.reply({ content: `👻 **${player.name}** أنت ميت (الموتة رقم ${player.deathCount || 0}). اطلب من الكاهن إنعاشك!` }).catch(()=>{});
        }

        // الحسابات للعرض (شريط الصحة)
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
        
        const deaths = player.deathCount || 0;
        const livesLeft = 3 - deaths; // 3 محاولات إجمالية

        let msgContent = `👤 **${player.name}** [${arClass}]\n[${bar}] ❤️ **${player.hp}/${player.maxHp}**`;
        
        if (player.shield > 0) {
            msgContent += `\n🛡️ **الدرع:** ${player.shield}`;
        }
        
        // عرض حالة الموت والمحاولات
        msgContent += `\n💀 **سجل الموت:** ${deaths}/3 (متبقي ${livesLeft} فرص للتحلل)`;

        await m.reply({ content: msgContent }).catch(()=>{});
    });

    return collector;
}

/**
 * 🔥 دالة فارغة (Dummy Function) للحفاظ على توافق الملفات القديمة
 * لم نعد بحاجة لتحديث العدادات لأن الموت أصبح فورياً عند الضربة
 */
async function updateDownedTimers(players, threadChannel) {
    return false; // لا تفعل شيئاً
}

module.exports = { startStatusMonitor, updateDownedTimers };
