const { dungeonConfig } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

// --- 🧠 دوال الذكاء الاصطناعي (Smart AI Helpers) ---
function getSmartTarget(players) {
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return null;

    // 1. الأولوية للكاهن (Priest) لتعطيل الإحياء
    const priest = alive.find(p => p.class === 'Priest');
    if (priest && Math.random() < 0.7) return priest; // 70% فرصة لاستهداف الكاهن

    // 2. الأولوية للأضعف (Kill Confirm)
    const lowestHp = alive.sort((a, b) => a.hp - b.hp)[0];
    if (lowestHp && lowestHp.hp < lowestHp.maxHp * 0.3 && Math.random() < 0.8) return lowestHp; // 80% فرصة لقتل الضعيف

    // 3. عشوائي
    return alive[Math.floor(Math.random() * alive.length)];
}

// --- ⚔️ مهارات الوحوش العامة (للمينيون والنخبة) ---
const GENERIC_MONSTER_SKILLS = [
    { name: "ضربة قاصمة", emoji: "🔨", chance: 0.3, execute: (m, p, l) => { 
        const target = getSmartTarget(p); 
        if(target){ applyDamageToPlayer(target, Math.floor(m.atk * 1.5)); l.push(`🔨 **${m.name}** رصد نقطة ضعف **${target.name}** وسدد ضربة قاصمة!`); }
    }},
    { name: "عضة سامة", emoji: "🤮", chance: 0.3, execute: (m, p, l) => { 
        const alive = p.filter(pl=>!pl.isDead);
        if (alive.length === 0) return;
        const target = alive[Math.floor(Math.random()*alive.length)];
        if(target){ target.effects.push({type:'poison', val: Math.floor(m.atk*0.2), turns:3}); l.push(`🤮 **${m.name}** نفث سماً على **${target.name}**!`); }
    }},
    { name: "صرخة مرعبة", emoji: "🗣️", chance: 0.2, execute: (m, p, l) => { 
        // تم التعديل: الصرخة الآن تسبب "ارتباك" أو "ضعف"
        p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) pl.effects.push({type:'weakness',val:0.3,turns:2})}); l.push(`🗣️ **${m.name}** أطلق صرخة أضعفت عزيمة البعض!`);
    }},
    { name: "هجوم متوحش", emoji: "🐾", chance: 0.3, execute: (m, p, l) => { 
        p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
    }},
    { name: "تصلب", emoji: "🛡️", chance: 0.2, execute: (m, p, l) => { 
        m.hp += Math.floor(m.maxHp * 0.05); l.push(`🛡️ **${m.name}** زاد دفاعه واستعاد قليلاً من الصحة!`);
    }}
];

