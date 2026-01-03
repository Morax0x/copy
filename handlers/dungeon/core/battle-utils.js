const { EmbedBuilder } = require('discord.js');

// 🔥 دالة لتنظيف الاسم 🔥
function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

// 🔥 دالة نقل القيادة (مع إصلاح تكرار الألقاب) 🔥
function handleLeaderSuccession(players, log) {
    // ============================================================
    // 1. تنظيف الحالة (Cleanup Phase)
    // ============================================================
    // هل يوجد قائد حالي حي يرزق؟
    const currentLiveLeader = players.find(p => p.class === 'Leader' && !p.isDead);

    if (currentLiveLeader) {
        // إذا كان القائد حياً، لا داعي لوجود "قائد سابق" بين الأحياء
        // أي شخص "حي" وعنده لقب "قائد سابق" يرجع لكلاسه الأصلي
        players.forEach(p => {
            if (!p.isDead && p.class === 'Former Leader') {
                p.class = p.originalClass || 'Adventurer';
                // log.push(`♻️ **${p.name}** عاد لمركزه الطبيعي كـ ${p.class}.`);
            }
        });
        return; // نخرج من الدالة، لا داعي لتعيين قائد جديد
    }

    // ============================================================
    // 2. مرحلة الوراثة (Succession Phase)
    // ============================================================
    
    // البحث عن القائد الذي مات للتو (أو ميت سابقاً ولم يتم تعيين بديل له)
    const deadLeader = players.find(p => p.class === 'Leader' && p.isDead);

    // إذا لم نجد قائداً ميتاً (ولا حياً)، ربما هي بداية اللعبة أو حالة نادرة
    if (!deadLeader) {
        // يمكن إضافة منطق هنا لتعيين قائد إذا لم يوجد أي قائد في الفريق
        return;
    }

    // تعيين القائد الميت كـ "قائد سابق"
    deadLeader.class = 'Former Leader';

    // البحث عن خليفة:
    // الشروط: حي + ليس القائد الحالي + ليس قائداً سابقاً + (يفضل ألا يكون كاهناً)
    let successor = players.find(p => !p.isDead && p.class !== 'Leader' && p.class !== 'Former Leader' && p.class !== 'Priest');
    
    // إذا لم نجد أحداً غير الكاهن أو القادة السابقين، نوسع البحث
    if (!successor) {
        successor = players.find(p => !p.isDead && p.class !== 'Leader');
    }

    if (successor) {
        const oldClass = successor.class;
        
        // ترقية الخليفة
        successor.class = 'Leader'; 
        
        log.push(`⚠️ **نظـام الوراثـة:** سقط القائد **${deadLeader.name}**!`);

        // 🔥🔥 معالجة القائد الكاهن (Hybrid) 🔥🔥
        if (oldClass === 'Priest' || successor.isHybridPriest) {
            successor.isHybridPriest = true; // تفعيل/تثبيت الوضع الهجين
            log.push(`🚩✨ **${successor.name}** حمل الراية وأصبح **القائـد الكاهـن**! (جمع بين القيادة والشفاء)`);
        } else {
            log.push(`🚩 **${successor.name}** حمل الراية وأصبح **القائد الجديد**!`);
        }
    } else {
        log.push(`☠️ **سقط القائد** ولا يوجد من يحمل الراية...`);
    }
}

// 🔥 دالة فحص الموت (تستخدم لتحديث الحالة فوراً) 🔥
function checkDeaths(players, floor, log, threadChannel) {
    let someoneDied = false;

    players.forEach(p => {
        // نفحص إذا صحته صفر أو أقل وهو غير مسجل كميت
        if (!p.isDead && p.hp <= 0) {
            p.hp = 0;
            p.isDead = true;
            p.deathFloor = floor;
            someoneDied = true;
            
            // لو كان كاهن (أو القائد الكاهن)، يعالج الفريق قبل موته (Last Breath)
            if ((p.class === 'Priest' || p.isHybridPriest) && !p.isPermDead) {
                players.forEach(m => { 
                    if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); 
                });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                threadChannel.send(`✨⚰️ **${p.name}** سقـط الكـاهـن - قـام بعلاج الفريق على الرمق الاخـير!`).catch(()=>{});
            }

            // التعامل مع الموت النهائي (بعد الإحياء سابقاً)
            if (p.reviveCount >= 1) {
                p.isPermDead = true;
                // إذا مات موت نهائي وكان قائداً، سيتحول لـ "قائد سابق" عبر دالة الوراثة
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
