// 🔥 دالة لتنظيف الاسم 🔥
function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

// 🔥 دالة نقل القيادة (الإضافة الضرورية لحل المشكلة) 🔥
function handleLeaderSuccession(players, log) {
    // 1. البحث عن القائد الميت
    const deadLeader = players.find(p => p.class === 'Leader' && p.isDead);

    // إذا لم يمت القائد، لا نفعل شيئاً
    if (!deadLeader) return;

    // 2. البحث عن خليفة (أول لاعب حي ليس القائد)
    const successor = players.find(p => !p.isDead && p.class !== 'Leader');

    if (successor) {
        // تغيير القائد الميت إلى "قائد سابق"
        deadLeader.class = 'Former Leader'; 
        
        // تعيين القائد الجديد
        successor.class = 'Leader'; 
        
        log.push(`⚠️ **نظـام الوراثـة:** سقط القائد **${deadLeader.name}**!`);
        log.push(`🚩 **${successor.name}** حمل الراية وأصبح **القائد الجديد**!`);
    }
}

// 🔥 دالة فحص الموت (تستخدم لتحديث الحالة فوراً) 🔥
function checkDeaths(players, floor, log, threadChannel) {
    let someoneDied = false;

    players.forEach(p => {
        if (!p.isDead && p.hp <= 0) {
            p.hp = 0;
            p.isDead = true;
            p.deathFloor = floor;
            someoneDied = true;
            
            // لو كان كاهن، يعالج الفريق قبل موته
            if (p.class === 'Priest' && !p.isPermDead) {
                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!**`);
                threadChannel.send(`✨⚰️ **${p.name}** سقـط الكـاهـن - قـام بعلاج الفريق على الرمق الاخـير!`).catch(()=>{});
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

    // إذا مات شخص ما، نفحص فوراً إذا كان القائد لننقل القيادة
    if (someoneDied) {
        handleLeaderSuccession(players, log);
    }
}

// ✅ تم تصدير جميع الدوال المطلوبة
module.exports = { cleanName, checkDeaths, handleLeaderSuccession };
