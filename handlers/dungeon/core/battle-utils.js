const { EmbedBuilder } = require('discord.js');

// 🔥 دالة لتنظيف الاسم 🔥
function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

// 🔥 دالة نقل القيادة (مع لقب القائد الكاهن) 🔥
function handleLeaderSuccession(players, log) {
    // 1. البحث عن القائد الميت
    const deadLeader = players.find(p => p.class === 'Leader' && p.isDead);

    // إذا لم يمت القائد، لا نفعل شيئاً
    if (!deadLeader) return;

    // 2. البحث عن خليفة:
    // الأولوية 1: أي لاعب حي ليس كاهناً (للحفاظ على المعالج مستقلاً)
    // الأولوية 2: الكاهن (إذا لم يبق غيره)
    let successor = players.find(p => !p.isDead && p.class !== 'Leader' && p.class !== 'Priest');
    
    // إذا لم نجد أحداً غير الكاهن، نضطر لاختيار الكاهن
    if (!successor) {
        successor = players.find(p => !p.isDead && p.class !== 'Leader');
    }

    if (successor) {
        // تغيير القائد الميت إلى "قائد سابق"
        deadLeader.class = 'Former Leader'; 
        
        const oldClass = successor.class;
        successor.class = 'Leader'; // تحويله لقائد ميكانيكياً (عشان الأزرار)
        
        log.push(`⚠️ **نظـام الوراثـة:** سقط القائد **${deadLeader.name}**!`);

        // 🔥🔥 معالجة القائد الكاهن 🔥🔥
        if (oldClass === 'Priest') {
            successor.isHybridPriest = true; // تفعيل الوضع الهجين
            log.push(`🚩✨ **${successor.name}** حمل الراية وأصبح **القائـد الكاهـن**! (جمع بين القيادة والشفاء)`);
        } else {
            log.push(`🚩 **${successor.name}** حمل الراية وأصبح **القائد الجديد**!`);
        }
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
            
            // لو كان كاهن (أو القائد الكاهن)، يعالج الفريق قبل موته
            if ((p.class === 'Priest' || p.isHybridPriest) && !p.isPermDead) {
                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
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