// --- 👹 قاعدة بيانات مهارات الزعماء والحراس (Bosses & Guardians) ---
const MONSTER_SKILLS = {
    // === Elden Ring ===
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Dance of Death)",
        emoji: "🌸",
        chance: 0.25,
        execute: (monster, players, log) => {
            let totalDmg = 0;
            players.forEach(p => {
                if (!p.isDead) {
                    const dmg = Math.floor(monster.atk * 1.5);
                    const actualDmg = applyDamageToPlayer(p, dmg);
                    totalDmg += actualDmg;
                    monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(actualDmg * 0.5));
                }
            });
            log.push(`🌸 **مالينيا** حلقت ونفذت **رقصة الموت**! (امتصاص صحة الفريق)`);
        }
    },
    "الجنرال رادان": {
        name: "نجمة القهر",
        emoji: "☄️",
        chance: 0.20,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if (target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.5));
                target.effects.push({ type: 'weakness', val: 0.5, turns: 2 });
                log.push(`☄️ **رادان** سحق **${target.name}** بقوة النجوم!`);
            }
        }
    },
    "ماليكيث، النصل الأسود": {
        name: "الموت المقدر",
        emoji: "🗡️",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { p.hp -= Math.floor(p.hp * 0.20); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.2), turns: 3 }); } });
            log.push(`🗡️ **ماليكيث** أطلق العنان للموت المقدر! (HP Cut + Burn)`);
        }
    },
    "غودفري، الإلدن لورد": {
        name: "زلزال هورا لوكس",
        emoji: "🌋",
        chance: 0.25,
        execute: (monster, players, log) => {
            // 🔥 تم الإصلاح: الآن يطبق Stun بدلاً من skipCount
            players.forEach(p => { 
                if (!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 0.9)); 
                    if (Math.random() < 0.5) {
                        p.effects.push({ type: 'stun', val: 1, turns: 1 }); // شلل لمدة جولة
                    }
                } 
            });
            log.push(`🌋 **غودفري** مزق الأرض! (ضرر + طرح أرضاً "شلل")`);
        }
    },
    "الساحرة راني": {
        name: "قمر الظلام البارد",
        emoji: "🌕",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'weakness', val:0.3, turns:2}); } });
            log.push(`🌕 **راني** أطلقت سحر القمر المظلم! (تجميد/ضعف)`);
        }
    },

    // === Dark Souls / Bloodborne / Sekiro ===
    "إيشين قديس السيف": {
        name: "تقنية البرق",
        emoji: "⚡",
        chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.2)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); // البرق يسبب شلل
                log.push(`⚡ **إيشين** صعق **${target.name}** بالبرق وشل حركته!`); 
            }
        }
    },
    "النامليس كينج": {
        name: "عاصفة الرعد",
        emoji: "🌩️",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.1)); });
            log.push(`🌩️ **الملك المجهول** استدعى العاصفة!`);
        }
    },
    "أرتورياس، سائر الهاوية": {
        name: "شقلبة الهاوية",
        emoji: "🤸",
        chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); monster.atk = Math.floor(monster.atk * 1.1); log.push(`🌑 **أرتورياس** سحق **${target.name}** وازداد غضباً!`); }
        }
    },
    "سول أوف سيندر": {
        name: "كومبو السيف الملتوي",
        emoji: "🔥",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.3), turns:2}); log.push(`🔥 **روح الرماد** أحرق **${target.name}**!`); }
        }
    },
    "مانوس أبو الهاوية": {
        name: "وابل الظلام (Dark Bead)",
        emoji: "⚫",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 1.6)); p.effects.push({ type: 'blind', val: 0.5, turns: 2 }); } });
            log.push(`⚫ **مانوس** أطلق سحر **وابل الظلام**! (ضرر + عمى)`);
        }
    },

    // === Final Fantasy ===
    "سيفيروث": {
        name: "سوبر نوفا",
        emoji: "🌌",
        chance: 0.15,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { const dmg = Math.floor(p.hp * 0.5); applyDamageToPlayer(p, dmg); p.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); } });
            log.push(`🌌 **سيفيروث** دمر النظام الشمسي بـ **سوبر نوفا**! (HP -50%)`);
        }
    },

    // === DMC ===
    "فيرجل، العاصفة المقتربة": {
        name: "Judgment Cut End",
        emoji: "⚔️",
        chance: 0.20,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.3)); });
            log.push(`⚔️ **فيرجل** قطع الزمان والمكان!`);
        }
    },
    "دانتي صائد الشياطين": {
        name: "Devil Trigger",
        emoji: "😈",
        chance: 0.20,
        execute: (monster, players, log) => {
            monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(monster.maxHp * 0.15));
            monster.atk = Math.floor(monster.atk * 1.25);
            log.push(`😈 **دانتي** فعل **Devil Trigger**! (شفاء + زيادة هجوم)`);
        }
    },
    "نيمسيس": {
        name: "قاذف الصواريخ",
        emoji: "🚀",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); log.push(`🚀 **نيمسيس** أطلق صاروخاً على **${target.name}**!`); }
        }
    },
    "ويسكر المتحول": {
        name: "انتقال فوري",
        emoji: "🕶️",
        chance: 0.30,
        execute: (monster, players, log) => {
            const alive = players.filter(p => !p.isDead);
            if(alive.length === 0) return;
            const target = alive.sort((a,b) => b.atk - a.atk)[0]; 
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                // 🔥 تم الإصلاح: Stun بدلاً من skipCount
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🕶️ **ويسكر** باغث **${target.name}** وشل حركته!`); 
            }
        }
    },
    "بيراميد هيد": {
        name: "حكم الإعدام",
        emoji: "🔪",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:3}); log.push(`🔪 **بيراميد هيد** شق **${target.name}** بسكينه العظيم! (نزيف)`); }
        }
    },

    // === WoW / Diablo ===
    "آرثاس، الليتش كينج": {
        name: "غضب فروستمورن",
        emoji: "❄️",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); // تجميد = شلل
                log.push(`❄️ **آرثاس** جمد **${target.name}** بالكامل!`); 
            }
        }
    },
    "إليدان ستورمريج": {
        name: "أشعة العين (Eye Beam)",
        emoji: "🟢",
        chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.2)); });
            log.push(`🟢 **إليدان** أحرق الجميع بأشعة الفيل!`);
        }
    },
    "ديث وينج المدمر": {
        name: "كتاكليزم",
        emoji: "🔥",
        chance: 0.10,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 2)); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.3), turns: 5 }); } });
            log.push(`🔥 **ديث وينج** أحرق العالم! (ضرر هائل + حرق)`);
        }
    },
    "ديابلو سيد الرعب": {
        name: "برق الجحيم الأحمر",
        emoji: "🔴",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'confusion', val:0.3, turns:2}); } });
            log.push(`🔴 **ديابلو** بث الرعب في القلوب!`);
        }
    },
    "باعل سيد الدمار": {
        name: "نسخة الظل",
        emoji: "👥",
        chance: 0.20,
        execute: (monster, players, log) => {
            monster.effects.push({ type: 'evasion', val: 0.5, turns: 2 }); // 50% مراوغة
            log.push(`👥 **باعل** استدعى نسخة، مما جعل إصابته صعبة!`);
        }
    },
    "ميفيستو سيد الكراهية": {
        name: "نوفا السموم",
        emoji: "☠️",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) p.effects.push({type:'poison', val: Math.floor(monster.atk*0.4), turns:3}); });
            log.push(`☠️ **ميفيستو** أطلق موجة سموم قاتلة!`);
        }
    },
    "الملك تيرانيوس": {
        name: "زئير مرعب",
        emoji: "🦖",
        chance: 0.30,
        execute: (monster, players, log) => {
            // 🔥 تم الإصلاح: Stun بدلاً من skipCount
            players.forEach(p => { 
                if(!p.isDead && Math.random()<0.5) {
                    p.effects.push({ type: 'stun', val: 1, turns: 1 });
                }
            });
            log.push(`🦖 **تيرانيوس** زأر بقوة مرعبة! (شلل بسبب الخوف)`);
        }
    },

    // === God of War ===
    "زيوس جبار الصواعق": {
        name: "غضب الأولمب",
        emoji: "⚡",
        chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(t => { if(!t.isDead) applyDamageToPlayer(t, Math.floor(monster.atk * 1.2)); });
            log.push(`⚡ **زيوس** ألقى الصواعق على الجميع!`);
        }
    },
    "كريتوس شبح إسبارطة": {
        name: "غضب إسبارطة",
        emoji: "😡",
        chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 3.0)); log.push(`😡 **كريتوس** فقد أعصابه وانهال بالضرب على **${target.name}**!`); }
        }
    },

    // === Guardians (الحراس) ===
    "حارس البوابة الأخير": { name: "الدرع العظيم", emoji: "🛡️", chance: 0.3, execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحارس** رفع درعه وترمم!`); } },
    "درع العرش المنيع": { name: "عكس الضرر", emoji: "🔄", chance: 0.3, execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.5, turns:2}); l.push(`🔄 **درع العرش** فعل وضعية الانعكاس!`); } },
    "حامي الختم المقدس": { name: "تطهير", emoji: "✨", chance: 0.3, execute: (m,p,l) => { m.effects = []; m.hp += Math.floor(m.maxHp*0.05); l.push(`✨ **الحامي** طهر نفسه من اللعنات!`); } },
    "ظل الملك القاتل": { name: "اغتيال", emoji: "🗡️", chance: 0.3, execute: (m,p,l) => { const t=p.filter(x=>!x.isDead).sort((a,b)=>a.hp-b.hp)[0]; if(t){applyDamageToPlayer(t, Math.floor(m.atk*2)); l.push(`🗡️ **الظل** اغتال أضعف حلقة: **${t.name}**!`);} } },
    "الجنرال الذي لا يقهر": { name: "هجوم كاسح", emoji: "⚔️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*1.2))}); l.push(`⚔️ **الجنرال** نفذ هجوماً كاسحاً!`); } },
    "المدرع الأسطوري": { name: "تحطيم الأرض", emoji: "🔨", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk)}); l.push(`🔨 **المدرع** حطم الأرض تحتكم!`); } },
    "كابوس الأبعاد": { name: "رعب", emoji: "👻", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'confusion',val:0.5,turns:2})}); l.push(`👻 **الكابوس** بث الرعب في القلوب!`); } },
    "حارس الجحيم الأزلي": { name: "نفس اللهب", emoji: "🔥", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`🔥 **الحارس** نفث نيران الجحيم!`); } }
};

function getRandomMonster(type, theme) {
    let pool = [];
    if (type === 'boss') pool = dungeonConfig.monsters.bosses;
    else if (type === 'guardian') pool = dungeonConfig.monsters.guardians;
    else if (type === 'elite') pool = dungeonConfig.monsters.elites;
    else pool = dungeonConfig.monsters.minions;
      
    if (!pool || pool.length === 0) pool = dungeonConfig.monsters.minions;

    const name = pool[Math.floor(Math.random() * pool.length)];
    return { name, emoji: theme.emoji };
}

module.exports = {
    getSmartTarget,
    GENERIC_MONSTER_SKILLS,
    MONSTER_SKILLS,
    getRandomMonster
};
