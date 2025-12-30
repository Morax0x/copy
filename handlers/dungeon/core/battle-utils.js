// dungeon/core/battle-utils.js

function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

// دالة فحص الموت
function checkDeaths(players, floor, log, threadChannel) {
    players.forEach(p => {
        if (!p.isDead && p.hp <= 0) {
            p.hp = 0;
            p.isDead = true;
            p.deathFloor = floor;
            
            // لو كان كاهن، يعالج الفريق قبل موته
            if (p.class === 'Priest' && !p.isPermDead) {
                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                threadChannel.send(`✨⚰️ **${p.name}** سقـط ولكنه عالج الفريق قبل موته!`).catch(()=>{});
            }

            if (p.reviveCount >= 1) {
                p.isPermDead = true;
                log.push(`💀 **${p.name}** سقط وتحللت جثته!`);
                threadChannel.send(`💀 **${p.name}** سقط وتحللت جثته - لا يمكن إحياؤه!`).catch(()=>{});
            } else {
                log.push(`💀 **${p.name}** سقط!`);
                threadChannel.send(`💀 **${p.name}** سقط في أرض المعركة!`).catch(()=>{});
            }
        }
    });
}

module.exports = { cleanName, checkDeaths };
